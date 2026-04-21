'use client'

type ReviewReminderSummary = {
  summary?: {
    total: number
    highPriority: number
    mediumPriority: number
    lowPriority: number
    topReasons: string[]
  }
  topReceipts?: Array<{
    id: number
    filename: string
    receipt_date: string | null
    priority: 'high' | 'medium' | 'low' | 'none'
    score: number
    reasons: string[]
  }>
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

function severityTone(severity: Props['reminder'] extends { severity: infer T } ? T : never) {
  if (severity === 'high') return { color: 'var(--warn)', bg: 'var(--warn-dim)', label: 'High Priority' }
  if (severity === 'medium') return { color: 'var(--accent)', bg: 'var(--accent-dim)', label: 'Needs Review' }
  if (severity === 'low') return { color: 'var(--primary)', bg: 'var(--primary-light)', label: 'Backlog' }
  return { color: 'var(--text-3)', bg: 'var(--surface2)', label: 'Healthy' }
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

export function ReviewQueueMonitor({ reminder }: Props) {
  const payload = (reminder?.summary_json ?? null) as ReviewReminderSummary | null
  const summary = payload?.summary
  const topReceipts = payload?.topReceipts ?? []
  const tone = severityTone(reminder?.severity ?? 'info')

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="card-label">Review Queue Monitor</div>
          <p style={{ fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.5 }}>
            Automated check of receipts that need manual verification.
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
        {reminder?.message ?? 'No reminder run recorded yet.'}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MiniStat label="Open receipts" value={String(summary?.total ?? 0)} />
        <MiniStat label="High priority" value={String(summary?.highPriority ?? 0)} highlight={(summary?.highPriority ?? 0) > 0 ? 'warn' : undefined} />
        <MiniStat label="Medium" value={String(summary?.mediumPriority ?? 0)} />
        <MiniStat label="Last run" value={formatLastRun(reminder?.last_run_at ?? null)} />
      </div>

      {summary?.topReasons && summary.topReasons.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Most common issues
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.topReasons.map((reason) => (
              <span key={reason} style={{
                padding: '4px 10px',
                borderRadius: 999,
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                fontSize: 11,
                color: 'var(--text-2)',
                fontFamily: 'var(--font-body)',
              }}>
                {reason}
              </span>
            ))}
          </div>
        </div>
      )}

      {topReceipts.length > 0 && (
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Highest-risk receipts
          </div>
          <div className="flex flex-col gap-2">
            {topReceipts.slice(0, 4).map((receipt) => (
              <div key={receipt.id} className="flex items-start justify-between gap-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{receipt.filename}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)', marginTop: 2 }}>
                    {(receipt.receipt_date ?? 'Unknown date')} · {receipt.reasons[0] ?? 'Needs review'}
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 11, fontWeight: 600, color: receipt.priority === 'high' ? 'var(--warn)' : 'var(--accent)' }}>
                  {receipt.priority.toUpperCase()} · {receipt.score}
                </div>
              </div>
            ))}
          </div>
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
