import { NextRequest, NextResponse } from 'next/server'

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
    return NextResponse.json({
      ok: true,
      refreshed: refreshed.deals.length,
      quality: refreshed.quality,
      usedFallback: refreshed.usedFallback,
      fetched_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Cron deals refresh error:', err)
    return NextResponse.json({ error: 'Failed to refresh deals' }, { status: 500 })
  }
}
