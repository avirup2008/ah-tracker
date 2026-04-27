import sql from '@/lib/db'
import { BudgetCard } from '@/components/dashboard/BudgetCard'
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

function buildSpendCurve(
  rows: Array<{ week_saturday?: string; total_spend: number }>,
  weeklyBudget: number
): {
  path: string
  fillPath: string
  targetY: number
  ticks: Array<{ value: number; y: number }>
  xLabels: Array<{ label: string; x: number }>
} {
  const values = rows.map((row) => Number(row.total_spend) || 0)
  const peak = Math.max(320, Math.ceil(Math.max(weeklyBudget, ...values, 1) / 80) * 80)
  const width = 1000
  const height = 320
  const left = 72
  const right = 976
  const top = 34
  const bottom = 276
  const span = bottom - top

  const points = values.map((value, index) => {
    const x = values.length <= 1 ? (left + right) / 2 : left + (index / (values.length - 1)) * (right - left)
    const y = bottom - (value / peak) * span
    return [Math.round(x), Math.round(y)] as const
  })

  const path = points.length
    ? points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
    : `M 0 ${bottom} L ${width} ${bottom}`

  const first = points[0] ?? [0, bottom]
  const last = points.at(-1) ?? [width, bottom]
  const fillPath = `${path} L ${last[0]} ${height} L ${first[0]} ${height} Z`
  const targetY = Math.round(bottom - (weeklyBudget / peak) * span)
  const ticks = [320, 240, 160, 80, 0]
    .filter((value) => value <= peak)
    .map((value) => ({
      value,
      y: Math.round(bottom - (value / peak) * span),
    }))
  const xLabels = rows
    .map((row, index) => {
      const raw = String(row.week_saturday ?? '')
      const date = raw ? new Date(raw) : null
      const label = date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
        : raw.slice(5, 10)
      const x = values.length <= 1 ? (left + right) / 2 : left + (index / (values.length - 1)) * (right - left)
      return { label, x: Math.round(x) }
    })
    .filter((_, index) => index === 0 || index === rows.length - 1 || index % 2 === 0)

  return { path, fillPath, targetY, ticks, xLabels }
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
  const weekDelta = Math.abs(data.WEEKLY_BUDGET - data.weekSpend)
  const monthDelta = Math.abs(data.MONTHLY_TARGET - data.projected)
  const currentWeekSaturday = data.weeklyChart.at(-1)?.week_saturday
  const weekLabel = currentWeekSaturday
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(currentWeekSaturday))
    : 'Current week'
  const spendCurve = buildSpendCurve(data.weeklyChart, data.WEEKLY_BUDGET)

  return (
    <div className="premium-home premium-home--cinematic">
      <div className="premium-home__field" />
      <div className="premium-home__grain" />
      <section className="cinematic-opener animate-in">
        <div className="cinematic-opener__copy">
          <div className="card-label" style={{ marginBottom: 0 }}>Dashboard</div>
          <h1 className="cinematic-opener__title">
            {weekOver ? `${formatEuro(weekDelta)} over this week` : `${formatEuro(weekDelta)} left this week`}
          </h1>
          <p className="cinematic-opener__status">
            {projectedOver ? `Month-end is tracking ${formatEuro(monthDelta)} above target.` : `Month-end is tracking ${formatEuro(monthDelta)} under target.`}
          </p>
          <p className="cinematic-opener__body">
            Week {weekLabel} has {data.weekReceipts} receipt{data.weekReceipts !== 1 ? 's' : ''} logged.
            Bonus saved so far: {formatEuro(data.weekSavings)}. Current month projection: {formatEuro(data.projected)}.
          </p>
          <div className="premium-hero__signal">
            <span className={`badge ${weekOver ? 'badge-warn' : 'badge-good'}`}>
              {weekOver ? 'Weekly budget over' : 'Weekly budget on track'}
            </span>
            <span className={`badge ${projectedOver ? 'badge-warn' : 'badge-neutral'}`}>
              {projectedOver ? 'Projection above target' : 'Projection within target'}
            </span>
          </div>
        </div>

        <div className="cinematic-opener__chart">
          <div className="cinematic-opener__chart-head">
            <span>Recent weeks</span>
            <span>Target {formatEuro(data.WEEKLY_BUDGET)}</span>
          </div>
          <svg className="cinematic-opener__curve" viewBox="0 0 1000 320" preserveAspectRatio="none">
            <defs>
              <linearGradient id="heroSpendStroke" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#d19428" />
                <stop offset="62%" stopColor="#d69a2f" />
                <stop offset="100%" stopColor="#f1b04e" />
              </linearGradient>
              <linearGradient id="heroSpendFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#d19428" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#f2b84b" stopOpacity="0" />
              </linearGradient>
            </defs>
            {spendCurve.ticks.map((tick) => (
              <g key={tick.value}>
                <line
                  x1="72"
                  x2="976"
                  y1={tick.y}
                  y2={tick.y}
                  className="cinematic-opener__grid-line"
                />
                <text x="28" y={tick.y + 5} className="cinematic-opener__axis-label">
                  €{tick.value}
                </text>
              </g>
            ))}
            <path d={spendCurve.fillPath} fill="url(#heroSpendFill)" />
            <line
              x1="72"
              x2="976"
              y1={spendCurve.targetY}
              y2={spendCurve.targetY}
              className="cinematic-opener__target"
            />
            <path d={spendCurve.path} className="cinematic-opener__path" />
            {spendCurve.xLabels.map((item) => (
              <text key={`${item.label}-${item.x}`} x={item.x} y="312" className="cinematic-opener__x-label">
                {item.label}
              </text>
            ))}
          </svg>
        </div>

        <div className="cinematic-opener__metrics">
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
        </div>
      </section>

      <section className="premium-stage animate-in" style={{ animationDelay: '120ms' }}>
        <div className="premium-stage__grid">
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
        </div>
      </section>

      <section className="premium-lower animate-in" style={{ animationDelay: '220ms' }}>
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
    <div className={`premium-stat ${tone ? `premium-stat--${tone}` : ''}`}>
      <div className="card-label" style={{ marginBottom: 6 }}>{label}</div>
      <div
        className="mono"
        style={{
          fontSize: 24,
          fontWeight: 700,
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
