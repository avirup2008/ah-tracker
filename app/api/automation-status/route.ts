import { NextResponse } from 'next/server'

import { listAutomationStatusesWithDefinitions } from '@/lib/automation-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const statuses = await listAutomationStatusesWithDefinitions()
    return NextResponse.json({ statuses })
  } catch (err) {
    console.error('Automation status fetch error:', err)
    return NextResponse.json({ error: 'Failed to load automation status' }, { status: 500 })
  }
}
