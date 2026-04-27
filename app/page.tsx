import Link from 'next/link'
import sql from '@/lib/db'
import { MONTHLY_TARGET, WEEKLY_BUDGET } from '@/lib/budget-constants'
import { formatEuro } from '@/lib/utils'
import styles from './visual-prototype/prototype.module.css'

export const revalidate = 0
export const fetchCache = 'force-no-store'

type WeeklyRow = {
  week_saturday?: string
  total_spend: number
}

type ChartPoint = {
  label: string
  value: number
  x: number
  y: number
}

type ChartModel = {
  area: string
  line: string
  targetY: number
  peak: ChartPoint
  latest: ChartPoint
  ticks: Array<{ value: number; y: number }>
  labels: ChartPoint[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function plain(rows: any[]): any[] {
  return JSON.parse(JSON.stringify(rows, (_key, value) =>
    value instanceof Date ? value.toISOString().slice(0, 10) : value
  ))
}

function formatChartLabel(value: string | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(5, 10)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

function buildChart(rows: WeeklyRow[], targetValue: number): ChartModel {
  const source = rows.length > 0 ? rows : [{ week_saturday: '', total_spend: 0 }]
  const values = source.map((row) => Number(row.total_spend) || 0)
  const maxValue = Math.max(320, Math.ceil(Math.max(targetValue, ...values, 1) / 80) * 80)
  const left = 76
  const right = 1364
  const top = 70
  const bottom = 516
  const range = bottom - top

  const points = source.map((row, index) => {
    const value = Number(row.total_spend) || 0
    const x = left + (index / Math.max(source.length - 1, 1)) * (right - left)
    const y = bottom - (value / maxValue) * range

    return {
      label: formatChartLabel(row.week_saturday),
      value,
      x,
      y,
    }
  })

  const line = points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`

    const previous = points[index - 1]
    const handle = Math.max(30, (point.x - previous.x) * 0.44)
    return `${path} C ${(previous.x + handle).toFixed(1)} ${previous.y.toFixed(1)}, ${(point.x - handle).toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
  }, '')

  const first = points[0]
  const last = points.at(-1)
  const area = first && last
    ? `${line} L ${last.x.toFixed(1)} ${bottom} L ${first.x.toFixed(1)} ${bottom} Z`
    : ''
  const targetY = bottom - (targetValue / maxValue) * range
  const peak = points.reduce((highest, point) => point.value > highest.value ? point : highest, points[0])
  const latest = points.at(-1) ?? peak

  return {
    area,
    line,
    targetY,
    peak,
    latest,
    ticks: [320, 240, 160, 80, 0]
      .filter((value) => value <= maxValue)
      .map((value) => ({
        value,
        y: bottom - (value / maxValue) * range,
      })),
    labels: points.filter((_, index) => index === 0 || index === points.length - 1 || index % 2 === 0),
  }
}

async function getDashboardData() {
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
  const weekSavings = Number(weekData[0]?.total_savings ?? 0)
  const weekReceipts = Number(weekData[0]?.receipt_count ?? 0)
  const monthSpend = Number(monthData[0]?.total_spend ?? 0)
  const today = now.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()
  const projected = today > 0 ? Math.round((monthSpend / today) * daysInMonth * 100) / 100 : 0

  return {
    weekSpend,
    weekSavings,
    weekReceipts,
    monthSpend,
    projected,
    weeklyChart: plain([...weeklyChart].reverse()) as WeeklyRow[],
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()
  const chart = buildChart(data.weeklyChart, WEEKLY_BUDGET)
  const weekOver = data.weekSpend > WEEKLY_BUDGET
  const projectedOver = data.projected > MONTHLY_TARGET
  const weekDelta = Math.abs(WEEKLY_BUDGET - data.weekSpend)
  const monthDelta = Math.abs(MONTHLY_TARGET - data.projected)
  const latestLabel = chart.latest.label || 'Current week'

  return (
    <main className={`${styles.prototypePage} prototypePage`}>
      <section className={styles.scene} aria-labelledby="dashboard-title">
        <div className={styles.nav}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark}>AH</span>
            <span>Tracker</span>
          </Link>
          <nav className={styles.routeLinks} aria-label="Primary">
            <Link href="/receipts">Receipts</Link>
            <Link href="/analysis">Analysis</Link>
            <Link href="/meal-planner">Meals</Link>
            <Link href="/deals">Deals</Link>
          </nav>
          <span className={styles.navMeta}>{latestLabel} · target {formatEuro(WEEKLY_BUDGET)}</span>
        </div>

        <div className={styles.ambientNumbers} aria-hidden="true">
          <span>{formatEuro(data.weekSpend)}</span>
          <span>{formatEuro(data.monthSpend)}</span>
          <span>{formatEuro(data.projected)}</span>
        </div>

        <div className={styles.copy}>
          <p className={styles.eyebrow}>Grocery spend signal</p>
          <h1 id="dashboard-title" className={styles.title}>
            <span>{formatEuro(weekDelta)}</span>
            <span>{weekOver ? 'over this week.' : 'left this week.'}</span>
          </h1>
          <p className={styles.lede}>
            Month-end is tracking {formatEuro(monthDelta)} {projectedOver ? 'above' : 'under'} target.
          </p>
          <div className={styles.contextLine}>
            <span>{data.weekReceipts} receipt{data.weekReceipts === 1 ? '' : 's'} logged</span>
            <span>{formatEuro(data.weekSavings)} bonus saved</span>
            <span>{projectedOver ? 'Projection above target' : 'Projection within target'}</span>
          </div>
        </div>

        <div className={styles.chartWrap} aria-label="Recent weekly spend chart">
          <div className={styles.chartHeader}>
            <span>Recent weeks</span>
            <span>Target {formatEuro(WEEKLY_BUDGET)}</span>
          </div>
          <svg className={styles.chart} viewBox="0 0 1440 620" role="img" aria-labelledby="chart-title chart-desc">
            <title id="chart-title">Weekly spend trend</title>
            <desc id="chart-desc">
              A weekly spend curve showing the latest week at {formatEuro(chart.latest.value)} against a {formatEuro(WEEKLY_BUDGET)} target.
            </desc>
            <defs>
              <linearGradient id="prototypeLine" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#d08a1f" />
                <stop offset="44%" stopColor="#ffc05a" />
                <stop offset="100%" stopColor="#f4a62a" />
              </linearGradient>
              <linearGradient id="prototypeArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#e39b2d" stopOpacity="0.3" />
                <stop offset="58%" stopColor="#e39b2d" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#e39b2d" stopOpacity="0" />
              </linearGradient>
              <filter id="prototypeGlow" x="-10%" y="-30%" width="120%" height="160%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feColorMatrix
                  in="blur"
                  type="matrix"
                  values="1 0 0 0 0.95 0 0.56 0 0 0.48 0 0 0.18 0 0.08 0 0 0 0.6 0"
                />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect x="0" y="0" width="1440" height="620" fill="transparent" />
            {chart.ticks.map((tick) => (
              <g key={tick.value}>
                <line x1="76" x2="1364" y1={tick.y} y2={tick.y} className={styles.gridLine} />
                <text x="16" y={tick.y + 8} className={styles.axisLabel}>
                  €{tick.value}
                </text>
              </g>
            ))}
            <line x1="76" x2="1364" y1={chart.targetY} y2={chart.targetY} className={styles.targetLine} />
            <path d={chart.area} fill="url(#prototypeArea)" />
            <path d={chart.line} className={styles.spendLine} filter="url(#prototypeGlow)" />

            <g transform={`translate(${Math.min(chart.peak.x + 48, 1030)} ${Math.max(chart.peak.y - 12, 34)})`}>
              <text className={styles.noteLabel}>Highest week</text>
              <text y="42" className={styles.noteValue}>{formatEuro(chart.peak.value)}</text>
            </g>
            <g transform={`translate(${Math.max(chart.latest.x - 158, 900)} ${Math.max(chart.latest.y - 10, 74)})`}>
              <text className={styles.noteLabel}>Latest week</text>
              <text y="42" className={styles.latestValue}>{formatEuro(chart.latest.value)}</text>
            </g>

            {chart.labels.map((label) => (
              <text key={`${label.label}-${label.x}`} x={label.x} y="588" className={styles.xLabel}>
                {label.label}
              </text>
            ))}
          </svg>
        </div>
      </section>
    </main>
  )
}
