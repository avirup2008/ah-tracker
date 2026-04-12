import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const feature = searchParams.get('feature') ?? 'all'

  try {
    const data: Record<string, unknown> = {}

    // ── A: Inflation tracker ─────────────────────────────────────
    if (feature === 'all' || feature === 'inflation') {
      const inflation = await sql`
        SELECT
          ri.clean_name,
          ri.category,
          MIN(ri.unit_price)  AS min_price,
          MAX(ri.unit_price)  AS max_price,
          -- First recorded price
          (
            SELECT ri2.unit_price FROM receipt_items ri2
            JOIN receipts r2 ON ri2.receipt_id = r2.id
            WHERE ri2.clean_name = ri.clean_name AND ri2.unit_price IS NOT NULL
            ORDER BY r2.receipt_date ASC LIMIT 1
          ) AS first_price,
          -- Most recent price
          (
            SELECT ri3.unit_price FROM receipt_items ri3
            JOIN receipts r3 ON ri3.receipt_id = r3.id
            WHERE ri3.clean_name = ri.clean_name AND ri3.unit_price IS NOT NULL
            ORDER BY r3.receipt_date DESC LIMIT 1
          ) AS latest_price,
          COUNT(DISTINCT ri.receipt_id) AS purchase_count
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ri.unit_price IS NOT NULL
          AND ri.is_statiegeld = false
          AND ri.is_koopzegel  = false
          AND ri.clean_name    IS NOT NULL
          AND r.parsed = true
        GROUP BY ri.clean_name, ri.category
        HAVING COUNT(DISTINCT ri.receipt_id) >= 3  -- only items bought 3+ times
        ORDER BY (
          (
            SELECT ri3.unit_price FROM receipt_items ri3
            JOIN receipts r3 ON ri3.receipt_id = r3.id
            WHERE ri3.clean_name = ri.clean_name AND ri3.unit_price IS NOT NULL
            ORDER BY r3.receipt_date DESC LIMIT 1
          ) -
          (
            SELECT ri2.unit_price FROM receipt_items ri2
            JOIN receipts r2 ON ri2.receipt_id = r2.id
            WHERE ri2.clean_name = ri.clean_name AND ri2.unit_price IS NOT NULL
            ORDER BY r2.receipt_date ASC LIMIT 1
          )
        ) DESC NULLS LAST
        LIMIT 15
      `
      data.inflation = inflation.map((row: Record<string, unknown>) => ({
        ...row,
        pct_change: row.first_price && row.latest_price
          ? Math.round(((Number(row.latest_price) - Number(row.first_price)) / Number(row.first_price)) * 100)
          : null,
      }))
    }

    // ── B: Brand switching detector ──────────────────────────────
    if (feature === 'all' || feature === 'brand-switch') {
      const brandSwitch = await sql`
        SELECT
          ri.category,
          -- Detect AH own brand vs A-brand purchases
          SUM(CASE WHEN ri.raw_name LIKE 'AH %' THEN ri.total_price ELSE 0 END) AS own_brand_spend,
          SUM(CASE WHEN ri.raw_name NOT LIKE 'AH %' THEN ri.total_price ELSE 0 END) AS abrand_spend,
          COUNT(CASE WHEN ri.raw_name LIKE 'AH %' THEN 1 END) AS own_brand_count,
          COUNT(CASE WHEN ri.raw_name NOT LIKE 'AH %' THEN 1 END) AS abrand_count
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE r.parsed = true
          AND ri.is_non_food = false
          AND ri.is_statiegeld = false
          AND ri.is_koopzegel = false
          AND ri.category IS NOT NULL
        GROUP BY ri.category
        HAVING COUNT(CASE WHEN ri.raw_name LIKE 'AH %' THEN 1 END) > 0
           AND COUNT(CASE WHEN ri.raw_name NOT LIKE 'AH %' THEN 1 END) > 0
        ORDER BY abrand_spend DESC
        LIMIT 10
      `
      data.brandSwitch = brandSwitch
    }

    // ── C: Waste predictor ───────────────────────────────────────
    if (feature === 'all' || feature === 'waste') {
      // Flag perishable items bought frequently but in single-item shops
      const waste = await sql`
        SELECT
          ri.clean_name,
          ri.category,
          COUNT(DISTINCT ri.receipt_id) AS purchase_count,
          SUM(ri.quantity * ri.unit_price) AS total_spent,
          AVG(ri.quantity) AS avg_qty,
          -- How many of these purchases were in a shop with < 5 items?
          SUM(CASE WHEN r.item_count < 5 THEN 1 ELSE 0 END) AS small_shop_count
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ri.is_statiegeld = false
          AND ri.is_koopzegel = false
          AND ri.clean_name IS NOT NULL
          AND r.parsed = true
          AND ri.category IN ('Groente & Fruit', 'Zuivel & Eieren', 'Vlees & Vis', 'Brood & Bakkerij')
        GROUP BY ri.clean_name, ri.category
        HAVING COUNT(DISTINCT ri.receipt_id) >= 4
        ORDER BY purchase_count DESC
        LIMIT 10
      `
      data.waste = waste
    }

    // ── D: Seasonality (month-over-month price) ──────────────────
    if (feature === 'all' || feature === 'seasonality') {
      const seasonality = await sql`
        SELECT
          ri.clean_name,
          ri.category,
          r.month,
          AVG(ri.unit_price) AS avg_price,
          COUNT(*) AS purchases
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ri.unit_price IS NOT NULL
          AND ri.clean_name IS NOT NULL
          AND r.parsed = true
          AND ri.is_statiegeld = false
          AND ri.is_koopzegel = false
        GROUP BY ri.clean_name, ri.category, r.month
        HAVING COUNT(*) >= 1
        ORDER BY ri.clean_name, r.month
      `
      data.seasonality = seasonality
    }

    // ── E: Deal matcher (recent bonus items) ─────────────────────
    if (feature === 'all' || feature === 'deals') {
      const deals = await sql`
        SELECT
          ri.clean_name,
          ri.raw_name,
          ri.category,
          COUNT(*) AS bonus_purchases,
          AVG(ri.unit_price) AS avg_bonus_price,
          MAX(r.receipt_date) AS last_bought
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ri.is_bonus_item = true
          AND r.parsed = true
        GROUP BY ri.clean_name, ri.raw_name, ri.category
        ORDER BY bonus_purchases DESC
        LIMIT 20
      `
      data.frequentDealItems = deals
    }

    // ── F: Spend anomaly detector ────────────────────────────────
    if (feature === 'all' || feature === 'anomaly') {
      const weekly = await sql`
        SELECT
          week_saturday,
          SUM(net_grocery_spend) AS total_spend,
          COUNT(*) AS receipt_count
        FROM receipts
        WHERE parsed = true
        GROUP BY week_saturday
        ORDER BY week_saturday ASC
      `

      const spends = weekly.map((w: Record<string, unknown>) => Number(w.total_spend))
      const avg = spends.reduce((a, b) => a + b, 0) / spends.length
      const stddev = Math.sqrt(spends.map(s => (s - avg) ** 2).reduce((a, b) => a + b, 0) / spends.length)

      data.anomaly = {
        weeklySpend: weekly,
        average: Math.round(avg * 100) / 100,
        stddev: Math.round(stddev * 100) / 100,
        anomalies: weekly.filter((w: Record<string, unknown>) => Number(w.total_spend) > avg + stddev),
      }
    }

    // ── H: Budget forecast ───────────────────────────────────────
    if (feature === 'all' || feature === 'forecast') {
      const currentMonth = new Date().getMonth() + 1
      const currentYear = new Date().getFullYear()
      const today = new Date().getDate()
      const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()

      const thisMonth = await sql`
        SELECT
          SUM(net_grocery_spend) AS spent_so_far,
          COUNT(*) AS receipt_count
        FROM receipts
        WHERE parsed = true
          AND year = ${currentYear}
          AND month = ${currentMonth}
      `

      const spentSoFar = Number(thisMonth[0]?.spent_so_far ?? 0)
      const dailyRate = spentSoFar / today
      const projected = dailyRate * daysInMonth
      const monthlyTarget = 90 * 4.33 // weekly × avg weeks

      data.forecast = {
        spentSoFar,
        projected: Math.round(projected * 100) / 100,
        monthlyTarget: Math.round(monthlyTarget * 100) / 100,
        onTrack: projected <= monthlyTarget,
        remainingDays: daysInMonth - today,
        dailyBudgetRemaining: Math.max(0, (monthlyTarget - spentSoFar) / (daysInMonth - today)),
      }
    }

    // ── Category breakdown ───────────────────────────────────────
    if (feature === 'all' || feature === 'categories') {
      const period = searchParams.get('period') ?? 'all'
      let catRows

      if (period === 'month') {
        const yr = new Date().getFullYear()
        const mo = new Date().getMonth() + 1
        catRows = await sql`
          SELECT
            ri.category,
            SUM(ri.total_price)  AS total,
            COUNT(*)             AS item_count
          FROM receipt_items ri
          JOIN receipts r ON ri.receipt_id = r.id
          WHERE r.parsed = true
            AND r.year = ${yr} AND r.month = ${mo}
            AND ri.is_koopzegel = false
            AND ri.is_statiegeld = false
            AND ri.category IS NOT NULL
          GROUP BY ri.category
          ORDER BY total DESC
        `
      } else {
        catRows = await sql`
          SELECT
            ri.category,
            SUM(ri.total_price)  AS total,
            COUNT(*)             AS item_count
          FROM receipt_items ri
          JOIN receipts r ON ri.receipt_id = r.id
          WHERE r.parsed = true
            AND ri.is_koopzegel = false
            AND ri.is_statiegeld = false
            AND ri.category IS NOT NULL
          GROUP BY ri.category
          ORDER BY total DESC
        `
      }
      data.categories = catRows
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
