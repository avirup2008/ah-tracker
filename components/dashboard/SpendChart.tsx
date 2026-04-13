'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer
} from 'recharts'
import { useTheme } from 'next-themes'
import { format, parseISO } from 'date-fns'

interface WeekData {
  week_saturday: string
  total_spend: number
  receipt_count: number
}

interface Props {
  data: WeekData[]
  weekBudget: number
}

export function SpendChart({ data, weekBudget }: Props) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const chartData = data
    .filter(w => w.week_saturday)
    .map(w => {
      let weekLabel = ''
      try {
        const dateStr = String(w.week_saturday).slice(0, 10)
        weekLabel = format(parseISO(dateStr), 'MMM d')
      } catch {
        weekLabel = String(w.week_saturday).slice(5, 10)
      }
      return {
        week: weekLabel,
        spend: Math.round(Number(w.total_spend) * 100) / 100,
        receipts: Number(w.receipt_count),
      }
    })

  const avg = chartData.length
    ? Math.round((chartData.reduce((s, d) => s + d.spend, 0) / chartData.length) * 100) / 100
    : 0

  const overBudgetWeeks = chartData.filter(d => d.spend > weekBudget).length

  const accentColor = isDark ? '#FFB547' : '#BF7A18'
  const gridColor   = isDark ? '#252B40' : '#E4D9C8'
  const textColor   = isDark ? '#3D4860' : '#AE9E86'
  const warnColor   = isDark ? '#FF5F7E' : '#B83820'

  return (
    <div className="card p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 14.5,
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.01em',
              fontStyle: isDark ? 'normal' : 'italic',
            }}
          >
            Weekly Spend
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 3, fontFamily: 'var(--font-body)' }}>
            Target €{weekBudget} · Avg €{avg} · {overBudgetWeeks} week{overBudgetWeeks !== 1 ? 's' : ''} over budget
          </div>
        </div>
        <div className="flex gap-3">
          {[
            { color: accentColor, label: 'Spend' },
            { color: gridColor,   label: 'Target' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5" style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 155, marginTop: 4 }}>
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-4)', fontSize: 13 }}>
            No data yet — upload receipts to see your spending chart
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={accentColor} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="3 3" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 9, fill: textColor, fontFamily: 'IBM Plex Mono' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: textColor, fontFamily: 'IBM Plex Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `€${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: isDark ? '#131620' : '#fff',
                  border: `1px solid ${isDark ? '#252B40' : '#E4D9C8'}`,
                  borderRadius: 8,
                  fontSize: 12,
                  fontFamily: 'IBM Plex Mono',
                  color: isDark ? '#F0F2FF' : '#1A1208',
                }}
                formatter={(v: number) => [`€${v.toFixed(2)}`, 'Spend']}
              />
              <ReferenceLine
                y={weekBudget}
                stroke={gridColor}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{
                  value: `€${weekBudget}`,
                  position: 'insideTopLeft',
                  fontSize: 8,
                  fill: textColor,
                  fontFamily: 'IBM Plex Mono',
                }}
              />
              <Area
                type="monotone"
                dataKey="spend"
                stroke={accentColor}
                strokeWidth={2.5}
                fill="url(#spendGrad)"
                dot={(props) => {
                  const { cx, cy, payload } = props
                  const isOver = payload.spend > weekBudget
                  return (
                    <circle
                      key={`dot-${cx}`}
                      cx={cx} cy={cy} r={isOver ? 5 : 3}
                      fill={isOver ? warnColor : accentColor}
                      stroke={isOver ? warnColor : 'none'}
                      strokeWidth={isOver ? 2 : 0}
                      strokeOpacity={isOver ? 0.3 : 0}
                      style={{ filter: isOver ? `drop-shadow(0 0 4px ${warnColor})` : 'none' }}
                    />
                  )
                }}
                activeDot={{ r: 5, fill: accentColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
