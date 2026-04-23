import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { categoriseItems } from '@/lib/ai'
import type { ParsedItem } from '@/lib/parser'
import { buildNormalizedItemFields } from '@/lib/normalization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface CategorisableRow {
  id: number
  raw_name: string
  quantity: number | string | null
  unit_price: number | string | null
  total_price: number | string | null
  is_bonus_item: boolean | null
  is_statiegeld: boolean | null
  is_koopzegel: boolean | null
}

function parseReceiptId(value: string): number | null {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function toParsedItem(row: CategorisableRow): ParsedItem {
  return {
    rawName: row.raw_name,
    quantity: parseNumber(row.quantity, 1),
    unitPrice: parseNumber(row.unit_price, 0),
    totalPrice: parseNumber(row.total_price, 0),
    isBonusItem: Boolean(row.is_bonus_item),
    isStatiegeld: Boolean(row.is_statiegeld),
    isKoopzegel: Boolean(row.is_koopzegel),
  }
}

export async function POST(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  const receiptId = parseReceiptId(params.id)
  if (!receiptId) {
    return NextResponse.json({ error: 'Invalid receipt id' }, { status: 400 })
  }

  try {
    const rows = await sql`
      SELECT
        id,
        raw_name,
        quantity,
        unit_price,
        total_price,
        is_bonus_item,
        is_statiegeld,
        is_koopzegel
      FROM receipt_items
      WHERE receipt_id = ${receiptId}
        AND raw_name <> 'SUBTOTAAL'
        AND is_statiegeld = false
        AND is_koopzegel = false
        AND (
          clean_name IS NULL
          OR category IS NULL
          OR btw_rate IS NULL
        )
      ORDER BY id ASC
      LIMIT 80
    ` as CategorisableRow[]

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        receiptId,
        total: 0,
        updated: 0,
        message: 'No uncategorised receipt items found',
      })
    }

    const categorisedItems = await categoriseItems(rows.map(toParsedItem))
    const categorisedByRawName = new Map<string, typeof categorisedItems>()
    for (const item of categorisedItems) {
      const items = categorisedByRawName.get(item.rawName) ?? []
      items.push(item)
      categorisedByRawName.set(item.rawName, items)
    }

    let updated = 0

    for (const row of rows) {
      const candidates = categorisedByRawName.get(row.raw_name) ?? []
      const categorised = candidates.shift()
      if (!categorised) continue

      const normalized = buildNormalizedItemFields(row.raw_name, categorised.cleanName)
      const result = await sql`
        UPDATE receipt_items
        SET
          clean_name = ${categorised.cleanName},
          normalized_name = ${normalized.normalizedName},
          category = ${categorised.category},
          subcategory = ${categorised.subcategory ?? null},
          is_non_food = ${categorised.isNonFood},
          is_own_brand = ${normalized.isOwnBrand},
          btw_rate = ${categorised.btwRate}
        WHERE id = ${row.id}
        RETURNING id
      `

      updated += result.length
    }

    await sql`
      UPDATE receipts
      SET updated_at = NOW()
      WHERE id = ${receiptId}
    `

    return NextResponse.json({
      ok: true,
      receiptId,
      total: rows.length,
      updated,
      message: updated > 0
        ? `Categorised ${updated} receipt item${updated === 1 ? '' : 's'}`
        : 'AI did not return usable categories for these items',
    })
  } catch (err) {
    console.error('Receipt categorisation error:', err)
    return NextResponse.json({ error: 'Failed to categorise receipt items' }, { status: 500 })
  }
}
