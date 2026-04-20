import { NextRequest, NextResponse } from 'next/server'

import { getPlannerDefaults, savePlannerDefaults } from '@/lib/meal-plan-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

export async function GET() {
  try {
    return NextResponse.json(await getPlannerDefaults())
  } catch (err) {
    console.error('Planner defaults fetch error:', err)
    return NextResponse.json({ error: 'Failed to load planner defaults' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    const saved = await savePlannerDefaults({
      lunch_count: clamp(body.lunch_count, 7, 0, 7),
      dinner_count: clamp(body.dinner_count, 7, 0, 7),
      servings: clamp(body.servings, 2, 1, 8),
      max_prep_time: clamp(body.max_prep_time, 30, 10, 90),
      vegetarian_days: clamp(body.vegetarian_days, 1, 0, 7),
      meal_prep_preference: body.meal_prep_preference === 'high' || body.meal_prep_preference === 'minimal' ? body.meal_prep_preference : 'balanced',
      cuisine_mode: body.cuisine_mode === 'indian' || body.cuisine_mode === 'european' ? body.cuisine_mode : 'mixed',
    })
    return NextResponse.json(saved)
  } catch (err) {
    console.error('Planner defaults save error:', err)
    return NextResponse.json({ error: 'Failed to save planner defaults' }, { status: 500 })
  }
}
