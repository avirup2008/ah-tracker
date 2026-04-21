import { NextRequest, NextResponse } from 'next/server'

import { isAuthorizedCronRequest } from '@/lib/cron-auth'
import { upsertAutomationStatus } from '@/lib/automation-status'
import { buildReviewReminderSnapshot } from '@/lib/review-queue-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const snapshot = await buildReviewReminderSnapshot(30)
    const status = snapshot.summary.highPriority > 0 || snapshot.summary.mediumPriority > 0
      ? 'warning'
      : 'ok'
    const severity = snapshot.summary.highPriority > 0
      ? 'high'
      : snapshot.summary.mediumPriority > 0
        ? 'medium'
        : snapshot.summary.total > 0
          ? 'low'
          : 'info'
    const message = snapshot.summary.total === 0
      ? 'No receipts currently need review.'
      : snapshot.summary.highPriority > 0
        ? `${snapshot.summary.highPriority} high-priority receipt${snapshot.summary.highPriority !== 1 ? 's' : ''} need review.`
        : `${snapshot.summary.total} receipt${snapshot.summary.total !== 1 ? 's' : ''} still need review.`

    const saved = await upsertAutomationStatus({
      jobKey: 'review_queue_reminder',
      jobName: 'Review Queue Reminder',
      status,
      severity,
      message,
      summary: snapshot,
    })

    return NextResponse.json({
      ok: true,
      status: saved.status,
      severity: saved.severity,
      message: saved.message,
      last_run_at: saved.last_run_at,
      summary: snapshot.summary,
    })
  } catch (err) {
    console.error('Cron review reminder error:', err)
    return NextResponse.json({ error: 'Failed to refresh review queue reminder' }, { status: 500 })
  }
}
