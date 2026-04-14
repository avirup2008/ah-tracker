'use client'

import { formatEuro } from '@/lib/utils'

interface Props {
  weekSpend:     number
  weekBudget:    number
  monthSpend:    number
  projected:     number
  monthlyTarget: number
  moDelta:       number | null
  lastMonthSpend:number
  today:         number
  daysInMo:      number
}

function Chip({ icon, label, value, type }: {
  icon: string; label: string; value: string; type: 'good'|'warn'|'info'|'neutral'
}) {
  return (
    <div className={`verdict verdict-${type}`}>
      <span>{icon}</span>
      <span style={{ color: 'inherit', opacity: 0.7, fontSize: 10 }}>{label}:</span>
      <span style={{ color: 'inherit', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{value}</span>
    </div>
  )
}

export function HealthStrip({ weekSpend, weekBudget, monthSpend, projected, monthlyTarget, moDelta, lastMonthSpend, today, daysInMo }: Props) {
  const weekOver    = weekSpend > weekBudget
  const weekRemain  = Math.abs(weekBudget - weekSpend)
  const moOver      = projected > monthlyTarget
  const moRemain    = Math.abs(monthlyTarget - projected)
  const trendUp     = moDelta !== null && moDelta > 10
  const trendDown   = moDelta !== null && moDelta < -10

  const weekVerdict  = weekOver
    ? { type: 'warn' as const, icon: '⚠️', label: 'This week', value: `${formatEuro(weekSpend)} — ${formatEuro(weekRemain)} over` }
    : { type: 'good' as const, icon: '✅', label: 'This week', value: `${formatEuro(weekSpend)} — ${formatEuro(weekRemain)} left` }

  const moVerdict = moOver
    ? { type: 'warn' as const, icon: '📈', label: 'Month forecast', value: `${formatEuro(projected)} projected — ${formatEuro(moRemain)} over target` }
    : { type: 'good' as const, icon: '🎯', label: 'Month forecast', value: `${formatEuro(projected)} projected — on track` }

  const trendVerdict = moDelta === null
    ? { type: 'neutral' as const, icon: '—', label: 'vs last month', value: 'No prior data' }
    : trendUp
      ? { type: 'warn' as const,    icon: '↑', label: 'vs last month', value: `+${moDelta}% (${formatEuro(lastMonthSpend)} → ${formatEuro(monthSpend)})` }
      : trendDown
        ? { type: 'good' as const,  icon: '↓', label: 'vs last month', value: `${moDelta}% (${formatEuro(lastMonthSpend)} → ${formatEuro(monthSpend)})` }
        : { type: 'neutral' as const, icon: '→', label: 'vs last month', value: `${moDelta > 0 ? '+' : ''}${moDelta}% vs ${formatEuro(lastMonthSpend)}` }

  const dayVerdict = {
    type: 'info' as const,
    icon: '📅',
    label: 'Month progress',
    value: `Day ${today} of ${daysInMo} · ${formatEuro(monthSpend)} spent`
  }

  return (
    <div className="health-strip animate-nav">
      <Chip {...weekVerdict} />
      <Chip {...moVerdict} />
      <Chip {...trendVerdict} />
      <Chip {...dayVerdict} />
      <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>
        Financial Health Monitor
      </div>
    </div>
  )
}
