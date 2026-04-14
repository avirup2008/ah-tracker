import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Safely convert any value to plain JSON (no Date objects)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function plain(rows: any[]): any[] {
  return JSON.parse(JSON.stringify(rows, (_k, v) =>
    v instanceof Date ? v.toISOString().slice(0, 10) : v
  ))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const feature = searchParams.get('feature') ?? 'all'

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {}

    // ── A: Inflation — use raw_name OR clean_name ─────────────────
    if (feature === 'all' || feature === 'inflation') {
      const rows = await sql`
        SELECT
          COALESCE(ri.clean_name, ri.raw_name) AS clean_name,
          ri.category,
          COUNT(DISTINCT ri.receipt_id)         AS purchase_count,
          (SELECT ri2.unit_price
           FROM receipt_items ri2 JOIN receipts r2 ON ri2.receipt_id = r2.id
           WHERE COALESCE(ri2.clean_name, ri2.raw_name) = COALESCE(ri.clean_name, ri.raw_name)
             AND ri2.unit_price IS NOT NULL
           ORDER BY r2.receipt_date ASC LIMIT 1)  AS first_price,
          (SELECT ri3.unit_price
           FROM receipt_items ri3 JOIN receipts r3 ON ri3.receipt_id = r3.id
           WHERE COALESCE(ri3.clean_name, ri3.raw_name) = COALESCE(ri.clean_name, ri.raw_name)
             AND ri3.unit_price IS NOT NULL
           ORDER BY r3.receipt_date DESC LIMIT 1) AS latest_price
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ri.unit_price IS NOT NULL
          AND ri.is_statiegeld = false
          AND ri.is_koopzegel  = false
          AND ri.raw_name NOT IN ('SUBTOTAAL', 'KOOPZEGELS')
          AND r.parsed = true
        GROUP BY COALESCE(ri.clean_name, ri.raw_name), ri.category
        HAVING COUNT(DISTINCT ri.receipt_id) >= 3
        ORDER BY ABS(
          COALESCE((SELECT ri3.unit_price FROM receipt_items ri3
            JOIN receipts r3 ON ri3.receipt_id=r3.id
            WHERE COALESCE(ri3.clean_name,ri3.raw_name)=COALESCE(ri.clean_name,ri.raw_name)
            AND ri3.unit_price IS NOT NULL ORDER BY r3.receipt_date DESC LIMIT 1), 0)
          -
          COALESCE((SELECT ri2.unit_price FROM receipt_items ri2
            JOIN receipts r2 ON ri2.receipt_id=r2.id
            WHERE COALESCE(ri2.clean_name,ri2.raw_name)=COALESCE(ri.clean_name,ri.raw_name)
            AND ri2.unit_price IS NOT NULL ORDER BY r2.receipt_date ASC LIMIT 1), 0)
        ) DESC NULLS LAST
        LIMIT 15
      `
      data.inflation = plain(rows).map(row => ({
        ...row,
        pct_change: row.first_price && row.latest_price
          ? Math.round(((Number(row.latest_price) - Number(row.first_price)) / Number(row.first_price)) * 100)
          : null,
      }))
    }

    // ── B: Brand switching — AH own brand vs A-brand ─────────────
    if (feature === 'all' || feature === 'brand-switch') {
      // Group by category if available, else by first word of raw_name
      const rows = await sql`
        SELECT
          COALESCE(ri.category, split_part(ri.raw_name, ' ', 1)) AS category,
          SUM(CASE WHEN ri.raw_name LIKE 'AH %' THEN ri.total_price ELSE 0 END)  AS own_brand_spend,
          SUM(CASE WHEN ri.raw_name NOT LIKE 'AH %' THEN ri.total_price ELSE 0 END) AS abrand_spend,
          COUNT(CASE WHEN ri.raw_name LIKE 'AH %' THEN 1 END)  AS own_brand_count,
          COUNT(CASE WHEN ri.raw_name NOT LIKE 'AH %' THEN 1 END) AS abrand_count
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE r.parsed = true
          AND ri.is_statiegeld = false
          AND ri.is_koopzegel  = false
          AND ri.raw_name NOT IN ('SUBTOTAAL', 'KOOPZEGELS')
        GROUP BY COALESCE(ri.category, split_part(ri.raw_name, ' ', 1))
        HAVING COUNT(CASE WHEN ri.raw_name LIKE 'AH %' THEN 1 END) > 0
           AND COUNT(CASE WHEN ri.raw_name NOT LIKE 'AH %' THEN 1 END) > 0
        ORDER BY abrand_spend DESC
        LIMIT 10
      `
      data.brandSwitch = plain(rows)
    }

    // ── C: Waste predictor ───────────────────────────────────────
    if (feature === 'all' || feature === 'waste') {
      const rows = await sql`
        SELECT
          COALESCE(ri.clean_name, ri.raw_name) AS clean_name,
          ri.category,
          COUNT(DISTINCT ri.receipt_id) AS purchase_count,
          SUM(ri.quantity * ri.unit_price) AS total_spent,
          AVG(ri.quantity) AS avg_qty,
          SUM(CASE WHEN r.item_count < 5 THEN 1 ELSE 0 END) AS small_shop_count
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ri.is_statiegeld = false
          AND ri.is_koopzegel  = false
          AND ri.raw_name NOT IN ('SUBTOTAAL', 'KOOPZEGELS')
          AND r.parsed = true
          AND ri.unit_price IS NOT NULL
        GROUP BY COALESCE(ri.clean_name, ri.raw_name), ri.category
        HAVING COUNT(DISTINCT ri.receipt_id) >= 4
        ORDER BY purchase_count DESC
        LIMIT 10
      `
      data.waste = plain(rows)
    }

    // ── D: Seasonality ───────────────────────────────────────────
    if (feature === 'all' || feature === 'seasonality') {
      const rows = await sql`
        SELECT
          COALESCE(ri.clean_name, ri.raw_name) AS clean_name,
          ri.category,
          r.month,
          AVG(ri.unit_price) AS avg_price,
          COUNT(*) AS purchases
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ri.unit_price IS NOT NULL
          AND r.parsed = true
          AND ri.is_statiegeld = false
          AND ri.is_koopzegel  = false
        GROUP BY COALESCE(ri.clean_name, ri.raw_name), ri.category, r.month
        ORDER BY COALESCE(ri.clean_name, ri.raw_name), r.month
      `
      data.seasonality = plain(rows)
    }

    // ── E: Frequent bonus deal items ─────────────────────────────
    if (feature === 'all' || feature === 'deals') {
      const rows = await sql`
        SELECT
          COALESCE(ri.clean_name, ri.raw_name) AS clean_name,
          ri.raw_name,
          ri.category,
          COUNT(*) AS bonus_purchases,
          AVG(ri.unit_price) AS avg_bonus_price,
          TO_CHAR(MAX(r.receipt_date), 'YYYY-MM-DD') AS last_bought
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ri.is_bonus_item = true AND r.parsed = true
        GROUP BY COALESCE(ri.clean_name, ri.raw_name), ri.raw_name, ri.category
        ORDER BY bonus_purchases DESC
        LIMIT 20
      `
      data.frequentDealItems = plain(rows)
    }

    // ── F: Spend anomaly ─────────────────────────────────────────
    if (feature === 'all' || feature === 'anomaly') {
      const rows = await sql`
        SELECT
          TO_CHAR(week_saturday, 'YYYY-MM-DD') AS week_saturday,
          ROUND(SUM(net_grocery_spend)::numeric, 2) AS total_spend,
          COUNT(*) AS receipt_count
        FROM receipts WHERE parsed = true
        GROUP BY week_saturday ORDER BY week_saturday ASC
      `
      const spends = rows.map((w: Record<string, unknown>) => Number(w.total_spend))
      const avg = spends.length ? spends.reduce((a, b) => a + b, 0) / spends.length : 0
      const stddev = spends.length
        ? Math.sqrt(spends.map(s => (s - avg) ** 2).reduce((a, b) => a + b, 0) / spends.length)
        : 0
      data.anomaly = {
        weeklySpend: plain(rows),
        average:   Math.round(avg    * 100) / 100,
        stddev:    Math.round(stddev * 100) / 100,
        anomalies: plain(rows.filter((w: Record<string, unknown>) => Number(w.total_spend) > avg + stddev)),
      }
    }

    // ── H: Budget forecast ───────────────────────────────────────
    if (feature === 'all' || feature === 'forecast') {
      const currentMonth = new Date().getMonth() + 1
      const currentYear  = new Date().getFullYear()
      const today        = new Date().getDate()
      const daysInMonth  = new Date(currentYear, currentMonth, 0).getDate()

      const rows = await sql`
        SELECT COALESCE(SUM(net_grocery_spend), 0) AS spent_so_far
        FROM receipts WHERE parsed=true AND year=${currentYear} AND month=${currentMonth}
      `
      const spentSoFar   = Number(rows[0]?.spent_so_far ?? 0)
      const dailyRate    = today > 0 ? spentSoFar / today : 0
      const projected    = dailyRate * daysInMonth
      const monthlyTarget = 90 * 4.33

      data.forecast = {
        spentSoFar,
        projected:             Math.round(projected    * 100) / 100,
        monthlyTarget:         Math.round(monthlyTarget * 100) / 100,
        onTrack:               projected <= monthlyTarget,
        remainingDays:         daysInMonth - today,
        dailyBudgetRemaining:  Math.max(0, Math.round(((monthlyTarget - spentSoFar) / Math.max(1, daysInMonth - today)) * 100) / 100),
      }
    }

    // ── Categories ───────────────────────────────────────────────
    if (feature === 'all' || feature === 'categories') {
      const period = searchParams.get('period') ?? 'all'
      const yr = new Date().getFullYear()
      const mo = new Date().getMonth() + 1
      const rows = period === 'month'
        ? await sql`
            SELECT ri.category, SUM(ri.total_price) AS total, COUNT(*) AS item_count
            FROM receipt_items ri JOIN receipts r ON ri.receipt_id=r.id
            WHERE r.parsed=true AND r.year=${yr} AND r.month=${mo}
              AND ri.is_koopzegel=false AND ri.is_statiegeld=false AND ri.category IS NOT NULL
            GROUP BY ri.category ORDER BY total DESC`
        : await sql`
            SELECT ri.category, SUM(ri.total_price) AS total, COUNT(*) AS item_count
            FROM receipt_items ri JOIN receipts r ON ri.receipt_id=r.id
            WHERE r.parsed=true AND ri.is_koopzegel=false AND ri.is_statiegeld=false AND ri.category IS NOT NULL
            GROUP BY ri.category ORDER BY total DESC`
      data.categories = plain(rows)
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
