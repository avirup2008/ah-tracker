import { NextRequest, NextResponse } from 'next/server'

import { upsertAutomationStatus } from '@/lib/automation-status'
import { refreshDealsCache } from '@/lib/deals-service'
import { isAuthorizedCronRequest } from '@/lib/cron-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const refreshed = await refreshDealsCache(true)
    const status = refreshed.quality.quality === 'low' || refreshed.usedFallback ? 'warning' : 'ok'
    const severity = refreshed.usedFallback
      ? 'medium'
      : refreshed.quality.quality === 'low'
        ? 'medium'
        : refreshed.quality.quality === 'medium'
          ? 'low'
          : 'info'
    const message = refreshed.usedFallback
      ? `Deals refresh kept the previous higher-quality set (${refreshed.quality.total} deals).`
      : `Deals refresh stored ${refreshed.deals.length} deals with ${refreshed.quality.quality} quality.`

    const saved = await upsertAutomationStatus({
      jobKey: 'deals_refresh',
      jobName: 'Deals Refresh',
      status,
      severity,
      message,
      summary: {
        count: refreshed.deals.length,
        quality: refreshed.quality,
        usedFallback: refreshed.usedFallback,
      },
    })

    return NextResponse.json({
      ok: true,
      refreshed: refreshed.deals.length,
      quality: refreshed.quality,
      usedFallback: refreshed.usedFallback,
      fetched_at: saved.last_run_at,
    })
  } catch (err) {
    console.error('Cron deals refresh error:', err)
    return NextResponse.json({ error: 'Failed to refresh deals' }, { status: 500 })
  }
}
