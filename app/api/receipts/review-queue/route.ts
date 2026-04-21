import { NextResponse } from 'next/server'

import { buildReviewReminderSnapshot, fetchReviewQueue } from '@/lib/review-queue-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [queue, snapshot] = await Promise.all([
      fetchReviewQueue(30),
      buildReviewReminderSnapshot(30),
    ])
    return NextResponse.json({
      queue,
      total: snapshot.summary.total,
      highPriority: snapshot.summary.highPriority,
      summary: snapshot.summary,
    })
  } catch (err) {
    console.error('Review queue error:', err)
    return NextResponse.json({ error: 'Failed to load review queue' }, { status: 500 })
  }
}
