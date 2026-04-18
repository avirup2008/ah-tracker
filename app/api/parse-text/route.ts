import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { parseReceiptText } from '@/lib/parser'
import { categoriseItems } from '@/lib/ai'
import { buildNormalizedItemFields } from '@/lib/normalization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { receiptId, rawText, skipCategorisation } = await req.json() as {
      receiptId: number
      rawText: string
      skipCategorisation?: boolean
    }

    if (!receiptId || !rawText) {
      return NextResponse.json({ error: 'receiptId and rawText required' }, { status: 400 })
    }

    // Parse receipt structure from text
    const parsed = parseReceiptText(rawText, rawText)
    if (!parsed) {
      await sql`UPDATE receipts SET parse_error='Could not parse structure', updated_at=NOW() WHERE id=${receiptId}`
      return NextResponse.json({ status: 'parse_error' })
    }

    // Try Gemini categorisation — gracefully skip on rate limit
    let categorised: Awaited<ReturnType<typeof categoriseItems>> = []
    let categorisationSkipped = false

    if (!skipCategorisation && parsed.items.length > 0) {
      try {
        categorised = await categoriseItems(parsed.items)
      } catch (catErr) {
        const msg = catErr instanceof Error ? catErr.message : ''
        if (msg.includes('429') || msg.includes('quota') || msg.includes('rate')) {
          categorisationSkipped = true
          // Continue without categories — will categorise later
        } else {
          throw catErr // re-throw non-quota errors
        }
      }
    }

    // Save receipt totals
    await sql`
      UPDATE receipts SET
        item_count        = ${parsed.itemCount},
        subtotal          = ${parsed.subtotal},
        bonus_savings     = ${parsed.bonusSavings},
        koopzegels        = ${parsed.koopzegels},
        statiegeld        = ${parsed.statiegeld},
        net_grocery_spend = ${parsed.netGrocerySpend},
        total_paid        = ${parsed.totalPaid},
        payment_method    = ${parsed.paymentMethod},
        raw_text          = ${rawText},
        parsed            = true,
        parse_error       = null,
        reviewed_at       = null,
        updated_at        = NOW()
      WHERE id = ${receiptId}
    `

    // Save line items (with or without categories)
    await sql`DELETE FROM receipt_items WHERE receipt_id = ${receiptId}`

    for (const item of parsed.items) {
      const cat = categorised.find(c => c.rawName === item.rawName)
      const normalized = buildNormalizedItemFields(item.rawName, cat?.cleanName)
      await sql`
        INSERT INTO receipt_items (
          receipt_id, quantity, raw_name, clean_name, normalized_name,
          category, subcategory, unit_price, total_price,
          is_bonus_item, is_own_brand, is_statiegeld, is_koopzegel, is_non_food, btw_rate
        ) VALUES (
          ${receiptId}, ${item.quantity}, ${item.rawName},
          ${cat?.cleanName ?? null}, ${normalized.normalizedName}, ${cat?.category ?? null},
          ${cat?.subcategory ?? null}, ${item.unitPrice}, ${item.totalPrice},
          ${item.isBonusItem}, ${normalized.isOwnBrand}, ${item.isStatiegeld}, ${item.isKoopzegel},
          ${cat?.isNonFood ?? false}, ${cat?.btwRate ?? 9}
        )
      `
    }

    return NextResponse.json({
      status: 'parsed',
      itemCount: parsed.itemCount,
      total: parsed.totalPaid,
      bonusSavings: parsed.bonusSavings,
      categorisationSkipped,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
