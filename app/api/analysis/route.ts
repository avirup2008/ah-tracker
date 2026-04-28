import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { MONTHLY_TARGET } from '@/lib/budget-constants'
import { getBudgetPeriod } from '@/lib/budget-period'
import { buildSubstitutionRecommendations, getInflationInsights, getProductCatalog } from '@/lib/product-intelligence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function plain(v: any): any {
  return JSON.parse(JSON.stringify(v, (_k, val) =>
    val instanceof Date ? val.toISOString().slice(0, 10) : val
  ))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const feature = searchParams.get('feature') ?? 'all'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {}

  try {

    // ── A: Inflation ───────────────────────────────────────────
    if (feature === 'all' || feature === 'inflation') {
      data.inflation = await getInflationInsights(20)
    }

    // ── B: Brand switching ─────────────────────────────────────
    if (feature === 'all' || feature === 'brand-switch' || feature === 'brand') {
      // Use real Gemini categories — no keyword guessing, no Overig bucket
      const rows = await sql`
        SELECT
          ri.category,
          ROUND(SUM(CASE WHEN (COALESCE(ri.is_own_brand, false) OR ri.raw_name LIKE 'AH %' OR ri.raw_name LIKE 'ALBERT HEIJN %')
            THEN ri.total_price ELSE 0 END)::numeric, 2)          AS own_brand_spend,
          ROUND(SUM(CASE WHEN NOT (COALESCE(ri.is_own_brand, false) OR ri.raw_name LIKE 'AH %' OR ri.raw_name LIKE 'ALBERT HEIJN %')
            THEN ri.total_price ELSE 0 END)::numeric, 2)          AS abrand_spend,
          COUNT(CASE WHEN (COALESCE(ri.is_own_brand, false) OR ri.raw_name LIKE 'AH %' OR ri.raw_name LIKE 'ALBERT HEIJN %') THEN 1 END)         AS own_brand_count,
          COUNT(CASE WHEN NOT (COALESCE(ri.is_own_brand, false) OR ri.raw_name LIKE 'AH %' OR ri.raw_name LIKE 'ALBERT HEIJN %') THEN 1 END)     AS abrand_count
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE r.parsed = true
          AND ri.raw_name NOT IN ('SUBTOTAAL','KOOPZEGELS')
          AND ri.is_statiegeld = false AND ri.is_koopzegel = false
          AND ri.category IS NOT NULL
        GROUP BY ri.category
        HAVING
          SUM(CASE WHEN (COALESCE(ri.is_own_brand, false) OR ri.raw_name LIKE 'AH %' OR ri.raw_name LIKE 'ALBERT HEIJN %') THEN ri.total_price ELSE 0 END) > 0
          AND SUM(CASE WHEN NOT (COALESCE(ri.is_own_brand, false) OR ri.raw_name LIKE 'AH %' OR ri.raw_name LIKE 'ALBERT HEIJN %') THEN ri.total_price ELSE 0 END) > 0
        ORDER BY SUM(CASE WHEN NOT (COALESCE(ri.is_own_brand, false) OR ri.raw_name LIKE 'AH %' OR ri.raw_name LIKE 'ALBERT HEIJN %') THEN ri.total_price ELSE 0 END) DESC
        LIMIT 10
      `
      data.brandSwitch = plain(rows)

      // Specific switch recommendations — A-brand items bought 3+ times
      const switchRows = await sql`
        SELECT
          ri.raw_name,
          COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name) AS clean_name,
          ri.category,
          COUNT(DISTINCT ri.receipt_id)             AS times,
          ROUND(AVG(ri.unit_price)::numeric, 2)     AS avg_price
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE NOT (COALESCE(ri.is_own_brand, false) OR ri.raw_name LIKE 'AH %' OR ri.raw_name LIKE 'ALBERT HEIJN %')
          AND ri.is_statiegeld = false AND ri.is_koopzegel = false
          AND ri.raw_name NOT IN ('SUBTOTAAL','KOOPZEGELS')
          AND ri.category IS NOT NULL
          AND ri.unit_price > 1
          AND r.parsed = true
        GROUP BY ri.raw_name, COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name), ri.category
        HAVING COUNT(DISTINCT ri.receipt_id) >= 3
        ORDER BY (COUNT(DISTINCT ri.receipt_id) * AVG(ri.unit_price)) DESC
        LIMIT 12
      `
      data.switchItems = plain(switchRows)
      data.substitutions = await buildSubstitutionRecommendations(12)
      data.productCatalog = (await getProductCatalog(80)).slice(0, 12)
    }

    // ── C: Waste predictor ─────────────────────────────────────
    if (feature === 'all' || feature === 'waste') {
      const rows = await sql`
        SELECT
          COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name) AS clean_name,
          ri.category,
          COUNT(DISTINCT ri.receipt_id)                       AS purchase_count,
          ROUND(SUM(ri.quantity * ri.unit_price)::numeric, 2) AS total_spent,
          ROUND(AVG(ri.quantity)::numeric, 1)                 AS avg_qty,
          SUM(CASE WHEN r.item_count < 5 THEN 1 ELSE 0 END)  AS small_shop_count
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE r.parsed = true
          AND ri.raw_name NOT IN ('SUBTOTAAL','KOOPZEGELS')
          AND ri.is_statiegeld = false AND ri.is_koopzegel = false
          AND ri.unit_price IS NOT NULL
        GROUP BY COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name), ri.category
        HAVING COUNT(DISTINCT ri.receipt_id) >= 4
        ORDER BY purchase_count DESC
        LIMIT 12
      `
      data.waste = plain(rows)
    }

    // ── D: Seasonality ─────────────────────────────────────────
    if (feature === 'all' || feature === 'seasonality') {
      const rows = await sql`
        SELECT
          COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name) AS clean_name,
          ri.category,
          r.month,
          ROUND(AVG(ri.unit_price)::numeric, 2) AS avg_price,
          COUNT(*)                              AS purchases
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ri.unit_price IS NOT NULL AND r.parsed = true
          AND ri.raw_name NOT IN ('SUBTOTAAL','KOOPZEGELS')
          AND ri.is_statiegeld = false AND ri.is_koopzegel = false
        GROUP BY COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name), ri.category, r.month
        ORDER BY COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name), r.month
      `
      data.seasonality = plain(rows)
    }

    // ── E: Frequent bonus deal items ───────────────────────────
    if (feature === 'all' || feature === 'deals') {
      const rows = await sql`
        SELECT
          COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name) AS clean_name,
          ri.raw_name,
          ri.category,
          COUNT(*)                               AS bonus_purchases,
          ROUND(AVG(ri.unit_price)::numeric, 2)  AS avg_bonus_price,
          TO_CHAR(MAX(r.receipt_date), 'YYYY-MM-DD') AS last_bought
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE ri.is_bonus_item = true AND r.parsed = true
        GROUP BY COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name), ri.raw_name, ri.category
        ORDER BY bonus_purchases DESC
        LIMIT 20
      `
      data.frequentDealItems = plain(rows)
    }

    // ── F: Spend anomaly ───────────────────────────────────────
    if (feature === 'all' || feature === 'anomaly') {
      const rows = await sql`
        SELECT
          TO_CHAR(week_saturday, 'YYYY-MM-DD')       AS week_saturday,
          ROUND(SUM(net_grocery_spend)::numeric, 2)  AS total_spend,
          COUNT(*)                                   AS receipt_count
        FROM receipts
        WHERE parsed = true
        GROUP BY week_saturday
        ORDER BY week_saturday ASC
      `
      const spends = rows.map((w: Record<string, unknown>) => Number(w.total_spend))
      const avg = spends.length ? spends.reduce((a, b) => a + b, 0) / spends.length : 0
      const stddev = spends.length
        ? Math.sqrt(spends.map(s => (s - avg) ** 2).reduce((a, b) => a + b, 0) / spends.length)
        : 0
      const plainRows = plain(rows)
      data.anomaly = {
        weeklySpend: plainRows,
        average:    Math.round(avg    * 100) / 100,
        stddev:     Math.round(stddev * 100) / 100,
        anomalies:  plainRows.filter((w: Record<string, unknown>) => Number(w.total_spend) > avg + stddev),
      }
    }

    // ── H: Budget forecast ─────────────────────────────────────
    if (feature === 'all' || feature === 'forecast') {
      const period = getBudgetPeriod(new Date())
      const rows = await sql`
        SELECT COALESCE(SUM(net_grocery_spend), 0) AS spent_so_far
        FROM receipts
        WHERE parsed = true
          AND receipt_date >= ${period.startDate}::date
          AND receipt_date < ${period.endDate}::date
      `
      const spent     = Number(rows[0]?.spent_so_far ?? 0)
      const projected = Math.round((spent / Math.max(1, period.elapsedDays)) * period.totalDays * 100) / 100
      data.forecast = {
        spentSoFar:           spent,
        projected,
        monthlyTarget:        MONTHLY_TARGET,
        onTrack:              projected <= MONTHLY_TARGET,
        remainingDays:        period.remainingDays,
        dailyBudgetRemaining: Math.max(0, Math.round(((MONTHLY_TARGET - spent) / Math.max(1, period.remainingDays)) * 100) / 100),
        periodStart:          period.startDate,
        periodEnd:            period.endDate,
      }
    }

    // ── Categories ─────────────────────────────────────────────
    if (feature === 'all' || feature === 'categories') {
      const period = searchParams.get('period') ?? 'all'
      const budgetPeriod = getBudgetPeriod(new Date())
      const rows = period === 'month'
        ? await sql`
            SELECT ri.category,
              ROUND(SUM(ri.total_price)::numeric, 2) AS total,
              COUNT(*) AS item_count
            FROM receipt_items ri JOIN receipts r ON ri.receipt_id = r.id
            WHERE r.parsed = true
              AND r.receipt_date >= ${budgetPeriod.startDate}::date
              AND r.receipt_date < ${budgetPeriod.endDate}::date
              AND ri.is_koopzegel = false AND ri.is_statiegeld = false
              AND ri.category IS NOT NULL
            GROUP BY ri.category ORDER BY total DESC`
        : await sql`
            SELECT ri.category,
              ROUND(SUM(ri.total_price)::numeric, 2) AS total,
              COUNT(*) AS item_count
            FROM receipt_items ri JOIN receipts r ON ri.receipt_id = r.id
            WHERE r.parsed = true
              AND ri.is_koopzegel = false AND ri.is_statiegeld = false
              AND ri.category IS NOT NULL
            GROUP BY ri.category ORDER BY total DESC`
      data.categories = plain(rows)
    }

    return NextResponse.json(data)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Analysis error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
