import { NextRequest, NextResponse } from 'next/server'

import { isAuthorizedCronRequest } from '@/lib/cron-auth'
import { upsertAutomationStatus } from '@/lib/automation-status'
import { getBudgetSnapshot } from '@/lib/budget-monitor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const snapshot = await getBudgetSnapshot()
    const weeklyOver = snapshot.week_spend > snapshot.weekly_budget
    const monthlyRisk = snapshot.projected_month_end > snapshot.monthly_target
    const trendRisk = snapshot.recent_over_budget_weeks >= 3 || snapshot.recent_week_average > snapshot.weekly_budget

    const status = weeklyOver || monthlyRisk || trendRisk ? 'warning' : 'ok'
    const severity = weeklyOver
      ? 'high'
      : monthlyRisk || trendRisk
        ? 'medium'
        : 'info'

    const message = weeklyOver
      ? `Weekly spend is ${snapshot.weekly_pct_used}% of budget, ${snapshot.weekly_over_amount.toFixed(2)} over target.`
      : monthlyRisk
        ? `Month-end projection is €${snapshot.projected_month_end.toFixed(2)}, above the €${snapshot.monthly_target.toFixed(2)} target.`
        : trendRisk
          ? `Recent weekly average is €${snapshot.recent_week_average.toFixed(2)} with ${snapshot.recent_over_budget_weeks} recent week${snapshot.recent_over_budget_weeks !== 1 ? 's' : ''} over budget.`
          : `Budget is on track: €${snapshot.week_spend.toFixed(2)} this week and €${snapshot.projected_month_end.toFixed(2)} projected this month.`

    const saved = await upsertAutomationStatus({
      jobKey: 'over_budget_alert',
      jobName: 'Over-Budget Alert',
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
      summary: snapshot,
    })
  } catch (err) {
    console.error('Cron over-budget alert error:', err)
    return NextResponse.json({ error: 'Failed to refresh budget alert' }, { status: 500 })
  }
}
