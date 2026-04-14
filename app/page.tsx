import sql from '@/lib/db'
import dynamic from 'next/dynamic'
import { SpendChartClient } from '@/components/dashboard/SpendChartClient'
import { BudgetCard } from '@/components/dashboard/BudgetCard'
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown'
import { RecentReceipts } from '@/components/dashboard/RecentReceipts'
import { InflationTracker } from '@/components/dashboard/InflationTracker'
import { MealPlanPreview } from '@/components/dashboard/MealPlanPreview'
import { HealthStrip } from '@/components/dashboard/HealthStrip'
import { AiInsightsDashboard } from '@/components/dashboard/AiInsightsDashboard'

export const revalidate = 0
export const fetchCache = 'force-no-store'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function plain(rows: any[]): any[] {
  return JSON.parse(JSON.stringify(rows, (_k, v) =>
    v instanceof Date ? v.toISOString().slice(0,10) : v
  ))
}

async function getDashboardData() {
  const now = new Date()
  const yr  = now.getFullYear()
  const mo  = now.getMonth() + 1

  const [weekData, monthData, lastMonthData, weeklyChart, recentReceipts, categories, totalCount] =
    await Promise.all([
      sql`
        SELECT week_saturday, COUNT(*) AS receipt_count,
          COALESCE(SUM(net_grocery_spend),0) AS total_spend,
          COALESCE(SUM(bonus_savings),0)     AS total_savings
        FROM receipts WHERE parsed=true
          AND week_saturday = (
            SELECT week_saturday FROM receipts WHERE parsed=true
            ORDER BY receipt_date DESC LIMIT 1
          )
        GROUP BY week_saturday
      `,
      sql`
        SELECT COALESCE(SUM(net_grocery_spend),0) AS total_spend,
               COALESCE(SUM(bonus_savings),0)     AS total_savings,
               COUNT(*) AS receipt_count
        FROM receipts WHERE parsed=true
          AND year=${yr} AND month=${mo}
      `,
      sql`
        SELECT COALESCE(SUM(net_grocery_spend),0) AS total_spend
        FROM receipts WHERE parsed=true
          AND year=${mo===1?yr-1:yr} AND month=${mo===1?12:mo-1}
      `,
      sql`
        SELECT TO_CHAR(week_saturday,'YYYY-MM-DD') AS week_saturday,
               ROUND(SUM(net_grocery_spend)::numeric,2) AS total_spend,
               COUNT(*) AS receipt_count
        FROM receipts WHERE parsed=true
        GROUP BY week_saturday ORDER BY week_saturday DESC LIMIT 16
      `,
      sql`
        SELECT r.id, r.filename,
          TO_CHAR(r.receipt_date,'YYYY-MM-DD') AS receipt_date,
          r.store_id, r.item_count,
          r.net_grocery_spend, r.total_paid, r.bonus_savings,
          r.parsed, r.parse_error,
          COALESCE(s.store_name,'Unknown AH location') AS store_name
        FROM receipts r
        LEFT JOIN store_locations s ON r.store_id=s.store_id
        WHERE r.parsed=true
        ORDER BY r.receipt_date DESC, r.receipt_time DESC LIMIT 6
      `,
      sql`
        SELECT ri.category,
          ROUND(SUM(ri.total_price)::numeric,2) AS total,
          COUNT(*) AS item_count
        FROM receipt_items ri JOIN receipts r ON ri.receipt_id=r.id
        WHERE r.parsed=true AND r.year=${yr} AND r.month=${mo}
          AND ri.is_koopzegel=false AND ri.is_statiegeld=false
          AND ri.category IS NOT NULL
        GROUP BY ri.category ORDER BY total DESC LIMIT 7
      `,
      sql`SELECT COUNT(*) AS count FROM receipts`,
    ])

  const weekSpend    = Number(weekData[0]?.total_spend   ?? 0)
  const weekSavings  = Number(weekData[0]?.total_savings  ?? 0)
  const weekReceipts = Number(weekData[0]?.receipt_count  ?? 0)
  const monthSpend   = Number(monthData[0]?.total_spend   ?? 0)
  const lastMonthSpend = Number(lastMonthData[0]?.total_spend ?? 0)
  const WEEKLY_BUDGET  = 90
  const MONTHLY_TARGET = Math.round(WEEKLY_BUDGET * 4.33 * 100) / 100

  const today      = now.getDate()
  const daysInMo   = new Date(yr, mo, 0).getDate()
  const projected  = today > 0 ? Math.round((monthSpend / today) * daysInMo * 100) / 100 : 0
  const pctUsed    = Math.min(100, Math.round((weekSpend / WEEKLY_BUDGET) * 100))
  const moPct      = Math.min(100, Math.round((monthSpend / MONTHLY_TARGET) * 100))

  // Compute month-over-month delta
  const moDelta = lastMonthSpend > 0
    ? Math.round(((monthSpend - lastMonthSpend) / lastMonthSpend) * 100)
    : null

  return {
    weekSpend, weekSavings, weekReceipts, monthSpend, lastMonthSpend,
    projected, pctUsed, moPct, moDelta, WEEKLY_BUDGET, MONTHLY_TARGET,
    today, daysInMo,
    weeklyChart:    plain([...weeklyChart].reverse()),
    recentReceipts: plain(recentReceipts),
    categories:     plain(categories),
    totalReceipts:  parseInt(String(totalCount[0]?.count ?? '0')),
  }
}

async function getMealPlan() {
  try {
    const rows = await sql`SELECT * FROM meal_plans ORDER BY week_saturday DESC LIMIT 1`
    return rows[0] ? JSON.parse(JSON.stringify(rows[0])) : null
  } catch { return null }
}

export default async function DashboardPage() {
  const [data, mealPlan] = await Promise.all([getDashboardData(), getMealPlan()])

  return (
    <div className="flex flex-col gap-5">

      {/* ── Health strip ──────────────────────────────────────── */}
      <HealthStrip
        weekSpend={data.weekSpend}
        weekBudget={data.WEEKLY_BUDGET}
        monthSpend={data.monthSpend}
        projected={data.projected}
        monthlyTarget={data.MONTHLY_TARGET}
        moDelta={data.moDelta}
        lastMonthSpend={data.lastMonthSpend}
        today={data.today}
        daysInMo={data.daysInMo}
      />

      {/* ── Row 1 — Budget + Chart ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[310px_1fr] gap-4">
        <BudgetCard
          weekSpend={data.weekSpend}
          weekBudget={data.WEEKLY_BUDGET}
          weekSavings={data.weekSavings}
          weekReceipts={data.weekReceipts}
          monthSpend={data.monthSpend}
          pctUsed={data.pctUsed}
          totalReceipts={data.totalReceipts}
        />
        <SpendChartClient data={data.weeklyChart} weekBudget={data.WEEKLY_BUDGET} />
      </div>

      {/* ── Row 2 — AI Insights (full width) ──────────────────── */}
      <AiInsightsDashboard
        weekSpend={data.weekSpend}
        monthSpend={data.monthSpend}
        projected={data.projected}
        monthlyTarget={data.MONTHLY_TARGET}
        moDelta={data.moDelta}
      />

      {/* ── Row 3 — Categories + Recent Receipts ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <CategoryBreakdown categories={data.categories} />
        <RecentReceipts receipts={data.recentReceipts} />
      </div>

      {/* ── Row 4 — Inflation + Meal Plan ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <InflationTracker items={[] as any} />
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <MealPlanPreview mealPlan={mealPlan as any} />
      </div>

    </div>
  )
}
