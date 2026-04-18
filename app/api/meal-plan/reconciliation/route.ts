import { NextRequest, NextResponse } from 'next/server'

import sql from '@/lib/db'
import type { MealPlan } from '@/lib/db'
import { getCurrentWeekSaturday } from '@/lib/utils'
import { format } from 'date-fns'
import { reconcileMealPlan } from '@/lib/reconciliation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const weekSaturday = searchParams.get('week') ?? format(getCurrentWeekSaturday(), 'yyyy-MM-dd')

    const rows = await sql`
      SELECT * FROM meal_plans
      WHERE week_saturday = ${weekSaturday}
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (rows.length === 0) {
      return NextResponse.json(null)
    }

    const reconciliation = await reconcileMealPlan(rows[0] as MealPlan)
    return NextResponse.json(reconciliation)
  } catch (err) {
    console.error('Meal plan reconciliation error:', err)
    return NextResponse.json({ error: 'Failed to reconcile meal plan' }, { status: 500 })
  }
}
