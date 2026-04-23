import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { getWeekSaturday } from '@/lib/parser'
import { buildNormalizedItemFields } from '@/lib/normalization'
import { format } from 'date-fns'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_CATEGORIES = new Set([
  'Vlees & Vis',
  'Zuivel & Eieren',
  'Groente & Fruit',
  'Brood & Bakkerij',
  'Pasta, Rijst & Granen',
  'Sauzen & Kruiden',
  'Maaltijden kant-en-klaar',
  'Snacks & Zoetwaren',
  'Dranken',
  'Bier & Wijn',
  'Huishoud',
  'Persoonlijke verzorging',
  'Overig non-food',
])

interface ReceiptItemInput {
  raw_name?: string
  clean_name?: string | null
  category?: string | null
  subcategory?: string | null
  quantity?: number
  unit_price?: number
  total_price?: number
  is_bonus_item?: boolean
  is_statiegeld?: boolean
  is_koopzegel?: boolean
  is_non_food?: boolean
  btw_rate?: number | null
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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function parseOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseOptionalCategory(value: unknown): string | null {
  const category = parseOptionalString(value)
  if (!category) return null
  return ALLOWED_CATEGORIES.has(category) ? category : null
}

function parseOptionalBtwRate(value: unknown): number | null {
  const rate = parseNumber(value, NaN)
  return rate === 9 || rate === 21 ? rate : null
}

function isIgnoredReceiptItem(rawName: string): boolean {
  return rawName.trim().toUpperCase() === 'SUBTOTAAL'
}

function parseReceiptDateInput(value: unknown): { date: Date; receiptDate: string } | null {
  const raw = parseOptionalString(value)
  if (!raw) return null

  const dateOnlyMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  const receiptDate = dateOnlyMatch?.[1]
  if (!receiptDate) return null

  const date = new Date(`${receiptDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null

  return { date, receiptDate }
}

function sanitizeItems(items: unknown): ReceiptItemInput[] {
  if (!Array.isArray(items)) return []

  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const entry = item as Record<string, unknown>
    const rawName = parseOptionalString(entry.raw_name)
    if (!rawName) return []
    if (isIgnoredReceiptItem(rawName)) return []

    const quantity = Math.max(0, parseNumber(entry.quantity, 1))
    const unitPrice = Math.max(0, parseNumber(entry.unit_price, 0))
    const totalPrice = Math.max(0, parseNumber(entry.total_price, unitPrice * quantity || unitPrice))

    return [{
      raw_name: rawName,
      clean_name: parseOptionalString(entry.clean_name),
      category: parseOptionalCategory(entry.category),
      subcategory: parseOptionalString(entry.subcategory),
      quantity: roundMoney(quantity),
      unit_price: roundMoney(unitPrice),
      total_price: roundMoney(totalPrice),
      is_bonus_item: Boolean(entry.is_bonus_item),
      is_statiegeld: Boolean(entry.is_statiegeld),
      is_koopzegel: Boolean(entry.is_koopzegel),
      is_non_food: Boolean(entry.is_non_food),
      btw_rate: parseOptionalBtwRate(entry.btw_rate),
    }]
  })
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  const receiptId = parseReceiptId(params.id)
  if (!receiptId) {
    return NextResponse.json({ error: 'Invalid receipt id' }, { status: 400 })
  }

  try {
    const [receiptRows, itemRows] = await Promise.all([
      sql`
        SELECT
          r.*,
          COALESCE(s.store_name, 'Unknown AH location') AS store_name
        FROM receipts r
        LEFT JOIN store_locations s ON r.store_id = s.store_id
        WHERE r.id = ${receiptId}
        LIMIT 1
      `,
      sql`
        SELECT *
        FROM receipt_items
        WHERE receipt_id = ${receiptId}
          AND raw_name <> 'SUBTOTAAL'
        ORDER BY id ASC
      `,
    ])

    if (!receiptRows.length) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    return NextResponse.json({
      receipt: receiptRows[0],
      items: itemRows,
    })
  } catch (err) {
    console.error('Receipt detail fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch receipt detail' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  const receiptId = parseReceiptId(params.id)
  if (!receiptId) {
    return NextResponse.json({ error: 'Invalid receipt id' }, { status: 400 })
  }

  try {
    const body = await req.json() as {
      receipt_date?: string
      store_id?: string | null
      payment_method?: string | null
      total_paid?: number
      bonus_savings?: number
      koopzegels?: number
      statiegeld?: number
      items?: unknown
    }

    const parsedDate = parseReceiptDateInput(body.receipt_date)
    if (!parsedDate) {
      return NextResponse.json({ error: 'receipt_date is required' }, { status: 400 })
    }
    const { date, receiptDate } = parsedDate

    const items = sanitizeItems(body.items)
    if (items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    const subtotal = roundMoney(
      items
        .filter((item) => !item.is_statiegeld && !item.is_koopzegel)
        .reduce((sum, item) => sum + (item.total_price ?? 0), 0)
    )
    const itemCount = items.filter((item) => !item.is_statiegeld && !item.is_koopzegel).length
    const bonusSavings = roundMoney(Math.max(0, parseNumber(body.bonus_savings, 0)))
    const koopzegels = roundMoney(Math.max(0, parseNumber(body.koopzegels, 0)))
    const statiegeld = roundMoney(Math.max(0, parseNumber(body.statiegeld, 0)))
    const totalPaid = roundMoney(Math.max(0, parseNumber(body.total_paid, subtotal + koopzegels + statiegeld)))
    const netGrocerySpend = roundMoney(Math.max(0, totalPaid - koopzegels - statiegeld))
    const weekSaturday = getWeekSaturday(date)
    const paymentMethod = parseOptionalString(body.payment_method) ?? 'Maestro'

    await sql`DELETE FROM receipt_items WHERE receipt_id = ${receiptId}`

    for (const item of items) {
      const normalized = buildNormalizedItemFields(item.raw_name ?? '', item.clean_name)
      await sql`
        INSERT INTO receipt_items (
          receipt_id, quantity, raw_name, clean_name, normalized_name,
          category, subcategory, unit_price, total_price,
          is_bonus_item, is_own_brand, is_statiegeld, is_koopzegel, is_non_food, btw_rate
        ) VALUES (
          ${receiptId},
          ${item.quantity ?? 1},
          ${item.raw_name ?? ''},
          ${item.clean_name ?? null},
          ${normalized.normalizedName},
          ${item.category ?? null},
          ${item.subcategory ?? null},
          ${item.unit_price ?? 0},
          ${item.total_price ?? 0},
          ${item.is_bonus_item ?? false},
          ${normalized.isOwnBrand},
          ${item.is_statiegeld ?? false},
          ${item.is_koopzegel ?? false},
          ${item.is_non_food ?? false},
          ${item.btw_rate ?? null}
        )
      `
    }

    await sql`
      UPDATE receipts
      SET
        store_id = ${parseOptionalString(body.store_id)},
        receipt_date = ${receiptDate},
        year = ${date.getFullYear()},
        month = ${date.getMonth() + 1},
        week_saturday = ${format(weekSaturday, 'yyyy-MM-dd')},
        item_count = ${itemCount},
        subtotal = ${subtotal},
        bonus_savings = ${bonusSavings},
        koopzegels = ${koopzegels},
        statiegeld = ${statiegeld},
        net_grocery_spend = ${netGrocerySpend},
        total_paid = ${totalPaid},
        payment_method = ${paymentMethod},
        parsed = true,
        parse_error = null,
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${receiptId}
    `

    return NextResponse.json({
      ok: true,
      receiptId,
      subtotal,
      totalPaid,
      netGrocerySpend,
      itemCount,
    })
  } catch (err) {
    console.error('Receipt update error:', err)
    return NextResponse.json({ error: 'Failed to update receipt' }, { status: 500 })
  }
}
