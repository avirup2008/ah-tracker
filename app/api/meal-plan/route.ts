import { NextRequest, NextResponse } from 'next/server'
import { format } from 'date-fns'
import { getCurrentWeekSaturday } from '@/lib/utils'
import { generateAndStoreMealPlan, getMealPlanByWeek, savePlannerDefaults } from '@/lib/meal-plan-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const weekSaturday = searchParams.get('week') ?? format(getCurrentWeekSaturday(), 'yyyy-MM-dd')

  try {
    const row = await getMealPlanByWeek(weekSaturday)
    if (row) {
      return NextResponse.json(row)
    }

    return NextResponse.json(null)
  } catch (err) {
    console.error('Meal plan fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch meal plan' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      weekSaturday?: string
      userMeals?: string
      lunchCount?: number
      dinnerCount?: number
      regenerate?: boolean
      servings?: number
      maxPrepTime?: number
      vegetarianDays?: number
      mealPrepPreference?: 'high' | 'balanced' | 'minimal'
      cuisineMode?: 'mixed' | 'indian' | 'european'
    }

    const weekSaturday = body.weekSaturday ?? format(getCurrentWeekSaturday(), 'yyyy-MM-dd')
    const lunchCount = Math.max(0, Math.min(7, Math.floor(body.lunchCount ?? 7)))
    const dinnerCount = Math.max(0, Math.min(7, Math.floor(body.dinnerCount ?? 7)))
    const overrides = {
      lunch_count: lunchCount,
      dinner_count: dinnerCount,
      servings: Math.max(1, Math.min(8, Math.floor(body.servings ?? 2))),
      max_prep_time: Math.max(10, Math.min(90, Math.floor(body.maxPrepTime ?? 30))),
      vegetarian_days: Math.max(0, Math.min(dinnerCount, Math.floor(body.vegetarianDays ?? 0))),
      meal_prep_preference: body.mealPrepPreference ?? 'balanced',
      cuisine_mode: body.cuisineMode ?? 'mixed',
    } as const

    await savePlannerDefaults(overrides)
    const result = await generateAndStoreMealPlan({
      weekSaturday,
      userMeals: body.userMeals,
      regenerate: body.regenerate,
      overrides,
    })

    if (result.existing) {
      return NextResponse.json({ message: 'Already exists', id: result.mealPlan.id })
    }

    return NextResponse.json({
      id: result.mealPlan.id,
      week_saturday: result.mealPlan.week_saturday,
      meals_json: result.mealPlan.meals_json,
      shopping_list: result.mealPlan.shopping_list,
      estimated_cost: result.mealPlan.estimated_cost,
    })
  } catch (err) {
    console.error('Meal plan generation error:', err)
    return NextResponse.json({ error: 'Failed to generate meal plan' }, { status: 500 })
  }
}
