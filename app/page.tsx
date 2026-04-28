import type { CSSProperties } from 'react'
import Link from 'next/link'
import sql from '@/lib/db'
import { MONTHLY_TARGET, WEEKLY_BUDGET } from '@/lib/budget-constants'
import { getBudgetPeriod } from '@/lib/budget-period'
import { formatEuro } from '@/lib/utils'
import styles from './design-lab/design-lab.module.css'

export const revalidate = 0
export const fetchCache = 'force-no-store'

type WeekRow = {
  week_saturday?: string
  total_spend: number
  receipt_count?: number
}

type DataPoint = {
  label: string
  value: number
  x: number
  y: number
}

type BudgetMonthRow = {
  period_start: string
  period_end: string
  label: string
  total_spend: number
  receipt_count: number
}

type DashboardData = {
  weekSpend: number
  weekSavings: number
  weekReceipts: number
  monthSpend: number
  projected: number
  periodStart: string
  periodEnd: string
  weeks: WeekRow[]
  months: BudgetMonthRow[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function plain(rows: any[]): any[] {
  return JSON.parse(JSON.stringify(rows, (_key, value) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : value
  ))
}

function chartLabel(value: string | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(5, 10)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

function pathFromPoints(points: DataPoint[]) {
  return points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`

    const previous = points[index - 1]
    const handle = Math.max(26, (point.x - previous.x) * 0.42)
    return `${path} C ${(previous.x + handle).toFixed(1)} ${previous.y.toFixed(1)}, ${(point.x - handle).toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
  }, '')
}

function buildCurve(rows: WeekRow[], width = 920, height = 320) {
  const source = rows.length > 0 ? rows : [{ week_saturday: '', total_spend: 0 }]
  const values = source.map((row) => Number(row.total_spend) || 0)
  const max = Math.max(320, Math.ceil(Math.max(WEEKLY_BUDGET, ...values, 1) / 80) * 80)
  const left = 34
  const right = width - 26
  const top = 26
  const bottom = height - 42
  const range = bottom - top

  const points = source.map((row, index) => {
    const value = Number(row.total_spend) || 0
    const x = left + (index / Math.max(source.length - 1, 1)) * (right - left)
    const y = bottom - (value / max) * range
    return { label: chartLabel(row.week_saturday), value, x, y }
  })
  const line = pathFromPoints(points)
  const first = points[0]
  const last = points.at(-1) ?? first
  const area = `${line} L ${last.x.toFixed(1)} ${bottom} L ${first.x.toFixed(1)} ${bottom} Z`
  const targetY = bottom - (WEEKLY_BUDGET / max) * range

  return {
    area,
    line,
    targetY,
    latest: last,
    labels: points.filter((_, index) => index === 0 || index === points.length - 1 || index % 3 === 0),
    ticks: [320, 240, 160, 80].filter((tick) => tick <= max).map((tick) => ({
      value: tick,
      y: bottom - (tick / max) * range,
    })),
  }
}

async function getDashboardData(): Promise<DashboardData> {
  const now = new Date()
  const period = getBudgetPeriod(now)

  const [weekData, monthData, weeklyChart, budgetMonths] = await Promise.all([
    sql`
      SELECT week_saturday, COUNT(*) AS receipt_count,
        COALESCE(SUM(net_grocery_spend),0) AS total_spend,
        COALESCE(SUM(bonus_savings),0) AS total_savings
      FROM receipts WHERE parsed=true
        AND week_saturday = (
          SELECT week_saturday FROM receipts WHERE parsed=true
          ORDER BY receipt_date DESC LIMIT 1
        )
      GROUP BY week_saturday
    `,
    sql`
      SELECT COALESCE(SUM(net_grocery_spend),0) AS total_spend,
             COALESCE(SUM(bonus_savings),0) AS total_savings,
             COUNT(*) AS receipt_count
      FROM receipts
      WHERE parsed=true
        AND receipt_date >= ${period.startDate}::date
        AND receipt_date < ${period.endDate}::date
    `,
    sql`
      SELECT TO_CHAR(week_saturday,'YYYY-MM-DD') AS week_saturday,
             ROUND(SUM(net_grocery_spend)::numeric,2) AS total_spend,
             COUNT(*) AS receipt_count
      FROM receipts WHERE parsed=true
      GROUP BY week_saturday ORDER BY week_saturday DESC LIMIT 16
    `,
    sql`
      WITH periods AS (
        SELECT
          series::date AS period_start,
          (series + interval '1 month')::date AS period_end
        FROM generate_series(
          ${period.startDate}::date - interval '5 months',
          ${period.startDate}::date,
          interval '1 month'
        ) AS series
      )
      SELECT
        TO_CHAR(periods.period_start, 'FMMonth YYYY') AS label,
        TO_CHAR(periods.period_start, 'YYYY-MM-DD') AS period_start,
        TO_CHAR(periods.period_end, 'YYYY-MM-DD') AS period_end,
        ROUND(COALESCE(SUM(receipts.net_grocery_spend), 0)::numeric, 2) AS total_spend,
        COUNT(receipts.id) AS receipt_count
      FROM periods
      LEFT JOIN receipts
        ON receipts.parsed = true
       AND receipts.receipt_date >= periods.period_start
       AND receipts.receipt_date < periods.period_end
      GROUP BY periods.period_start, periods.period_end
      ORDER BY periods.period_start ASC
    `,
  ])

  const weekSpend = Number(weekData[0]?.total_spend ?? 0)
  const monthSpend = Number(monthData[0]?.total_spend ?? 0)

  return {
    weekSpend,
    weekSavings: Number(weekData[0]?.total_savings ?? 0),
    weekReceipts: Number(weekData[0]?.receipt_count ?? 0),
    monthSpend,
    projected: period.elapsedDays > 0
      ? Math.round((monthSpend / period.elapsedDays) * period.totalDays * 100) / 100
      : 0,
    periodStart: period.startDate,
    periodEnd: period.endDate,
    weeks: plain([...weeklyChart].reverse()) as WeekRow[],
    months: plain([...budgetMonths]) as BudgetMonthRow[],
  }
}

function SpendCurve({ rows }: { rows: WeekRow[] }) {
  const curve = buildCurve(rows)

  return (
    <svg className={styles.commandChart} viewBox="0 0 920 320" role="img" aria-labelledby="home-chart-title">
      <title id="home-chart-title">Recent weekly grocery spend</title>
      <defs>
        <linearGradient id="home-line" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#f5b54d" />
          <stop offset="55%" stopColor="#e8d7a8" />
          <stop offset="100%" stopColor="#7ee4a3" />
        </linearGradient>
        <linearGradient id="home-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f5b54d" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#f5b54d" stopOpacity="0" />
        </linearGradient>
      </defs>
      {curve.ticks.map((tick) => (
        <g key={tick.value}>
          <line className={styles.grid} x1="34" x2="894" y1={tick.y} y2={tick.y} />
          <text className={styles.yAxis} x="0" y={tick.y + 5}>€{tick.value}</text>
        </g>
      ))}
      <line className={styles.target} x1="34" x2="894" y1={curve.targetY} y2={curve.targetY} />
      <path d={curve.area} fill="url(#home-area)" />
      <path d={curve.line} className={styles.curveLine} stroke="url(#home-line)" />
      <circle cx={curve.latest.x} cy={curve.latest.y} r="5.5" className={styles.latestDot} />
      {curve.labels.map((label) => (
        <text key={`${label.label}-${label.x}`} className={styles.xAxis} x={label.x} y="312">
          {label.label}
        </text>
      ))}
    </svg>
  )
}

function BudgetMonthGraph({ rows, maxSpend }: { rows: BudgetMonthRow[], maxSpend: number }) {
  const targetPct = Math.min(100, Math.round((MONTHLY_TARGET / maxSpend) * 100))

  return (
    <div
      className={styles.monthTrendGraph}
      style={{ '--target-pct': `${targetPct}%` } as CSSProperties}
      aria-hidden="true"
    >
      <span className={styles.monthTrendGraphTarget}>Target {formatEuro(MONTHLY_TARGET)}</span>
      <div className={styles.monthTrendGraphBars}>
        {rows.map((row) => {
          const spend = Number(row.total_spend) || 0
          const overTarget = spend > MONTHLY_TARGET
          const height = Math.max(5, Math.round((spend / maxSpend) * 100))

          return (
            <div className={styles.monthTrendGraphColumn} key={row.period_start}>
              <span
                className={overTarget ? styles.monthTrendGraphBarOver : styles.monthTrendGraphBar}
                style={{ '--bar-height': `${height}%` } as CSSProperties}
              />
              <small>{row.label.slice(0, 3)}</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BudgetMonthTrend({ rows }: { rows: BudgetMonthRow[] }) {
  const maxSpend = Math.max(MONTHLY_TARGET, ...rows.map((row) => Number(row.total_spend) || 0), 1)

  return (
    <section className={styles.monthTrend} aria-labelledby="month-trend-title">
      <div className={styles.monthTrendIntro}>
        <h2 id="month-trend-title">Six budget months. One target.</h2>
        <p>
          Every row follows your salary cycle: 25th to the day before the next 25th,
          compared against the {formatEuro(MONTHLY_TARGET)} monthly target.
        </p>
      </div>

      <div className={styles.monthTrendTable}>
        <div className={styles.monthTrendPanelHeader}>
          <span>Salary-cycle spend</span>
          <strong>{formatEuro(MONTHLY_TARGET)} target</strong>
        </div>

        <BudgetMonthGraph rows={rows} maxSpend={maxSpend} />

        <div className={styles.monthTrendHead} aria-hidden="true">
          <span>Month</span>
          <span>Actual spend</span>
          <span>Trend vs budget</span>
        </div>

        {rows.map((row) => {
          const spend = Number(row.total_spend) || 0
          const delta = MONTHLY_TARGET - spend
          const spentPct = Math.min(100, Math.round((spend / maxSpend) * 100))
          const targetPct = Math.min(100, Math.round((MONTHLY_TARGET / maxSpend) * 100))
          const overTarget = delta < 0

          return (
            <div className={styles.monthTrendRow} key={row.period_start}>
              <div className={styles.monthTrendMonth}>
                <strong>{row.label}</strong>
              </div>

              <div className={styles.monthTrendActual}>
                <strong>{formatEuro(spend)}</strong>
              </div>

              <div className={styles.monthTrendVariance}>
                <strong className={overTarget ? styles.monthTrendOver : styles.monthTrendUnder}>
                  {overTarget ? `${formatEuro(Math.abs(delta))} over` : `${formatEuro(delta)} under`}
                </strong>
                <div className={styles.monthTrendBar} aria-hidden="true">
                  <span className={styles.monthTrendTarget} style={{ left: `${targetPct}%` }} />
                  <span
                    className={overTarget ? styles.monthTrendFillOver : styles.monthTrendFill}
                    style={{ width: `${spentPct}%` }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  const monthRemaining = MONTHLY_TARGET - data.monthSpend
  const projectedDelta = MONTHLY_TARGET - data.projected
  const overMonthSpend = monthRemaining < 0
  const overMonth = projectedDelta < 0
  const receiptWord = data.weekReceipts === 1 ? 'receipt' : 'receipts'

  return (
    <main className={`${styles.labPage} labPage`}>
      <nav className={styles.labNav} aria-label="Primary">
        <Link href="/" className={styles.labBrand}>AH Tracker</Link>
        <div>
          <Link href="/receipts">Receipts</Link>
          <Link href="/analysis">Analysis</Link>
          <Link href="/meal-planner">Meals</Link>
          <Link href="/deals">Deals</Link>
        </div>
      </nav>

      <section className={`${styles.concept} ${styles.command}`}>
        <div className={styles.commandCopy}>
          <p className={styles.kicker}>Grocery spend signal</p>
          <h1>
            <span>{overMonthSpend ? formatEuro(Math.abs(monthRemaining)) : formatEuro(monthRemaining)}</span>
            <span>{overMonthSpend ? 'over this month.' : 'left this month.'}</span>
          </h1>
          <p>
            Projected month-end is {overMonth ? `${formatEuro(Math.abs(projectedDelta))} above` : `${formatEuro(projectedDelta)} under`} target
          </p>
        </div>

        <div className={styles.commandPanel}>
          <div className={styles.panelHeader}>
            <span>Weekly shop trajectory</span>
            <strong>{formatEuro(WEEKLY_BUDGET)} weekly reference</strong>
          </div>
          <SpendCurve rows={data.weeks} />
          <div className={styles.commandStats}>
            <span><strong>{formatEuro(data.weekSpend)}</strong> latest week · {data.weekReceipts} {receiptWord}</span>
            <span><strong>{formatEuro(data.monthSpend)}</strong> month logged</span>
            <span><strong>{formatEuro(data.weekSavings)}</strong> weekly bonus saved</span>
          </div>
        </div>
      </section>

      <BudgetMonthTrend rows={data.months} />
    </main>
  )
}
