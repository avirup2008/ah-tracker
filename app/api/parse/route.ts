import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { parseReceiptText } from '@/lib/parser'
import { categoriseItems } from '@/lib/ai'
import { buildNormalizedItemFields } from '@/lib/normalization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120 // parsing can take time for large batches

// Dynamically import pdf-parse to avoid edge runtime issues
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return data.text
}

async function fetchPdfBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function POST(req: NextRequest) {
  try {
    const { receiptIds } = await req.json() as { receiptIds: number[] }

    if (!receiptIds?.length) {
      return NextResponse.json({ error: 'No receipt IDs provided' }, { status: 400 })
    }

    const results = []

    for (const receiptId of receiptIds) {
      try {
        // Fetch receipt record
        const rows = await sql`
          SELECT id, filename, blob_url FROM receipts
          WHERE id = ${receiptId} AND parsed = false
        `
        if (!rows.length) {
          results.push({ id: receiptId, status: 'skipped' })
          continue
        }

        const receipt = rows[0]

        // Download PDF from Blob
        const buffer = await fetchPdfBuffer(receipt.blob_url)

        // Extract text
        const rawText = await extractPdfText(buffer)

        // Parse receipt structure
        const parsed = parseReceiptText(rawText, rawText)
        if (!parsed) {
          await sql`
            UPDATE receipts SET parse_error = 'Could not parse receipt structure', updated_at = NOW()
            WHERE id = ${receiptId}
          `
          results.push({ id: receiptId, status: 'parse_error' })
          continue
        }

        // Categorise items via Gemini
        const categorised = await categoriseItems(parsed.items)

        // Update receipt record
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

        // Insert line items
        if (parsed.items.length > 0) {
          // Delete any existing items first (idempotent)
          await sql`DELETE FROM receipt_items WHERE receipt_id = ${receiptId}`

          for (const item of parsed.items) {
            const cat = categorised.find(c => c.rawName === item.rawName)
            const normalized = buildNormalizedItemFields(item.rawName, cat?.cleanName)

            await sql`
              INSERT INTO receipt_items (
                receipt_id, quantity, raw_name, clean_name, normalized_name,
                category, subcategory,
                unit_price, total_price,
                is_bonus_item, is_own_brand, is_statiegeld, is_koopzegel,
                is_non_food, btw_rate
              ) VALUES (
                ${receiptId},
                ${item.quantity},
                ${item.rawName},
                ${cat?.cleanName ?? null},
                ${normalized.normalizedName},
                ${cat?.category ?? null},
                ${cat?.subcategory ?? null},
                ${item.unitPrice},
                ${item.totalPrice},
                ${item.isBonusItem},
                ${normalized.isOwnBrand},
                ${item.isStatiegeld},
                ${item.isKoopzegel},
                ${cat?.isNonFood ?? false},
                ${cat?.btwRate ?? 9}
              )
            `
          }
        }

        results.push({ id: receiptId, status: 'parsed', itemCount: parsed.itemCount })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        await sql`
          UPDATE receipts SET parse_error = ${msg}, updated_at = NOW()
          WHERE id = ${receiptId}
        `
        results.push({ id: receiptId, status: 'error', message: msg })
      }
    }

    return NextResponse.json({
      parsed: results.filter(r => r.status === 'parsed').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    })
  } catch (err) {
    console.error('Parse error:', err)
    return NextResponse.json({ error: 'Parse failed' }, { status: 500 })
  }
}

// GET — parse all unparsed receipts
export async function GET() {
  const unparsed = await sql`
    SELECT id FROM receipts WHERE parsed = false AND parse_error IS NULL
    ORDER BY receipt_date ASC
    LIMIT 20
  `

  if (!unparsed.length) {
    return NextResponse.json({ message: 'No unparsed receipts' })
  }

  const ids = unparsed.map((r: Record<string, unknown>) => r.id as number)

  // Delegate to POST handler
  const req = new Request(`${process.env.NEXT_PUBLIC_APP_URL}/api/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiptIds: ids }),
  })

  return POST(req as NextRequest)
}
