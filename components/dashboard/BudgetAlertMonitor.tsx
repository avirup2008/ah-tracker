'use client'

import { formatEuro } from '@/lib/utils'

interface BudgetSummary {
  week_saturday: string | null
  week_spend: number
  week_receipts: number
  week_savings: number
  weekly_budget: number
  weekly_pct_used: number
  weekly_over_amount: number
  monthly_spend: number
  monthly_target: number
  projected_month_end: number
  projected_delta: number
  on_track: boolean
  remaining_days: number
  daily_budget_remaining: number
  recent_week_average: number
  recent_over_budget_weeks: number
}

interface Props {
  reminder: {
    status: 'ok' | 'warning' | 'error'
    severity: 'info' | 'low' | 'medium' | 'high'
    message: string
    last_run_at: string | null
    summary_json: unknown | null
  } | null
}

function formatLastRun(value: string | null) {
  if (!value) return 'Not run yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function toneForSeverity(severity: Props['reminder'] extends { severity: infer T } ? T : never) {
  if (severity === 'high') return { label: 'Over Budget', color: 'var(--warn)', bg: 'var(--warn-dim)' }
  if (severity === 'medium') return { label: 'Watch Closely', color: 'var(--accent)', bg: 'var(--accent-dim)' }
  if (severity === 'low') return { label: 'Minor Risk', color: 'var(--primary)', bg: 'var(--primary-light)' }
  return { label: 'On Track', color: 'var(--good)', bg: 'var(--good-dim)' }
}

export function BudgetAlertMonitor({ reminder }: Props) {
  const summary = (reminder?.summary_json ?? null) as BudgetSummary | null
  const tone = toneForSeverity(reminder?.severity ?? 'info')

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="card-label">Budget Monitor</div>
          <p style={{ fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.5 }}>
            Daily automation check against weekly target, monthly projection, and recent spend trend.
          </p>
        </div>
        <span style={{
          padding: '5px 10px',
          borderRadius: 999,
          background: tone.bg,
          color: tone.color,
          border: '1px solid var(--border)',
          fontSize: 10.5,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap',
        }}>
          {tone.label}
        </span>
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
        {reminder?.message ?? 'No budget automation run recorded yet.'}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Week spend" value={summary ? formatEuro(summary.week_spend) : '—'} highlight={summary && summary.week_spend > summary.weekly_budget ? 'warn' : undefined} />
        <MiniStat label="Week target" value={summary ? formatEuro(summary.weekly_budget) : '—'} />
        <MiniStat label="Projected month-end" value={summary ? formatEuro(summary.projected_month_end) : '—'} highlight={summary && !summary.on_track ? 'warn' : undefined} />
        <MiniStat label="Last run" value={formatLastRun(reminder?.last_run_at ?? null)} />
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Metric title="Current Week" detail={`${summary.week_receipts} receipt${summary.week_receipts !== 1 ? 's' : ''} · ${summary.weekly_pct_used}% used`} />
          <Metric title="Month Projection" detail={summary.on_track ? `${formatEuro(Math.abs(summary.projected_delta))} under target` : `${formatEuro(summary.projected_delta)} over target`} />
          <Metric title="Trend Check" detail={`${summary.recent_over_budget_weeks} of last 8 weeks over · avg ${formatEuro(summary.recent_week_average)}`} />
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: 'warn' }) {
  return (
    <div className="rounded-[var(--radius-sm)] p-3 border" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
      <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: highlight === 'warn' ? 'var(--warn)' : 'var(--text)' }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 2, fontFamily: 'var(--font-body)' }}>
        {label}
      </div>
    </div>
  )
}

function Metric({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] p-3 border" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
        {detail}
      </div>
    </div>
  )
}
