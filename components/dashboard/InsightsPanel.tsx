import { formatEuro } from '@/lib/utils'

interface Props {
  week: { total_spend: number; total_savings: number; receipt_count: number } | null
  forecast: { monthSpend: number; target: number }
}

function Insight({ icon, type, children }: {
  icon: string
  type: 'warn' | 'good' | 'info' | 'accent'
  children: React.ReactNode
}) {
  return (
    <div
      className={`insight-${type} flex gap-2.5 p-2.5 rounded-[var(--radius-sm)]`}
    >
      <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <p style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
        {children}
      </p>
    </div>
  )
}

export function InsightsPanel({ week, forecast }: Props) {
  const spend    = Number(week?.total_spend ?? 0)
  const savings  = Number(week?.total_savings ?? 0)
  const onTrack  = forecast.monthSpend <= forecast.target
  const pctMonth = Math.round((forecast.monthSpend / forecast.target) * 100)
  const remaining = Math.max(0, forecast.target - forecast.monthSpend)

  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="card-label">AI Insights</div>

      <div className="flex flex-col gap-2">
        {/* Budget status */}
        {spend > 0 && (
          <Insight icon={spend > 90 ? '⚠️' : '✅'} type={spend > 90 ? 'warn' : 'good'}>
            <strong>This week:</strong> {formatEuro(spend)} spent — {' '}
            {spend > 90
              ? `${formatEuro(spend - 90)} over your €90 budget`
              : `${formatEuro(90 - spend)} under budget. Good discipline!`}
          </Insight>
        )}

        {/* Savings */}
        {savings > 0 && (
          <Insight icon="🏷️" type="good">
            <strong>Bonus savings:</strong> You saved {formatEuro(savings)} with your Bonuskaart this week.
            Keep an eye on the Deals tab for this week&apos;s offers.
          </Insight>
        )}

        {/* Monthly forecast */}
        <Insight icon={onTrack ? '📉' : '📈'} type={onTrack ? 'accent' : 'warn'}>
          <strong>Monthly forecast:</strong> {formatEuro(forecast.monthSpend)} spent so far ({pctMonth}% of target).{' '}
          {onTrack
            ? `${formatEuro(remaining)} remaining — you're on track!`
            : `Projected to exceed monthly target of ${formatEuro(forecast.target)}.`}
        </Insight>

        {/* Meal prep reminder */}
        <Insight icon="🍽️" type="info">
          <strong>Meal planner:</strong> Head to the Meal Planner tab to get AI-generated lunch and dinner
          suggestions with an optimised AH shopping list using current Bonus deals.
        </Insight>

        {/* Deal reminder */}
          <Insight icon="🛒" type="info">
            <strong>AH Deals:</strong> Check the Deals tab for this week&apos;s Bonuskaart offers.
            Deals are refreshed every 24 hours.
          </Insight>
      </div>
    </div>
  )
}
