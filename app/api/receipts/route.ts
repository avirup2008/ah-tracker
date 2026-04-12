import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const year   = searchParams.get('year')
  const month  = searchParams.get('month')
  const limit  = parseInt(searchParams.get('limit') ?? '50')
  const offset = parseInt(searchParams.get('offset') ?? '0')
  const view   = searchParams.get('view') ?? 'list' // list | summary | weekly

  try {
    if (view === 'summary') {
      // Monthly summary for charts
      const rows = await sql`
        SELECT
          year, month,
          COUNT(*)                              AS receipt_count,
          SUM(net_grocery_spend)                AS total_spend,
          SUM(bonus_savings)                    AS total_savings,
          SUM(koopzegels)                       AS total_koopzegels,
          AVG(net_grocery_spend)                AS avg_per_shop,
          MAX(net_grocery_spend)                AS max_shop,
          MIN(net_grocery_spend)                AS min_shop
        FROM receipts
        WHERE parsed = true
        GROUP BY year, month
        ORDER BY year ASC, month ASC
      `
      return NextResponse.json(rows)
    }

    if (view === 'weekly') {
      // Weekly spend for chart — last N weeks
      const weeks = parseInt(searchParams.get('weeks') ?? '16')
      const rows = await sql`
        SELECT
          week_saturday,
          COUNT(*)                AS receipt_count,
          SUM(net_grocery_spend)  AS total_spend,
          SUM(bonus_savings)      AS total_savings
        FROM receipts
        WHERE parsed = true
        ORDER BY week_saturday DESC
        LIMIT ${weeks}
      `
      return NextResponse.json(rows.reverse())
    }

    if (view === 'current-week') {
      // Current week stats
      const rows = await sql`
        SELECT
          week_saturday,
          COUNT(*)                AS receipt_count,
          SUM(net_grocery_spend)  AS total_spend,
          SUM(bonus_savings)      AS total_savings,
          SUM(koopzegels)         AS total_koopzegels
        FROM receipts
        WHERE parsed = true
          AND week_saturday = (
            SELECT week_saturday FROM receipts
            WHERE parsed = true
            ORDER BY receipt_date DESC
            LIMIT 1
          )
        GROUP BY week_saturday
      `
      return NextResponse.json(rows[0] ?? null)
    }

    // Default: list view with store join
    let rows
    if (year && month) {
      rows = await sql`
        SELECT
          r.*,
          COALESCE(s.store_name, 'Unknown AH location') AS store_name
        FROM receipts r
        LEFT JOIN store_locations s ON r.store_id = s.store_id
        WHERE r.year = ${parseInt(year)} AND r.month = ${parseInt(month)}
        ORDER BY r.receipt_date DESC, r.receipt_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else if (year) {
      rows = await sql`
        SELECT
          r.*,
          COALESCE(s.store_name, 'Unknown AH location') AS store_name
        FROM receipts r
        LEFT JOIN store_locations s ON r.store_id = s.store_id
        WHERE r.year = ${parseInt(year)}
        ORDER BY r.receipt_date DESC, r.receipt_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      rows = await sql`
        SELECT
          r.*,
          COALESCE(s.store_name, 'Unknown AH location') AS store_name
        FROM receipts r
        LEFT JOIN store_locations s ON r.store_id = s.store_id
        ORDER BY r.receipt_date DESC, r.receipt_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    const total = await sql`SELECT COUNT(*) AS count FROM receipts`

    return NextResponse.json({
      receipts: rows,
      total: parseInt(total[0].count),
      limit,
      offset,
    })
  } catch (err) {
    console.error('Receipts fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
  }
}
