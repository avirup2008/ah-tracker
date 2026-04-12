import { Suspense } from 'react'
import sql from '@/lib/db'
import { BudgetCard } from '@/components/dashboard/BudgetCard'
import { SpendChart } from '@/components/dashboard/SpendChart'
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown'
import { InsightsPanel } from '@/components/dashboard/InsightsPanel'
import { RecentReceipts } from '@/components/dashboard/RecentReceipts'
import { InflationTracker } from '@/components/dashboard/InflationTracker'
import { MealPlanPreview } from '@/components/dashboard/MealPlanPreview'
import { CardSkeleton } from '@/components/ui/Skeletons'

export const revalidate = 300
export const dynamic = 'force-dynamic'

async function getDashboardData() {
  const [weekData, monthData, weeklyChart, recentReceipts, categories, inflation] =
    await Promise.all([
      // Current week
      sql`
        SELECT
          week_saturday,
          COUNT(*) AS receipt_count,
          COALESCE(SUM(net_grocery_spend), 0) AS total_spend,
          COALESCE(SUM(bonus_savings), 0)     AS total_savings,
          COALESCE(SUM(koopzegels), 0)        AS total_koopzegels
        FROM receipts
        WHERE parsed = true
          AND week_saturday = (
            SELECT week_saturday FROM receipts
            WHERE parsed = true ORDER BY receipt_date DESC LIMIT 1
          )
        GROUP BY week_saturday
      `,
      // Current month
      sql`
        SELECT
          year, month,
          COALESCE(SUM(net_grocery_spend), 0) AS total_spend,
          COALESCE(SUM(bonus_savings), 0)     AS total_savings,
          COUNT(*) AS receipt_count
        FROM receipts
        WHERE parsed = true
          AND year  = EXTRACT(YEAR  FROM NOW())
          AND month = EXTRACT(MONTH FROM NOW())
        GROUP BY year, month
      `,
      // Weekly chart data — last 16 weeks
      sql`
        SELECT
          week_saturday,
          COALESCE(SUM(net_grocery_spend), 0) AS total_spend,
          COUNT(*) AS receipt_count
        FROM receipts
        WHERE parsed = true
        GROUP BY week_saturday
        ORDER BY week_saturday DESC
        LIMIT 16
      `,
      // Recent receipts
      sql`
        SELECT r.*, COALESCE(s.store_name, 'Unknown AH location') AS store_name
        FROM receipts r
        LEFT JOIN store_locations s ON r.store_id = s.store_id
        WHERE r.parsed = true
        ORDER BY r.receipt_date DESC, r.receipt_time DESC
        LIMIT 6
      `,
      // Category breakdown this month
      sql`
        SELECT
          ri.category,
          SUM(ri.total_price) AS total,
          COUNT(*) AS item_count
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        WHERE r.parsed = true
          AND r.year  = EXTRACT(YEAR  FROM NOW())
          AND r.month = EXTRACT(MONTH FROM NOW())
          AND ri.is_koopzegel  = false
          AND ri.is_statiegeld = false
          AND ri.category IS NOT NULL
        GROUP BY ri.category
        ORDER BY total DESC
        LIMIT 7
      `,
      // Inflation — top movers
      sql`
        SELECT
          ri.clean_name,
          ri.category,
          MIN(CASE WHEN r.receipt_date = first_dates.min_date THEN ri.unit_price END) AS first_price,
          MIN(CASE WHEN r.receipt_date = last_dates.max_date  THEN ri.unit_price END) AS latest_price,
          COUNT(DISTINCT ri.receipt_id) AS purchase_count
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.id
        JOIN (
          SELECT clean_name, MIN(r2.receipt_date) AS min_date
          FROM receipt_items ri2 JOIN receipts r2 ON ri2.receipt_id = r2.id
          WHERE ri2.clean_name IS NOT NULL AND ri2.unit_price IS NOT NULL
          GROUP BY clean_name
        ) first_dates ON ri.clean_name = first_dates.clean_name
        JOIN (
          SELECT clean_name, MAX(r3.receipt_date) AS max_date
          FROM receipt_items ri3 JOIN receipts r3 ON ri3.receipt_id = r3.id
          WHERE ri3.clean_name IS NOT NULL AND ri3.unit_price IS NOT NULL
          GROUP BY clean_name
        ) last_dates ON ri.clean_name = last_dates.clean_name
        WHERE ri.unit_price IS NOT NULL AND ri.clean_name IS NOT NULL
          AND ri.is_statiegeld = false AND ri.is_koopzegel = false
          AND r.parsed = true
        GROUP BY ri.clean_name, ri.category
        HAVING COUNT(DISTINCT ri.receipt_id) >= 3
        ORDER BY ABS(
          COALESCE(MIN(CASE WHEN r.receipt_date = last_dates.max_date THEN ri.unit_price END), 0) -
          COALESCE(MIN(CASE WHEN r.receipt_date = first_dates.min_date THEN ri.unit_price END), 0)
        ) DESC NULLS LAST
        LIMIT 6
      `,
    ])

  // Total receipts count
  const totalCount = await sql`SELECT COUNT(*) AS count FROM receipts`

  return {
    week: weekData[0] ?? null,
    month: monthData[0] ?? null,
    weeklyChart: weeklyChart.reverse() as never[],
    recentReceipts: recentReceipts as never[],
    categories: categories as never[],
    inflation: inflation as never[],
    totalReceipts: parseInt(totalCount[0]?.count ?? '0'),
  }
}

async function getMealPlan() {
  try {
    const rows = await sql`
      SELECT * FROM meal_plans
      ORDER BY week_saturday DESC LIMIT 1
    `
    return rows[0] ?? null
  } catch { return null }
}

export default async function DashboardPage() {
  const [data, mealPlan] = await Promise.all([getDashboardData(), getMealPlan()])

  const weekSpend    = Number(data.week?.total_spend ?? 0)
  const weekSavings  = Number(data.week?.total_savings ?? 0)
  const weekReceipts = Number(data.week?.receipt_count ?? 0)
  const monthSpend   = Number(data.month?.total_spend ?? 0)
  const weekBudget   = 90
  const pctUsed      = Math.min(100, Math.round((weekSpend / weekBudget) * 100))

  return (
    <div className="flex flex-col gap-5">

      {/* ROW 1 — Budget + Chart */}
      <div className="grid grid-cols-[310px_1fr] gap-4">
        <BudgetCard
          weekSpend={weekSpend}
          weekBudget={weekBudget}
          weekSavings={weekSavings}
          weekReceipts={weekReceipts}
          monthSpend={monthSpend}
          pctUsed={pctUsed}
          totalReceipts={data.totalReceipts}
        />
        <Suspense fallback={<CardSkeleton />}>
          <SpendChart data={data.weeklyChart} weekBudget={weekBudget} />
        </Suspense>
      </div>

      {/* ROW 2 — Categories + Insights + Receipts */}
      <div className="grid grid-cols-3 gap-4">
        <CategoryBreakdown categories={data.categories} />
        <InsightsPanel
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          week={data.week as any}
          forecast={{
            monthSpend,
            target: weekBudget * 4.33,
          }}
        />
        <RecentReceipts receipts={data.recentReceipts} />
      </div>

      {/* ROW 3 — Inflation + Meal Plan */}
      <div className="grid grid-cols-2 gap-4">
        <InflationTracker items={data.inflation as any} />
        <MealPlanPreview mealPlan={mealPlan as any} />
      </div>

    </div>
  )
}
