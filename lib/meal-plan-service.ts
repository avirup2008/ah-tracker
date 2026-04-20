import { format } from 'date-fns'

import sql from './db'
import { generateMealPlan, buildShoppingList } from './ai'
import { getCurrentWeekSaturday } from './utils'
import { getProductIntelligence } from './product-intelligence'
import { getCurrentDealsWithCache } from './deals-service'

export interface PlannerDefaults {
  lunch_count: number
  dinner_count: number
  servings: number
  max_prep_time: number
  vegetarian_days: number
  meal_prep_preference: 'high' | 'balanced' | 'minimal'
  cuisine_mode: 'mixed' | 'indian' | 'european'
}

export const DEFAULT_PLANNER_DEFAULTS: PlannerDefaults = {
  lunch_count: 7,
  dinner_count: 7,
  servings: 2,
  max_prep_time: 30,
  vegetarian_days: 1,
  meal_prep_preference: 'balanced',
  cuisine_mode: 'mixed',
}

export async function getPantryItemsForPlanning() {
  const rows = await sql`
    SELECT name, quantity_note
    FROM pantry_items
    ORDER BY updated_at DESC, id DESC
  `

  return rows.map((row: Record<string, unknown>) =>
    row.quantity_note ? `${row.name} (${row.quantity_note})` : String(row.name)
  )
}

export async function getPlannerDefaults(): Promise<PlannerDefaults> {
  const rows = await sql`
    SELECT *
    FROM planner_defaults
    ORDER BY id ASC
    LIMIT 1
  `

  if (rows.length === 0) {
    return DEFAULT_PLANNER_DEFAULTS
  }

  const row = rows[0] as Record<string, unknown>
  return {
    lunch_count: Number(row.lunch_count ?? DEFAULT_PLANNER_DEFAULTS.lunch_count),
    dinner_count: Number(row.dinner_count ?? DEFAULT_PLANNER_DEFAULTS.dinner_count),
    servings: Number(row.servings ?? DEFAULT_PLANNER_DEFAULTS.servings),
    max_prep_time: Number(row.max_prep_time ?? DEFAULT_PLANNER_DEFAULTS.max_prep_time),
    vegetarian_days: Number(row.vegetarian_days ?? DEFAULT_PLANNER_DEFAULTS.vegetarian_days),
    meal_prep_preference: (row.meal_prep_preference as PlannerDefaults['meal_prep_preference']) ?? DEFAULT_PLANNER_DEFAULTS.meal_prep_preference,
    cuisine_mode: (row.cuisine_mode as PlannerDefaults['cuisine_mode']) ?? DEFAULT_PLANNER_DEFAULTS.cuisine_mode,
  }
}

export async function savePlannerDefaults(input: Partial<PlannerDefaults>) {
  const current = await getPlannerDefaults()
  const merged = {
    ...current,
    ...input,
  }

  const existing = await sql`SELECT id FROM planner_defaults ORDER BY id ASC LIMIT 1`
  if (existing.length > 0) {
    const rows = await sql`
      UPDATE planner_defaults
      SET
        lunch_count = ${merged.lunch_count},
        dinner_count = ${merged.dinner_count},
        servings = ${merged.servings},
        max_prep_time = ${merged.max_prep_time},
        vegetarian_days = ${merged.vegetarian_days},
        meal_prep_preference = ${merged.meal_prep_preference},
        cuisine_mode = ${merged.cuisine_mode},
        updated_at = NOW()
      WHERE id = ${existing[0].id}
      RETURNING *
    `
    return rows[0]
  }

  const rows = await sql`
    INSERT INTO planner_defaults (
      lunch_count, dinner_count, servings, max_prep_time,
      vegetarian_days, meal_prep_preference, cuisine_mode
    ) VALUES (
      ${merged.lunch_count},
      ${merged.dinner_count},
      ${merged.servings},
      ${merged.max_prep_time},
      ${merged.vegetarian_days},
      ${merged.meal_prep_preference},
      ${merged.cuisine_mode}
    )
    RETURNING *
  `
  return rows[0]
}

export async function getMealPlanByWeek(weekSaturday?: string) {
  const week = weekSaturday ?? format(getCurrentWeekSaturday(), 'yyyy-MM-dd')
  const rows = await sql`
    SELECT *
    FROM meal_plans
    WHERE week_saturday = ${week}
    ORDER BY created_at DESC
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function generateAndStoreMealPlan(options: {
  weekSaturday?: string
  userMeals?: string
  regenerate?: boolean
  overrides?: Partial<PlannerDefaults>
}) {
  const weekSaturday = options.weekSaturday ?? format(getCurrentWeekSaturday(), 'yyyy-MM-dd')
  const defaults = {
    ...(await getPlannerDefaults()),
    ...(options.overrides ?? {}),
  }

  if (!options.regenerate) {
    const existing = await getMealPlanByWeek(weekSaturday)
    if (existing) return { existing: true, mealPlan: existing }
  }

  const { deals } = await getCurrentDealsWithCache()
  const stapleProducts = (await getProductIntelligence(10)).map((product) => product.name)
  const pantryItems = await getPantryItemsForPlanning()

  const prevPlans = await sql`
    SELECT meals_json
    FROM meal_plans
    ORDER BY week_saturday DESC
    LIMIT 2
  `
  const previousPlans = prevPlans.length > 0
    ? prevPlans.map((p: Record<string, unknown>) => {
        const meals = p.meals_json as { lunches?: { name: string }[]; dinners?: { name: string }[] }
        return [
          ...(meals?.lunches?.map((m) => m.name) ?? []),
          ...(meals?.dinners?.map((m) => m.name) ?? []),
        ].join(', ')
      }).join(' | ')
    : undefined

  const cuisinePreferences = defaults.cuisine_mode === 'mixed'
    ? ['Indian', 'European']
    : [defaults.cuisine_mode === 'indian' ? 'Indian' : 'European']

  const mealPlan = await generateMealPlan({
    weekStart: weekSaturday,
    budget: 90,
    lunchCount: defaults.lunch_count,
    dinnerCount: defaults.dinner_count,
    currentDeals: deals,
    userMeals: options.userMeals,
    previousPlans,
    servings: defaults.servings,
    maxPrepTime: defaults.max_prep_time,
    vegetarianDays: defaults.vegetarian_days,
    pantryItems,
    cuisinePreferences,
    mealPrepPreference: defaults.meal_prep_preference,
    stapleProducts,
  })

  const shoppingList = await buildShoppingList(mealPlan, deals)
  const allMeals = [...mealPlan.lunches, ...mealPlan.dinners]
  const estimatedCost = allMeals.reduce((sum, meal) => sum + (meal.estimated_cost ?? 0), 0)

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
    RETURNING *
  `

  return {
    existing: false,
    mealPlan: inserted[0],
  }
}
