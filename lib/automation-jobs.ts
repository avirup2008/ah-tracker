import type { AutomationStatusRecord } from './automation-status'

export interface AutomationJobDefinition {
  jobKey: string
  jobName: string
  cadenceLabel: string
  kind: 'daily' | 'weekly'
  weekday?: number
  hourUtc: number
  minuteUtc: number
}

export const AUTOMATION_JOBS: AutomationJobDefinition[] = [
  {
    jobKey: 'deals_refresh',
    jobName: 'Deals Refresh',
    cadenceLabel: 'Weekly on Wednesday morning',
    kind: 'weekly',
    weekday: 3,
    hourUtc: 6,
    minuteUtc: 0,
  },
  {
    jobKey: 'weekly_meal_plan',
    jobName: 'Weekly Meal Plan',
    cadenceLabel: 'Weekly on Thursday morning',
    kind: 'weekly',
    weekday: 4,
    hourUtc: 6,
    minuteUtc: 15,
  },
  {
    jobKey: 'review_queue_reminder',
    jobName: 'Review Queue Reminder',
    cadenceLabel: 'Daily in the morning',
    kind: 'daily',
    hourUtc: 7,
    minuteUtc: 0,
  },
  {
    jobKey: 'over_budget_alert',
    jobName: 'Over-Budget Alert',
    cadenceLabel: 'Daily in the evening',
    kind: 'daily',
    hourUtc: 18,
    minuteUtc: 0,
  },
]

export interface AutomationJobStatus extends AutomationJobDefinition {
  record: AutomationStatusRecord | null
  nextRunIso: string
}

function buildCandidate(date: Date, hourUtc: number, minuteUtc: number) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    hourUtc,
    minuteUtc,
    0,
    0
  ))
}

export function getNextRunIso(job: AutomationJobDefinition, now = new Date()) {
  if (job.kind === 'daily') {
    const todayCandidate = buildCandidate(now, job.hourUtc, job.minuteUtc)
    if (todayCandidate > now) return todayCandidate.toISOString()
    const tomorrow = new Date(now)
    tomorrow.setUTCDate(now.getUTCDate() + 1)
    return buildCandidate(tomorrow, job.hourUtc, job.minuteUtc).toISOString()
  }

  const candidate = buildCandidate(now, job.hourUtc, job.minuteUtc)
  const todayWeekday = now.getUTCDay()
  let offset = ((job.weekday ?? 0) - todayWeekday + 7) % 7
  if (offset === 0 && candidate <= now) offset = 7
  const target = new Date(now)
  target.setUTCDate(now.getUTCDate() + offset)
  return buildCandidate(target, job.hourUtc, job.minuteUtc).toISOString()
}

export function mergeAutomationStatuses(records: AutomationStatusRecord[], now = new Date()): AutomationJobStatus[] {
  const byKey = new Map(records.map((record) => [record.job_key, record]))

  return AUTOMATION_JOBS.map((job) => ({
    ...job,
    record: byKey.get(job.jobKey) ?? null,
    nextRunIso: getNextRunIso(job, now),
  }))
}
