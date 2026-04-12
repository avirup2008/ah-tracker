import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { generateMealPlan, buildShoppingList } from '@/lib/claude'
import { fetchAhDeals } from '@/lib/claude'
import { format } from 'date-fns'
import { getCurrentWeekSaturday } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const weekSaturday = searchParams.get('week') ?? format(getCurrentWeekSaturday(), 'yyyy-MM-dd')

  try {
    const rows = await sql`
      SELECT * FROM meal_plans
      WHERE week_saturday = ${weekSaturday}
      ORDER BY created_at DESC
      LIMIT 1
    `

    if (rows.length > 0) {
      return NextResponse.json(rows[0])
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
      regenerate?: boolean
    }

    const weekSaturday = body.weekSaturday ?? format(getCurrentWeekSaturday(), 'yyyy-MM-dd')

    // Don't regenerate if exists (unless forced)
    if (!body.regenerate) {
      const existing = await sql`
        SELECT id FROM meal_plans WHERE week_saturday = ${weekSaturday}
      `
      if (existing.length > 0) {
        return NextResponse.json({ message: 'Already exists', id: existing[0].id })
      }
    }

    // Get current deals
    const dealsCache = await sql`
      SELECT deals_json FROM ah_deals_cache
      WHERE expires_at > NOW()
      ORDER BY fetched_at DESC LIMIT 1
    `
    const deals = dealsCache.length > 0 ? dealsCache[0].deals_json : []

    // Get last 2 weeks' plans to avoid repetition
    const prevPlans = await sql`
      SELECT meals_json FROM meal_plans
      ORDER BY week_saturday DESC LIMIT 2
    `
    const previousPlans = prevPlans.length > 0
      ? prevPlans.map((p: Record<string, unknown>) => {
          const meals = p.meals_json as { lunches?: { name: string }[], dinners?: { name: string }[] }
          return [
            ...(meals?.lunches?.map((m: { name: string }) => m.name) ?? []),
            ...(meals?.dinners?.map((m: { name: string }) => m.name) ?? []),
          ].join(', ')
        }).join(' | ')
      : undefined

    // Generate meal plan
    const mealPlan = await generateMealPlan({
      weekStart: weekSaturday,
      budget: 90,
      currentDeals: deals,
      userMeals: body.userMeals,
      previousPlans,
    })

    // Build shopping list
    const shoppingList = await buildShoppingList(mealPlan, deals)

    // Calculate estimated cost
    const allMeals = [...mealPlan.lunches, ...mealPlan.dinners]
    const estimatedCost = allMeals.reduce((sum, meal) => sum + (meal.estimated_cost ?? 0), 0)

    // Save to DB (upsert by week)
    await sql`DELETE FROM meal_plans WHERE week_saturday = ${weekSaturday}`
    const inserted = await sql`
      INSERT INTO meal_plans (week_saturday, generated_by, meals_json, shopping_list, estimated_cost)
      VALUES (
        ${weekSaturday},
        ${'ai'},
        ${JSON.stringify(mealPlan)}::jsonb,
        ${JSON.stringify(shoppingList)}::jsonb,
        ${estimatedCost}
      )
      RETURNING id
    `

    return NextResponse.json({
      id: inserted[0].id,
      week_saturday: weekSaturday,
      meals_json: mealPlan,
      shopping_list: shoppingList,
      estimated_cost: estimatedCost,
    })
  } catch (err) {
    console.error('Meal plan generation error:', err)
    return NextResponse.json({ error: 'Failed to generate meal plan' }, { status: 500 })
  }
}
