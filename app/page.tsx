import Link from 'next/link'
import sql from '@/lib/db'
import { MONTHLY_TARGET, WEEKLY_BUDGET } from '@/lib/budget-constants'
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

type DashboardData = {
  weekSpend: number
  weekSavings: number
  weekReceipts: number
  monthSpend: number
  projected: number
  weeks: WeekRow[]
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
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [weekData, monthData, weeklyChart] = await Promise.all([
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
      FROM receipts WHERE parsed=true
        AND year=${year} AND month=${month}
    `,
    sql`
      SELECT TO_CHAR(week_saturday,'YYYY-MM-DD') AS week_saturday,
             ROUND(SUM(net_grocery_spend)::numeric,2) AS total_spend,
             COUNT(*) AS receipt_count
      FROM receipts WHERE parsed=true
      GROUP BY week_saturday ORDER BY week_saturday DESC LIMIT 16
    `,
  ])

  const weekSpend = Number(weekData[0]?.total_spend ?? 0)
  const monthSpend = Number(monthData[0]?.total_spend ?? 0)
  const today = now.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()

  return {
    weekSpend,
    weekSavings: Number(weekData[0]?.total_savings ?? 0),
    weekReceipts: Number(weekData[0]?.receipt_count ?? 0),
    monthSpend,
    projected: today > 0 ? Math.round((monthSpend / today) * daysInMonth * 100) / 100 : 0,
    weeks: plain([...weeklyChart].reverse()) as WeekRow[],
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
            {overMonth ? `${formatEuro(Math.abs(projectedDelta))} above` : `${formatEuro(projectedDelta)} under`} projected month-end target, based on a {formatEuro(MONTHLY_TARGET)} monthly budget.
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
    </main>
  )
}
