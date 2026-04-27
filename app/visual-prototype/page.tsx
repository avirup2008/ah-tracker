import Link from 'next/link'
import styles from './prototype.module.css'

const weeklySpend = [
  { label: 'Dec 6', value: 92 },
  { label: 'Dec 13', value: 70 },
  { label: 'Dec 20', value: 108 },
  { label: 'Dec 27', value: 45 },
  { label: 'Jan 3', value: 125 },
  { label: 'Jan 10', value: 122 },
  { label: 'Jan 17', value: 302.29 },
  { label: 'Feb 21', value: 98 },
  { label: 'Feb 28', value: 121 },
  { label: 'Mar 7', value: 96 },
  { label: 'Mar 14', value: 222 },
  { label: 'Mar 21', value: 72 },
  { label: 'Mar 28', value: 38 },
  { label: 'Apr 4', value: 125 },
  { label: 'Apr 11', value: 76 },
  { label: 'Apr 18', value: 73.14 },
]

const target = 90
const maxSpend = 330
const chart = buildChart(weeklySpend, maxSpend, target)

function euro(value: number) {
  return `€${value.toFixed(2).replace('.', ',')}`
}

function buildChart(
  rows: Array<{ label: string; value: number }>,
  maxValue: number,
  targetValue: number
) {
  const left = 76
  const right = 1364
  const top = 70
  const bottom = 516
  const range = bottom - top

  const points = rows.map((row, index) => {
    const x = left + (index / Math.max(rows.length - 1, 1)) * (right - left)
    const y = bottom - (row.value / maxValue) * range
    return { ...row, x, y }
  })

  const line = points.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    const previous = points[index - 1]
    const handle = Math.max(30, (point.x - previous.x) * 0.44)
    return `${path} C ${(previous.x + handle).toFixed(1)} ${previous.y.toFixed(1)}, ${(point.x - handle).toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`
  }, '')

  const first = points[0]
  const last = points.at(-1)
  const area = first && last ? `${line} L ${last.x.toFixed(1)} ${bottom} L ${first.x.toFixed(1)} ${bottom} Z` : ''
  const targetY = bottom - (targetValue / maxValue) * range
  const peak = points.reduce((highest, point) => point.value > highest.value ? point : highest, points[0])
  const latest = points.at(-1) ?? peak

  return {
    area,
    line,
    targetY,
    peak,
    latest,
    ticks: [320, 240, 160, 80, 0].map((value) => ({
      value,
      y: bottom - (value / maxValue) * range,
    })),
    labels: points.filter((_, index) => index === 0 || index === rows.length - 1 || index % 2 === 0),
  }
}

export default function VisualPrototypePage() {
  return (
    <main className={`${styles.prototypePage} prototypePage`}>
      <section className={styles.scene} aria-labelledby="prototype-title">
        <div className={styles.nav}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark}>AH</span>
            <span>Tracker</span>
          </Link>
          <span className={styles.navMeta}>Visual prototype · W18 · Apr 2026</span>
        </div>

        <div className={styles.ambientNumbers} aria-hidden="true">
          <span>€73,14</span>
          <span>€284,68</span>
          <span>€316,31</span>
        </div>

        <div className={styles.copy}>
          <p className={styles.eyebrow}>Grocery spend signal</p>
          <h1 id="prototype-title" className={styles.title}>
            <span>€16,86</span>
            <span>left this week.</span>
          </h1>
          <p className={styles.lede}>Month-end is tracking €73,39 under target.</p>
          <div className={styles.contextLine}>
            <span>1 receipt logged</span>
            <span>€15,35 bonus saved</span>
            <span>Projection within target</span>
          </div>
        </div>

        <div className={styles.chartWrap} aria-label="Recent weekly spend chart">
          <div className={styles.chartHeader}>
            <span>Recent weeks</span>
            <span>Target {euro(target)}</span>
          </div>
          <svg className={styles.chart} viewBox="0 0 1440 620" role="img" aria-labelledby="chart-title chart-desc">
            <title id="chart-title">Weekly spend trend</title>
            <desc id="chart-desc">A spend curve showing the latest week at €73,14 against a €90,00 target.</desc>
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

            <g className={styles.peakNote} transform={`translate(${chart.peak.x + 48} ${chart.peak.y - 12})`}>
              <text className={styles.noteLabel}>Highest week</text>
              <text y="42" className={styles.noteValue}>{euro(chart.peak.value)}</text>
            </g>
            <g className={styles.latestNote} transform={`translate(${chart.latest.x - 158} ${chart.latest.y - 10})`}>
              <text className={styles.noteLabel}>Latest week</text>
              <text y="42" className={styles.latestValue}>{euro(chart.latest.value)}</text>
            </g>

            {chart.labels.map((label) => (
              <text key={label.label} x={label.x} y="588" className={styles.xLabel}>
                {label.label}
              </text>
            ))}
          </svg>
        </div>

      </section>

      <section className={styles.followUp} aria-label="Prototype notes">
        <p>
          This route is intentionally separate from the live dashboard. It tests a more premium direction:
          one continuous spend scene, large useful typography, and a graph that carries the visual weight.
        </p>
      </section>
    </main>
  )
}
