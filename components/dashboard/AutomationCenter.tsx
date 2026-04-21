'use client'

type AutomationStatus = {
  jobKey: string
  jobName: string
  cadenceLabel: string
  nextRunIso: string
  record: {
    status: 'ok' | 'warning' | 'error'
    severity: 'info' | 'low' | 'medium' | 'high'
    message: string
    last_run_at: string
    summary_json: unknown | null
  } | null
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not run yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  }).format(date)
}

function tone(status: AutomationStatus['record']) {
  const severity = status?.severity ?? 'info'
  if (severity === 'high') return { badge: 'Needs Action', color: 'var(--warn)', bg: 'var(--warn-dim)' }
  if (severity === 'medium') return { badge: 'Watch', color: 'var(--accent)', bg: 'var(--accent-dim)' }
  if (severity === 'low') return { badge: 'Minor Risk', color: 'var(--primary)', bg: 'var(--primary-light)' }
  return { badge: 'Healthy', color: 'var(--good)', bg: 'var(--good-dim)' }
}

function summaryLine(job: AutomationStatus) {
  const summary = job.record?.summary_json as Record<string, unknown> | null
  if (!summary) return 'No summary recorded yet.'

  if (job.jobKey === 'deals_refresh') {
    const count = Number(summary.count ?? 0)
    const quality = summary.quality as Record<string, unknown> | undefined
    const qualityLabel = quality?.quality ? String(quality.quality) : 'unknown'
    const fallback = summary.usedFallback ? ' using fallback' : ''
    return `${count} deals cached · ${qualityLabel} quality${fallback}.`
  }

  if (job.jobKey === 'weekly_meal_plan') {
    return `${summary.week_saturday ?? 'Unknown week'} · ${summary.lunch_count ?? 0} lunches · ${summary.dinner_count ?? 0} dinners.`
  }

  if (job.jobKey === 'review_queue_reminder') {
    const queueSummary = summary.summary as Record<string, unknown> | undefined
    return `${queueSummary?.total ?? 0} open receipts · ${queueSummary?.highPriority ?? 0} high priority.`
  }

  if (job.jobKey === 'over_budget_alert') {
    return `Week ${summary.week_spend ?? 0}/${summary.weekly_budget ?? 0} · projected ${summary.projected_month_end ?? 0}.`
  }

  return 'Automation summary available.'
}

export function AutomationCenter({ statuses }: { statuses: AutomationStatus[] }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="card-label">Automation Center</div>
          <p style={{ fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.5 }}>
            Scheduled jobs, last status, and next expected runs in Amsterdam time.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {statuses.map((job) => {
          const jobTone = tone(job.record)
          return (
            <div key={job.jobKey} className="rounded-[var(--radius-sm)] p-4 border" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{job.jobName}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)', marginTop: 3 }}>
                    {job.cadenceLabel}
                  </div>
                </div>
                <span style={{
                  padding: '4px 9px',
                  borderRadius: 999,
                  background: jobTone.bg,
                  color: jobTone.color,
                  border: '1px solid var(--border)',
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  whiteSpace: 'nowrap',
                }}>
                  {jobTone.badge}
                </span>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.6, marginTop: 12 }}>
                {job.record?.message ?? 'No run recorded yet.'}
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <Meta label="Last run" value={formatDateTime(job.record?.last_run_at ?? null)} />
                <Meta label="Next expected" value={formatDateTime(job.nextRunIso)} />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-body)', marginTop: 12, lineHeight: 1.5 }}>
                {summaryLine(job)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] p-3 border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
        {value}
      </div>
    </div>
  )
}
