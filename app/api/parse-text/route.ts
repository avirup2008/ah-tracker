import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { parseReceiptText } from '@/lib/parser'
import { categoriseItems } from '@/lib/claude'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { receiptId, rawText } = await req.json() as {
      receiptId: number
      rawText: string
    }

    if (!receiptId || !rawText) {
      return NextResponse.json({ error: 'receiptId and rawText required' }, { status: 400 })
    }

    const parsed = parseReceiptText(rawText, rawText)
    if (!parsed) {
      await sql`UPDATE receipts SET parse_error='Could not parse structure', updated_at=NOW() WHERE id=${receiptId}`
      return NextResponse.json({ status: 'parse_error' })
    }

    const categorised = await categoriseItems(parsed.items)

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
        updated_at        = NOW()
      WHERE id = ${receiptId}
    `

    await sql`DELETE FROM receipt_items WHERE receipt_id = ${receiptId}`

    for (const item of parsed.items) {
      const cat = categorised.find(c => c.rawName === item.rawName)
      await sql`
        INSERT INTO receipt_items (
          receipt_id, quantity, raw_name, clean_name,
          category, subcategory, unit_price, total_price,
          is_bonus_item, is_statiegeld, is_koopzegel, is_non_food, btw_rate
        ) VALUES (
          ${receiptId}, ${item.quantity}, ${item.rawName},
          ${cat?.cleanName ?? null}, ${cat?.category ?? null},
          ${cat?.subcategory ?? null}, ${item.unitPrice}, ${item.totalPrice},
          ${item.isBonusItem}, ${item.isStatiegeld}, ${item.isKoopzegel},
          ${cat?.isNonFood ?? false}, ${cat?.btwRate ?? 9}
        )
      `
    }

    return NextResponse.json({
      status: 'parsed',
      itemCount: parsed.itemCount,
      total: parsed.totalPaid,
      bonusSavings: parsed.bonusSavings,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
