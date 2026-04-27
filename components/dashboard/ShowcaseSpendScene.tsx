'use client'

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useTheme } from 'next-themes'
import { format, parseISO } from 'date-fns'
import { formatEuro } from '@/lib/utils'

interface WeekData {
  week_saturday: string
  total_spend: number
  receipt_count: number
}

interface Props {
  data: WeekData[]
  weekBudget: number
  weekSpend: number
  projected: number
  monthTarget: number
  variant?: 'scene' | 'field'
}

export function ShowcaseSpendScene({
  data,
  weekBudget,
  weekSpend,
  projected,
  monthTarget,
  variant = 'scene',
}: Props) {
  const { theme } = useTheme()
  const isField = variant === 'field'
  const isDark = theme === 'dark' || isField

  const chartData = data
    .filter((row) => row.week_saturday)
    .map((row) => {
      let label = ''
      try {
        label = format(parseISO(String(row.week_saturday).slice(0, 10)), 'MMM d')
      } catch {
        label = String(row.week_saturday).slice(5, 10)
      }

      return {
        label,
        spend: Math.round(Number(row.total_spend) * 100) / 100,
        receipts: Number(row.receipt_count),
      }
    })

  const avgSpend = chartData.length
    ? Math.round((chartData.reduce((sum, item) => sum + item.spend, 0) / chartData.length) * 100) / 100
    : 0

  const accent = isDark ? '#ffc56f' : '#c58a28'
  const accentSoft = isDark ? '#ffd99d' : '#e7bb74'
  const grid = isDark ? '#273248' : '#38475f'
  const tick = isDark ? '#7183a3' : '#8492ad'
  const targetStroke = isDark ? '#8d9ab5' : '#6f7f9b'
  const projectedDelta = projected - monthTarget

  return (
    <section className={`showcase-scene ${isField ? 'showcase-scene--field' : ''}`}>
      {!isField && (
        <div className="showcase-scene__header">
          <div className="showcase-scene__eyebrow">Spend flow</div>
          <div className="showcase-scene__lede">
            Weekly spend is moving at {formatEuro(avgSpend)} on average.
          </div>
        </div>
      )}

      <div className="showcase-scene__chart-wrap">
        <div className="showcase-scene__axis-copy">
          <span>Recent weeks</span>
          <span>Target {formatEuro(weekBudget)}</span>
        </div>
        <div className="showcase-scene__chart">
          <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -26 }}>
              <defs>
                <linearGradient id="showcaseSpendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
                  <stop offset="60%" stopColor={accent} stopOpacity={0.08} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={grid} strokeDasharray="2 10" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: tick, fontFamily: 'IBM Plex Mono' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: tick, fontFamily: 'IBM Plex Mono' }}
                tickFormatter={(value) => `€${value}`}
              />
              <Tooltip
                cursor={{ stroke: accentSoft, strokeOpacity: 0.4 }}
                contentStyle={{
                  background: isDark ? '#121824' : '#101722',
                  border: `1px solid ${grid}`,
                  borderRadius: 14,
                  fontSize: 12,
                  fontFamily: 'IBM Plex Mono',
                  color: '#f3ecdf',
                }}
                formatter={(value: number) => [`€${value.toFixed(2)}`, 'Spend']}
              />
              <ReferenceLine
                y={weekBudget}
                stroke={targetStroke}
                strokeDasharray="5 8"
                strokeWidth={1.2}
              />
              <Area
                type="monotone"
                dataKey="spend"
                stroke={accent}
                strokeWidth={isField ? 4 : 3}
                fill="url(#showcaseSpendFill)"
                dot={false}
                activeDot={{ r: 5, fill: accent }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {!isField && (
        <div className="showcase-scene__foot">
          <div className="showcase-scene__signal">
            <span className="showcase-scene__signal-label">This week</span>
            <span className="showcase-scene__signal-value">{formatEuro(weekSpend)}</span>
          </div>
          <div className="showcase-scene__signal">
            <span className="showcase-scene__signal-label">Month projection</span>
            <span className="showcase-scene__signal-value">
              {projectedDelta > 0 ? '+' : ''}
              {formatEuro(projectedDelta)}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
