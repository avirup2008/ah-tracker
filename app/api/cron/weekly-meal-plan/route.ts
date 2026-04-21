import { NextRequest, NextResponse } from 'next/server'

import { upsertAutomationStatus } from '@/lib/automation-status'
import { isAuthorizedCronRequest } from '@/lib/cron-auth'
import { generateAndStoreMealPlan } from '@/lib/meal-plan-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await generateAndStoreMealPlan({
      regenerate: true,
    })
    const lunchCount = result.mealPlan?.meals_json?.lunches?.length ?? 0
    const dinnerCount = result.mealPlan?.meals_json?.dinners?.length ?? 0
    const message = `Generated weekly plan for ${result.mealPlan.week_saturday} with ${lunchCount} lunches and ${dinnerCount} dinners.`
    const saved = await upsertAutomationStatus({
      jobKey: 'weekly_meal_plan',
      jobName: 'Weekly Meal Plan',
      status: 'ok',
      severity: 'info',
      message,
      summary: {
        week_saturday: result.mealPlan.week_saturday,
        estimated_cost: result.mealPlan.estimated_cost,
        lunch_count: lunchCount,
        dinner_count: dinnerCount,
      },
    })

    return NextResponse.json({
      ok: true,
      week_saturday: result.mealPlan.week_saturday,
      estimated_cost: result.mealPlan.estimated_cost,
      generated_at: saved.last_run_at,
    })
  } catch (err) {
    console.error('Cron meal plan generation error:', err)
    return NextResponse.json({ error: 'Failed to generate weekly meal plan' }, { status: 500 })
  }
}
