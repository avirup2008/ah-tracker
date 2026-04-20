import { NextRequest, NextResponse } from 'next/server'

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

    return NextResponse.json({
      ok: true,
      week_saturday: result.mealPlan.week_saturday,
      estimated_cost: result.mealPlan.estimated_cost,
      generated_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Cron meal plan generation error:', err)
    return NextResponse.json({ error: 'Failed to generate weekly meal plan' }, { status: 500 })
  }
}
