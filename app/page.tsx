import sql from '@/lib/db'
import { SpendChartClient } from '@/components/dashboard/SpendChartClient'
import { BudgetCard } from '@/components/dashboard/BudgetCard'
import { CategoryBreakdown } from '@/components/dashboard/CategoryBreakdown'
import { RecentReceipts } from '@/components/dashboard/RecentReceipts'
import { InflationTracker } from '@/components/dashboard/InflationTracker'
import { MealPlanPreview } from '@/components/dashboard/MealPlanPreview'
import { HealthStrip } from '@/components/dashboard/HealthStrip'
import { AiInsightsDashboard } from '@/components/dashboard/AiInsightsDashboard'
import { ReviewQueueMonitor } from '@/components/dashboard/ReviewQueueMonitor'
import { BudgetAlertMonitor } from '@/components/dashboard/BudgetAlertMonitor'
import { AutomationCenter } from '@/components/dashboard/AutomationCenter'
import { reconcileMealPlan } from '@/lib/reconciliation'
import { getAutomationStatus, listAutomationStatusesWithDefinitions } from '@/lib/automation-status'
import { MONTHLY_TARGET, WEEKLY_BUDGET } from '@/lib/budget-constants'
import { getInflationInsights } from '@/lib/product-intelligence'
import Link from 'next/link'
import { formatEuro } from '@/lib/utils'

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

  const [weekData, monthData, lastMonthData, weeklyChart, recentReceipts, categories, inflation, totalCount] =
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
      getInflationInsights(6),
      sql`SELECT COUNT(*) AS count FROM receipts`,
    ])

  const weekSpend    = Number(weekData[0]?.total_spend   ?? 0)
  const weekSavings  = Number(weekData[0]?.total_savings  ?? 0)
  const weekReceipts = Number(weekData[0]?.receipt_count  ?? 0)
  const monthSpend   = Number(monthData[0]?.total_spend   ?? 0)
  const lastMonthSpend = Number(lastMonthData[0]?.total_spend ?? 0)

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
    inflation:      plain(inflation),
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
  const reconciliation = await reconcileMealPlan(mealPlan)
  const [reviewReminder, budgetReminder, automationStatuses] = await Promise.all([
    getAutomationStatus('review_queue_reminder'),
    getAutomationStatus('over_budget_alert'),
    listAutomationStatusesWithDefinitions(),
  ])
  const weekOver = data.weekSpend > data.WEEKLY_BUDGET
  const projectedOver = data.projected > data.MONTHLY_TARGET
  const currentWeekSaturday = data.weeklyChart.at(-1)?.week_saturday
  const weekLabel = currentWeekSaturday
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(currentWeekSaturday))
    : 'Current week'

  return (
    <div className="flex flex-col gap-6">
      <section
        className="card p-5 md:p-6"
        style={{
          overflow: 'hidden',
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--surface) 90%, transparent) 0%, color-mix(in srgb, var(--accent-dim) 28%, var(--surface2)) 48%, color-mix(in srgb, var(--primary-light) 38%, var(--surface)) 100%)',
        }}
      >
        <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.95fr] gap-6 items-stretch">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <div className="card-label" style={{ marginBottom: 0 }}>Grocery Control Room</div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(2rem, 4vw, 3.7rem)',
                  lineHeight: 0.94,
                  letterSpacing: '-0.05em',
                  color: 'var(--text)',
                  maxWidth: 760,
                }}
              >
                A cleaner view of spend, drift, and the next weekly move.
              </div>
              <p style={{ maxWidth: 640, fontSize: 14, lineHeight: 1.65, color: 'var(--text-3)', margin: 0 }}>
                This week sits at {formatEuro(data.weekSpend)} against a {formatEuro(data.WEEKLY_BUDGET)} budget.
                Month projection is {formatEuro(data.projected)}{projectedOver ? ', so attention should go to spend control and review cleanup.' : ', so the main focus is consistency and savings capture.'}
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <HeroStat
                label={`Week of ${weekLabel}`}
                value={formatEuro(data.weekSpend)}
                tone={weekOver ? 'warn' : 'good'}
                detail={weekOver ? `${formatEuro(data.weekSpend - data.WEEKLY_BUDGET)} over target` : `${formatEuro(data.WEEKLY_BUDGET - data.weekSpend)} left`}
              />
              <HeroStat
                label="Month to date"
                value={formatEuro(data.monthSpend)}
                detail={`${data.today} of ${data.daysInMo} days logged`}
              />
              <HeroStat
                label="Projection"
                value={formatEuro(data.projected)}
                tone={projectedOver ? 'warn' : 'good'}
                detail={projectedOver ? `${formatEuro(data.projected - data.MONTHLY_TARGET)} over target` : `${formatEuro(data.MONTHLY_TARGET - data.projected)} under target`}
              />
              <HeroStat
                label="Bonus saved"
                value={formatEuro(data.weekSavings)}
                tone="good"
                detail={`${data.weekReceipts} receipt${data.weekReceipts !== 1 ? 's' : ''} this week`}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/receipts" className="btn-primary" style={{ textDecoration: 'none' }}>
                Review Receipts
              </Link>
              <Link href="/analysis" className="btn-ghost" style={{ textDecoration: 'none' }}>
                Open Analysis
              </Link>
              <Link href="/meal-planner" className="btn-ghost" style={{ textDecoration: 'none' }}>
                Plan Meals
              </Link>
            </div>
          </div>

          <div
            className="rounded-[18px] border p-4 md:p-5 flex flex-col gap-4"
            style={{
              background: 'color-mix(in srgb, var(--surface) 82%, transparent)',
              borderColor: 'color-mix(in srgb, var(--primary) 12%, var(--border))',
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="card-label" style={{ marginBottom: 6 }}>Priority Snapshot</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
                  {projectedOver ? 'Budget pressure is rising' : 'Budget is stable'}
                </div>
              </div>
              <span className={`badge ${projectedOver ? 'badge-warn' : 'badge-good'}`}>
                {projectedOver ? 'Watch spend' : 'On track'}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <SpotlightRow
                title="Weekly budget"
                body={weekOver
                  ? `You are above plan for the current week. Focus first on review queue cleanup and short-term spend control.`
                  : `You still have room this week. Use it carefully rather than letting projection drift later in the month.`}
              />
              <SpotlightRow
                title="Monthly direction"
                body={data.moDelta === null
                  ? 'Month-over-month trend will appear once there is comparable prior data.'
                  : data.moDelta > 0
                    ? `Spending is ${data.moDelta}% above last month, which makes normalization and habit visibility more important.`
                    : `Spending is ${Math.abs(data.moDelta)}% below last month, which suggests the current operating rhythm is improving.`}
              />
              <SpotlightRow
                title="Operational focus"
                body={reviewReminder?.message ?? 'No review automation summary recorded yet.'}
              />
            </div>
          </div>
        </div>
      </section>

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

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="flex flex-col gap-4">
          <SpendChartClient data={data.weeklyChart} weekBudget={data.WEEKLY_BUDGET} />
          <AiInsightsDashboard
            projected={data.projected}
            monthlyTarget={data.MONTHLY_TARGET}
          />
        </div>

        <div className="flex flex-col gap-4">
          <BudgetCard
            weekSpend={data.weekSpend}
            weekBudget={data.WEEKLY_BUDGET}
            weekSavings={data.weekSavings}
            weekReceipts={data.weekReceipts}
            monthSpend={data.monthSpend}
            pctUsed={data.pctUsed}
            totalReceipts={data.totalReceipts}
          />
          <RecentReceipts receipts={data.recentReceipts} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.92fr] gap-4">
        <CategoryBreakdown categories={data.categories} />
        <InflationTracker items={data.inflation} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.92fr_1.08fr] gap-4">
        <MealPlanPreview mealPlan={mealPlan} reconciliation={reconciliation} />
        <div className="grid grid-cols-1 gap-4">
          <ReviewQueueMonitor reminder={reviewReminder} />
          <BudgetAlertMonitor reminder={budgetReminder} />
        </div>
      </div>

      <AutomationCenter statuses={automationStatuses} />
    </div>
  )
}

function HeroStat({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone?: 'good' | 'warn'
}) {
  return (
    <div
      className="rounded-[18px] border p-4"
      style={{
        background: 'color-mix(in srgb, var(--surface) 84%, transparent)',
        borderColor: 'color-mix(in srgb, var(--text) 8%, var(--border))',
      }}
    >
      <div className="card-label" style={{ marginBottom: 6 }}>{label}</div>
      <div
        className="mono"
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: tone === 'warn' ? 'var(--warn)' : tone === 'good' ? 'var(--good)' : 'var(--text)',
          letterSpacing: '-0.03em',
        }}
      >
        {value}
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
        {detail}
      </div>
    </div>
  )
}

function SpotlightRow({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-[16px] border p-3.5"
      style={{
        background: 'color-mix(in srgb, var(--surface2) 74%, transparent)',
        borderColor: 'color-mix(in srgb, var(--primary) 10%, var(--border))',
      }}
    >
      <div className="card-label" style={{ marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
        {body}
      </div>
    </div>
  )
}
