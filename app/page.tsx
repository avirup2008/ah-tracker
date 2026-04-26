import sql from '@/lib/db'
import { BudgetCard } from '@/components/dashboard/BudgetCard'
import { ShowcaseSpendScene } from '@/components/dashboard/ShowcaseSpendScene'
import { MONTHLY_TARGET, WEEKLY_BUDGET } from '@/lib/budget-constants'
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

  const [weekData, monthData, lastMonthData, weeklyChart, totalCount] =
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
    totalReceipts:  parseInt(String(totalCount[0]?.count ?? '0')),
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  const weekOver = data.weekSpend > data.WEEKLY_BUDGET
  const projectedOver = data.projected > data.MONTHLY_TARGET
  const currentWeekSaturday = data.weeklyChart.at(-1)?.week_saturday
  const weekLabel = currentWeekSaturday
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(currentWeekSaturday))
    : 'Current week'

  return (
    <div className="premium-home flex flex-col gap-8">
      <div className="premium-home__veil premium-home__veil--left" />
      <div className="premium-home__veil premium-home__veil--right" />
      <div className="premium-home__grain" />
      <section className="premium-hero animate-in">
        <div className="premium-hero__orb premium-hero__orb--one" />
        <div className="premium-hero__orb premium-hero__orb--two" />
        <div className="premium-hero__grid">
          <div className="premium-hero__copy">
            <div className="card-label" style={{ marginBottom: 0 }}>Dashboard</div>
            <h1 className="premium-hero__title">
              Spend less.
              <br />
              See it sooner.
            </h1>
            <p className="premium-hero__body">
              Weekly spend is {formatEuro(data.weekSpend)} against {formatEuro(data.WEEKLY_BUDGET)}.
              Month projection sits at {formatEuro(data.projected)}.
            </p>
            <div className="premium-hero__actions">
              <Link href="/receipts" className="btn-primary" style={{ textDecoration: 'none' }}>
                Review Receipts
              </Link>
              <Link href="/analysis" className="btn-ghost" style={{ textDecoration: 'none' }}>
                Open Analysis
              </Link>
              <Link href="/meal-planner" className="btn-ghost" style={{ textDecoration: 'none' }}>
                Meal Planner
              </Link>
            </div>
            <div className="premium-hero__signal">
              <span className={`badge ${weekOver ? 'badge-warn' : 'badge-good'}`}>
                {weekOver ? 'Weekly budget over' : 'Weekly budget on track'}
              </span>
              <span className={`badge ${projectedOver ? 'badge-warn' : 'badge-neutral'}`}>
                {projectedOver ? 'Projection above target' : 'Projection within target'}
              </span>
              {data.moDelta !== null && (
                <span className={`badge ${data.moDelta > 0 ? 'badge-warn' : 'badge-good'}`}>
                  {data.moDelta > 0 ? `+${data.moDelta}% vs last month` : `${data.moDelta}% vs last month`}
                </span>
              )}
            </div>
          </div>

          <div className="premium-hero__metrics">
            <HeroStat
              label={`Week of ${weekLabel}`}
              value={formatEuro(data.weekSpend)}
              tone={weekOver ? 'warn' : 'good'}
              detail={weekOver ? `${formatEuro(data.weekSpend - data.WEEKLY_BUDGET)} over budget` : `${formatEuro(data.WEEKLY_BUDGET - data.weekSpend)} remaining`}
            />
            <HeroStat
              label="Month to date"
              value={formatEuro(data.monthSpend)}
              detail={`${data.today} of ${data.daysInMo} days logged`}
            />
            <HeroStat
              label="Projection"
              value={formatEuro(data.projected)}
              tone={projectedOver ? 'warn' : undefined}
              detail={projectedOver ? `${formatEuro(data.projected - data.MONTHLY_TARGET)} above target` : `${formatEuro(data.MONTHLY_TARGET - data.projected)} below target`}
            />
            <HeroStat
              label="Bonus saved"
              value={formatEuro(data.weekSavings)}
              tone="good"
              detail={`${data.weekReceipts} receipt${data.weekReceipts !== 1 ? 's' : ''} this week`}
            />
          </div>
        </div>
      </section>

      <section className="premium-stage animate-in" style={{ animationDelay: '120ms' }}>
        <div className="premium-stage__grid">
          <div className="premium-stage__primary">
            <ShowcaseSpendScene
              data={data.weeklyChart}
              weekBudget={data.WEEKLY_BUDGET}
              weekSpend={data.weekSpend}
              projected={data.projected}
              monthTarget={data.MONTHLY_TARGET}
            />
          </div>
          <div className="premium-stage__side">
            <BudgetCard
              weekSpend={data.weekSpend}
              weekBudget={data.WEEKLY_BUDGET}
              weekSavings={data.weekSavings}
              weekReceipts={data.weekReceipts}
              monthSpend={data.monthSpend}
              pctUsed={data.pctUsed}
              totalReceipts={data.totalReceipts}
            />
            <div className="premium-stage__caption">
              {weekOver
                ? `${formatEuro(data.weekSpend - data.WEEKLY_BUDGET)} above weekly target.`
                : `${formatEuro(data.WEEKLY_BUDGET - data.weekSpend)} still available this week.`}
            </div>
          </div>
        </div>
      </section>

      <section className="premium-lower animate-in" style={{ animationDelay: '220ms' }}>
        <div className="premium-summary">
          <div className="card-label" style={{ marginBottom: 8 }}>Current position</div>
          <div className="premium-summary__text">
            {projectedOver
              ? `At the current pace, month-end lands ${formatEuro(data.projected - data.MONTHLY_TARGET)} above target.`
              : `At the current pace, month-end lands ${formatEuro(data.MONTHLY_TARGET - data.projected)} below target.`}
          </div>
          <div className="premium-summary__meta">
            {data.weekReceipts} receipt{data.weekReceipts !== 1 ? 's' : ''} this week. {formatEuro(data.weekSavings)} saved in bonus.
          </div>
        </div>
        <div className="premium-link-rail">
          <Link href="/analysis" className="premium-link-tile">
            <span className="premium-link-tile__eyebrow">Deep dive</span>
            <span className="premium-link-tile__title">Analysis</span>
          </Link>
          <Link href="/receipts" className="premium-link-tile">
            <span className="premium-link-tile__eyebrow">Operations</span>
            <span className="premium-link-tile__title">Receipts</span>
          </Link>
          <Link href="/meal-planner" className="premium-link-tile">
            <span className="premium-link-tile__eyebrow">Planning</span>
            <span className="premium-link-tile__title">Meals</span>
          </Link>
        </div>
      </section>
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
      className="premium-stat"
      style={{
        background: 'color-mix(in srgb, var(--surface2) 78%, transparent)',
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
