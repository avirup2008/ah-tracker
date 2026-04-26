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
    <div className="budget-monolith">
      <div className="card-label">Weekly Budget</div>

      <div className="budget-monolith__hero">
        <div className="display-num budget-monolith__amount">
          <span style={{ fontSize: 22, fontWeight: 400, color: 'var(--text-3)' }}>€</span>
          {Number(weekSpend).toFixed(2).replace('.', ',')}
        </div>
        <div className="budget-monolith__subline">
          of <strong style={{ color: 'var(--text-2)' }}>{formatEuro(weekBudget)}</strong> target
          {' · '}
          <strong style={{ color: overBudget ? 'var(--warn)' : 'var(--good)' }}>
            {overBudget ? `${formatEuro(weekSpend - weekBudget)} over` : `${formatEuro(remaining)} remaining`}
          </strong>
        </div>
      </div>

      <div className="budget-monolith__rail">
        <div className="gauge-track budget-monolith__gauge">
          <div
            className="gauge-fill"
            style={{
              width: `${pctUsed}%`,
              background: overBudget ? 'var(--warn)' : 'var(--gauge-fill)',
            }}
          />
        </div>
        <div className="budget-monolith__meta">
          <span style={{ color: overBudget ? 'var(--warn)' : 'var(--accent)', fontWeight: 600 }}>
            {pctUsed}% used
          </span>
          <span>{weekReceipts} shop{weekReceipts !== 1 ? 's' : ''} this week</span>
        </div>
      </div>

      <div className="budget-monolith__grid">
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
  const toneClass = highlight === 'good'
    ? 'budget-monolith__kpi-value--good'
    : highlight === 'warn'
      ? 'budget-monolith__kpi-value--warn'
      : 'budget-monolith__kpi-value--default'

  return (
    <div className="budget-monolith__kpi">
      <div
        className={`mono budget-monolith__kpi-value ${toneClass}`}
        style={{ fontSize: 16, fontWeight: 600 }}
      >
        {value}
      </div>
      <div className="budget-monolith__kpi-label" style={{ fontSize: 10, marginTop: 2, fontFamily: 'var(--font-body)' }}>
        {label}
      </div>
    </div>
  )
}
