'use client'

import { formatEuro } from '@/lib/utils'

interface Props {
  weekSpend: number
  weekBudget: number
  weekSavings: number
  weekReceipts: number
  monthSpend: number
  pctUsed: number
  totalReceipts: number
}

export function BudgetCard({
  weekSpend, weekBudget, weekSavings,
  weekReceipts, monthSpend, pctUsed, totalReceipts,
}: Props) {
  const remaining = Math.max(0, weekBudget - weekSpend)
  const overBudget = weekSpend > weekBudget

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="card-label">Weekly Budget</div>

      {/* Main number */}
      <div>
        <div className="display-num" style={{ fontSize: 46 }}>
          <span style={{ fontSize: 22, fontWeight: 400, color: 'var(--text-3)' }}>€</span>
          {Number(weekSpend).toFixed(2).replace('.', ',')}
        </div>
        <div className="mt-1" style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
          of <strong style={{ color: 'var(--text-2)' }}>{formatEuro(weekBudget)}</strong> target
          {' · '}
          <strong style={{ color: overBudget ? 'var(--warn)' : 'var(--good)' }}>
            {overBudget ? `${formatEuro(weekSpend - weekBudget)} over` : `${formatEuro(remaining)} remaining`}
          </strong>
        </div>
      </div>

      {/* Gauge */}
      <div>
        <div className="gauge-track">
          <div
            className="gauge-fill"
            style={{
              width: `${pctUsed}%`,
              background: overBudget ? 'var(--warn)' : 'var(--gauge-fill)',
            }}
          />
        </div>
        <div className="flex justify-between mt-1.5" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-4)' }}>
          <span style={{ color: overBudget ? 'var(--warn)' : 'var(--accent)', fontWeight: 600 }}>
            {pctUsed}% used
          </span>
          <span>{weekReceipts} shop{weekReceipts !== 1 ? 's' : ''} this week</span>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-2">
        <KPI value={formatEuro(monthSpend)} label="Month spend" />
        <KPI value={formatEuro(weekSavings)} label="Bonus saved" highlight="good" />
        <KPI value={String(totalReceipts)} label="Receipts loaded" />
        <KPI
          value={weekSpend > 0 ? `${Math.round((weekSpend / (weekBudget)) * 100)}%` : '—'}
          label="of weekly budget"
          highlight={overBudget ? 'warn' : undefined}
        />
      </div>
    </div>
  )
}

function KPI({ value, label, highlight }: { value: string; label: string; highlight?: 'good' | 'warn' }) {
  return (
    <div
      className="rounded-[var(--radius-sm)] p-3 border"
      style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}
    >
      <div
        className="mono"
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: highlight === 'good' ? 'var(--good)'
               : highlight === 'warn' ? 'var(--warn)'
               : 'var(--text)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 2, fontFamily: 'var(--font-body)' }}>
        {label}
      </div>
    </div>
  )
}
