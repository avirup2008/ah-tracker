import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ParsedItem } from './parser'
import type { MealPlanData, AhDeal, Meal, MealIngredient, ShoppingListItem } from './db'
import { dedupeAndScoreDeals } from './deal-normalization'
import { markPantryCoveredShoppingList } from './shopping-list'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)
const MODEL = 'gemini-2.5-flash-lite'
const WEEK_DAYS = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const
const ALLOWED_CUISINES = ['Indian', 'European', 'Mixed'] as const
const ALLOWED_CATEGORIES = [
  'Vlees & Vis',
  'Zuivel & Eieren',
  'Groente & Fruit',
  'Brood & Bakkerij',
  'Pasta, Rijst & Granen',
  'Sauzen & Kruiden',
  'Maaltijden kant-en-klaar',
  'Snacks & Zoetwaren',
  'Dranken',
  'Bier & Wijn',
  'Huishoud',
  'Persoonlijke verzorging',
  'Overig non-food',
] as const

// ─── Helper — ask Gemini, return text ──────────────────────────
async function ask(prompt: string, useSearch = false): Promise<string> {
  const modelConfig: Record<string, unknown> = { model: MODEL }
  if (useSearch) {
    modelConfig.tools = [{ googleSearch: {} }]
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = genAI.getGenerativeModel(modelConfig as any)
  const result = await model.generateContent(prompt)
  return result.response.text()
}

// ─── Helper — parse JSON safely ────────────────────────────────
function parseJSON<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim()) as T
  } catch {
    return fallback
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function clampCurrency(value: unknown): number | null {
  const amount = asNumber(value)
  return amount === null ? null : Math.max(0, Math.round(amount * 100) / 100)
}

function asCategory(value: unknown): string | null {
  const category = asNonEmptyString(value)
  if (!category) return null
  return ALLOWED_CATEGORIES.includes(category as typeof ALLOWED_CATEGORIES[number]) ? category : null
}

function asCuisine(value: unknown): Meal['cuisine'] | null {
  const cuisine = asNonEmptyString(value)
  if (!cuisine) return null
  return ALLOWED_CUISINES.includes(cuisine as typeof ALLOWED_CUISINES[number])
    ? cuisine as Meal['cuisine']
    : null
}

function asDay(value: unknown): Meal['day'] | null {
  const day = asNonEmptyString(value)
  if (!day) return null
  return WEEK_DAYS.includes(day as typeof WEEK_DAYS[number]) ? day as Meal['day'] : null
}

function asStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(asNonEmptyString)
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems)
}

function clampMealCount(count: number): number {
  if (!Number.isFinite(count)) return 0
  return Math.max(0, Math.min(7, Math.floor(count)))
}

function normalizeMeals(meals: MealPlanData['lunches'], expectedCount: number) {
  const byDay = new Map<string, MealPlanData['lunches'][number]>()

  for (const meal of meals) {
    if (!meal?.day || !WEEK_DAYS.includes(meal.day as typeof WEEK_DAYS[number])) continue
    if (!byDay.has(meal.day)) byDay.set(meal.day, meal)
  }

  return WEEK_DAYS
    .map((day) => byDay.get(day))
    .filter(Boolean)
    .slice(0, expectedCount) as MealPlanData['lunches']
}

function normalizeMealPlan(mealPlan: MealPlanData, lunchCount: number, dinnerCount: number): MealPlanData {
  return {
    lunches: normalizeMeals(mealPlan.lunches ?? [], lunchCount),
    dinners: normalizeMeals(mealPlan.dinners ?? [], dinnerCount),
  }
}

function hasExactMealCounts(mealPlan: MealPlanData, lunchCount: number, dinnerCount: number): boolean {
  return mealPlan.lunches.length === lunchCount && mealPlan.dinners.length === dinnerCount
}

async function repairMealPlanCounts(
  mealPlan: MealPlanData,
  lunchCount: number,
  dinnerCount: number,
  budget: number
): Promise<MealPlanData> {
  const prompt = `You are repairing a weekly meal plan JSON object.

Return ONLY valid JSON with exactly ${lunchCount} lunches and exactly ${dinnerCount} dinners.
- If a count is 0, return an empty array for that meal type.
- Use only valid days from this ordered week: ${WEEK_DAYS.join(', ')}.
- Keep meals on the earliest days of the week first.
- Remove extras, fix duplicate days, and add missing meals if needed.
- Keep the same JSON schema and stay within the overall grocery budget of €${budget}.

Current meal plan JSON:
${JSON.stringify(mealPlan)}

Respond with ONLY valid JSON:
{"lunches":[],"dinners":[]}`

  const text = await ask(prompt)
  return parseJSON<MealPlanData>(text, { lunches: [], dinners: [] })
}

function sanitizeMealIngredient(value: unknown): MealIngredient | null {
  if (!isRecord(value)) return null

  const ahName = asNonEmptyString(value.ah_name)
  const englishName = asNonEmptyString(value.english_name)
  const quantity = asNonEmptyString(value.quantity)
  const estPrice = clampCurrency(value.est_price)
  const category = asCategory(value.category)

  if (!ahName || !englishName || !quantity || estPrice === null || !category) return null

  return {
    ah_name: ahName,
    english_name: englishName,
    quantity,
    est_price: estPrice,
    bonus_deal: asBoolean(value.bonus_deal),
    category,
  }
}

function sanitizeMeal(value: unknown): Meal | null {
  if (!isRecord(value)) return null

  const day = asDay(value.day)
  const name = asNonEmptyString(value.name)
  const cuisine = asCuisine(value.cuisine)
  const prepTime = asNumber(value.prep_time_min)
  const estimatedCost = clampCurrency(value.estimated_cost)
  const ingredients = Array.isArray(value.ingredients)
    ? value.ingredients.map(sanitizeMealIngredient).filter((item): item is MealIngredient => Boolean(item))
    : []
  const recipeSteps = asStringArray(value.recipe_steps, 6)
  const tip = asNonEmptyString(value.tip) ?? undefined

  if (!day || !name || !cuisine || prepTime === null || estimatedCost === null) return null
  if (ingredients.length === 0 || recipeSteps.length === 0) return null

  return {
    day,
    name,
    cuisine,
    prep_time_min: Math.max(1, Math.min(180, Math.round(prepTime))),
    meal_prep_friendly: asBoolean(value.meal_prep_friendly),
    ingredients,
    recipe_steps: recipeSteps,
    estimated_cost: estimatedCost,
    tip,
  }
}

function sanitizeMealPlanPayload(value: unknown): MealPlanData {
  const payload = isRecord(value) ? value : {}

  return {
    lunches: Array.isArray(payload.lunches)
      ? payload.lunches.map(sanitizeMeal).filter((meal): meal is Meal => Boolean(meal))
      : [],
    dinners: Array.isArray(payload.dinners)
      ? payload.dinners.map(sanitizeMeal).filter((meal): meal is Meal => Boolean(meal))
      : [],
  }
}

function sanitizeCategorisedItems(
  value: unknown,
  filteredItems: ParsedItem[]
): CategorisedItem[] {
  if (!Array.isArray(value)) return []

  const seenIndexes = new Set<number>()
  const items: CategorisedItem[] = []

  for (const entry of value) {
    if (!isRecord(entry)) continue

    const index = asNumber(entry.index)
    if (index === null) continue
    const normalizedIndex = Math.floor(index)
    if (normalizedIndex < 0 || normalizedIndex >= filteredItems.length || seenIndexes.has(normalizedIndex)) continue

    const cleanName = asNonEmptyString(entry.cleanName)
    const category = asCategory(entry.category)
    const btwRate = asNumber(entry.btwRate)
    if (!cleanName || !category || (btwRate !== 9 && btwRate !== 21)) continue

    seenIndexes.add(normalizedIndex)
    items.push({
      rawName: filteredItems[normalizedIndex].rawName,
      cleanName,
      category,
      subcategory: asNonEmptyString(entry.subcategory) ?? undefined,
      isNonFood: asBoolean(entry.isNonFood),
      btwRate: btwRate as 9 | 21,
    })
  }

  return items
}

function sanitizeShoppingList(value: unknown): ShoppingListItem[] {
  if (!Array.isArray(value)) return []

  const sections: ShoppingListItem[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue

    const category = asNonEmptyString(entry.category)
    if (!category || !Array.isArray(entry.items)) continue

    const items = entry.items
      .map((item) => {
        if (!isRecord(item)) return null
        const ahName = asNonEmptyString(item.ah_name)
        const englishName = asNonEmptyString(item.english_name)
        const quantity = asNonEmptyString(item.quantity)
        const estPrice = clampCurrency(item.est_price)

        if (!ahName || !englishName || !quantity || estPrice === null) return null

        return {
          ah_name: ahName,
          english_name: englishName,
          quantity,
          est_price: estPrice,
          bonus_deal: asBoolean(item.bonus_deal),
        }
      })
      .filter((item): item is ShoppingListItem['items'][number] => Boolean(item))

    if (items.length === 0) continue
    sections.push({ category, items })
  }

  return sections
}

function sanitizeDeals(value: unknown, validUntil: string): AhDeal[] {
  if (!Array.isArray(value)) return []

  const deals: AhDeal[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue

    const name = asNonEmptyString(entry.name)
    const discount = asNonEmptyString(entry.discount)
    if (!name || !discount) continue

    deals.push({
      name,
      discount,
      original_price: clampCurrency(entry.original_price) ?? undefined,
      deal_price: clampCurrency(entry.deal_price) ?? undefined,
      valid_until: validUntil,
      category: asNonEmptyString(entry.category) ?? undefined,
    })
  }

  return dedupeAndScoreDeals(deals, validUntil)
}

async function repairCategorisedItems(items: ParsedItem[]): Promise<CategorisedItem[]> {
  const filteredItems = items.filter((item) => !item.isStatiegeld && !item.isKoopzegel)
  const itemList = filteredItems.map((item, index) => `${index}: ${item.rawName}`).join('\n')
  const prompt = `Repair this malformed Albert Heijn item categorisation JSON.

Return ONLY a valid JSON array with one valid entry per item index when possible.
- Use only indexes shown below.
- Category must be one of:
${ALLOWED_CATEGORIES.join('\n')}
- btwRate must be 9 or 21.

Items:
${itemList}

Respond with ONLY JSON:
[{"index":0,"cleanName":"Dutch name (English translation)","category":"Groente & Fruit","subcategory":"...","isNonFood":false,"btwRate":9}]`

  const repaired = parseJSON<unknown>(await ask(prompt), [])
  return sanitizeCategorisedItems(repaired, filteredItems)
}

async function repairShoppingList(
  allIngredients: MealIngredient[],
  deals: AhDeal[]
): Promise<ShoppingListItem[]> {
  const prompt = `Repair this AH shopping list into valid JSON grouped by category.

- Keep only valid items with ah_name, english_name, quantity, est_price, bonus_deal.
- Remove empty sections.
- Use a JSON array only.

Current deals: ${deals.map((deal) => deal.name).join(', ')}
Ingredients:
${JSON.stringify(allIngredients)}

Respond with ONLY JSON:
[{"category":"Groente & Fruit","items":[{"ah_name":"Tomaten","english_name":"tomatoes","quantity":"500g","est_price":1.49,"bonus_deal":false}]}]`

  return sanitizeShoppingList(parseJSON<unknown>(await ask(prompt), []))
}

async function repairDeals(validUntil: string): Promise<AhDeal[]> {
  const prompt = `Search ah.nl/bonus and return ONLY valid JSON for current Albert Heijn Bonus deals in the Netherlands.

Rules:
- Return a JSON array only.
- Each entry must include non-empty name and discount.
- Set valid_until to "${validUntil}" for every deal.
- Prefer real grocery deals and avoid duplicates.

Respond with ONLY JSON:
[{"name":"AH product name","discount":"50% korting","category":"Groente & Fruit","valid_until":"${validUntil}"}]`

  return sanitizeDeals(parseJSON<unknown>(await ask(prompt, true), []), validUntil)
}

// ─── Category taxonomy ──────────────────────────────────────────
const CATEGORIES = `
FOOD categories (count toward €90 budget):
- Vlees & Vis (Meat & Fish)
- Zuivel & Eieren (Dairy & Eggs)
- Groente & Fruit (Produce)
- Brood & Bakkerij (Bakery)
- Pasta, Rijst & Granen (Pasta, Rice & Grains)
- Sauzen & Kruiden (Sauces & Spices & Condiments)
- Maaltijden kant-en-klaar (Ready meals)
- Snacks & Zoetwaren (Snacks & Sweets)
- Dranken (Non-alcoholic drinks)
- Bier & Wijn (Alcohol)

NON-FOOD (tracked separately, excluded from budget):
- Huishoud (Household: cleaning, kitchen paper, etc.)
- Persoonlijke verzorging (Personal care & pharmacy)
- Overig non-food (Other non-food)
`.trim()

// ─── Item categorisation ────────────────────────────────────────
export interface CategorisedItem {
  rawName: string
  cleanName: string
  category: string
  subcategory?: string
  isNonFood: boolean
  btwRate: 9 | 21
}

export async function categoriseItems(items: ParsedItem[]): Promise<CategorisedItem[]> {
  if (items.length === 0) return []

  const filteredItems = items.filter(i => !i.isStatiegeld && !i.isKoopzegel)
  const itemList = filteredItems.map((item, i) => `${i}: ${item.rawName}`).join('\n')

  const prompt = `You are an Albert Heijn product expert. Categorise each abbreviated Dutch grocery item.

${CATEGORIES}

Rules:
- cleanName format: "Dutch name (English translation)" e.g. "Halfvolle melk (semi-skimmed milk)"
- Non-food items (household, personal care): isNonFood=true, btwRate=21
- Food items: btwRate=9. Alcohol: btwRate=21 but category=Bier & Wijn
- AH = Albert Heijn own brand. HV = halfvolle (semi-skimmed). SCHARREL = free-range
- Expand abbreviations intelligently

Items (index: raw_name):
${itemList}

Respond with ONLY a valid JSON array, no markdown, no explanation:
[{"index":0,"cleanName":"...","category":"...","subcategory":"...","isNonFood":false,"btwRate":9}]`

  let parsed = sanitizeCategorisedItems(parseJSON<unknown>(await ask(prompt), []), filteredItems)
  if (parsed.length === 0 && filteredItems.length > 0) {
    parsed = await repairCategorisedItems(items)
  }

  return parsed
}

// ─── AI Analysis ────────────────────────────────────────────────
export async function generateAnalysis(receiptsData: string): Promise<string> {
  const prompt = `You are an expert household budget analyst for a Dutch couple shopping at Albert Heijn.

Analyse this grocery spending data and provide insights as valid JSON:
{
  "brandSwitches": [{"category":"","fromBrand":"","toBrand":"","extraCost":0,"occurrences":0}],
  "wasteAlerts": [{"item":"","buyFreqDays":0,"concern":""}],
  "seasonalAlerts": [{"item":"","currentPrice":0,"seasonalLow":0,"bestMonths":""}],
  "anomalies": [{"week":"","spend":0,"normal":0,"pctAbove":0}],
  "forecast": {"projectedMonthEnd":0,"target":0,"onTrack":true,"message":""},
  "topInsight": ""
}

Spending data:
${receiptsData}

Respond with ONLY valid JSON, no markdown.`

  return ask(prompt)
}

// ─── Meal planning ──────────────────────────────────────────────
export async function generateMealPlan(options: {
  weekStart: string
  budget: number
  lunchCount: number
  dinnerCount: number
  currentDeals: AhDeal[]
  userMeals?: string
  previousPlans?: string
  servings?: number
  maxPrepTime?: number
  vegetarianDays?: number
  pantryItems?: string[]
  cuisinePreferences?: string[]
  mealPrepPreference?: 'high' | 'balanced' | 'minimal'
  stapleProducts?: string[]
  excludedIngredients?: string[]
  preferredProteins?: string[]
  mustIncludeMeals?: string[]
  batchCookDays?: string[]
  budgetStyle?: 'cheap' | 'balanced' | 'treat'
}): Promise<MealPlanData> {
  const lunchCount = clampMealCount(options.lunchCount)
  const dinnerCount = clampMealCount(options.dinnerCount)
  const dealsText = options.currentDeals.length > 0
    ? options.currentDeals.map(d => `- ${d.name}: ${d.discount}`).join('\n')
    : 'No current deals available'
  const servings = Math.max(1, Math.min(8, Math.floor(options.servings ?? 2)))
  const maxPrepTime = Math.max(10, Math.min(90, Math.floor(options.maxPrepTime ?? 30)))
  const vegetarianDays = Math.max(0, Math.min(dinnerCount, Math.floor(options.vegetarianDays ?? 0)))
  const pantryItems = options.pantryItems?.filter(Boolean).join(', ') || 'None specified'
  const cuisinePreferences = options.cuisinePreferences?.length
    ? options.cuisinePreferences.join(' + ')
    : 'Indian and European mixed'
  const mealPrepPreference = options.mealPrepPreference ?? 'balanced'
  const stapleProducts = options.stapleProducts?.filter(Boolean).slice(0, 10).join(', ') || 'No staple history available'
  const excludedIngredients = options.excludedIngredients?.filter(Boolean).join(', ') || 'None'
  const preferredProteins = options.preferredProteins?.filter(Boolean).join(', ') || 'No preference'
  const mustIncludeMeals = options.mustIncludeMeals?.filter(Boolean).join(', ') || 'None'
  const batchCookDays = options.batchCookDays?.filter(Boolean).join(', ') || 'Sunday'
  const budgetStyle = options.budgetStyle ?? 'balanced'
  const ingredientBudgetCap = budgetStyle === 'cheap'
    ? 0.6
    : budgetStyle === 'treat'
      ? 0.8
      : 0.7

  const prompt = `You are a meal planner for a Dutch couple who shops at Albert Heijn.
They meal prep on Sundays. Recipes must be simple and realistic for Albert Heijn shopping.
Cuisine preference: ${cuisinePreferences}. Budget-conscious and healthy.

Week starting: ${options.weekStart} (Saturday)
Weekly grocery budget: €${options.budget}
${options.userMeals ? `User requested meals: ${options.userMeals}` : 'Generate a full AI-recommended plan'}
${options.previousPlans ? `Avoid repeating from recent weeks: ${options.previousPlans}` : ''}
Requested meal counts: ${lunchCount} lunches and ${dinnerCount} dinners
Servings per meal: ${servings}
Maximum active prep time: ${maxPrepTime} minutes
Vegetarian dinners required: ${vegetarianDays}
Meal-prep preference: ${mealPrepPreference}
Pantry items already available: ${pantryItems}
Frequent staples from purchase history: ${stapleProducts}
Excluded ingredients: ${excludedIngredients}
Preferred proteins: ${preferredProteins}
Must-include meal ideas this week: ${mustIncludeMeals}
Preferred batch-cook days: ${batchCookDays}
Budget style: ${budgetStyle}

Current AH Bonus deals:
${dealsText}

Generate exactly ${lunchCount} lunches and exactly ${dinnerCount} dinners. Rules:
- If requested count is 0, return [] for that meal type.
- Only create the requested number of meals. Do not pad the rest of the week.
- Assign meals to the earliest days of the week in order: ${WEEK_DAYS.join(', ')}.
- All text in English
- AH product names: Dutch first, English in brackets e.g. "Kipblokjes (chicken pieces)"
- Prioritise Bonus deal ingredients and the user's frequent staples when sensible
- Reuse pantry items where possible to reduce shopping
- Never use excluded ingredients
- Prefer the listed proteins when they fit the requested cuisines
- Try to incorporate the must-include meal ideas naturally without breaking counts
- Use realistic AH 2026 NL prices
- meal_prep_friendly: true if can batch cook Sunday
- Honour the meal-prep preference: "high" means many batch-cook meals, "minimal" means fresher day-by-day meals
- Use the preferred batch-cook days when choosing which meals should be meal-prep friendly
- Simple recipes: max 6 numbered steps
- Respect cuisine preference instead of forcing a fixed split
- Lunches: lighter (salads, wraps, soup). Dinners: more substantial
- Create at least ${vegetarianDays} vegetarian dinners
- Every recipe must fit within ${maxPrepTime} minutes active prep
- Total cost max €${Math.round(options.budget * ingredientBudgetCap)} (leaving room for breakfast/snacks)
- "cheap" budget style means lean harder on low-cost staples and fewer premium proteins
- "treat" budget style can include one or two slightly nicer dinners if still under budget

Respond with ONLY valid JSON, no markdown:
{
  "lunches": [{
    "day": "Saturday",
    "name": "Meal name",
    "cuisine": "Indian|European|Mixed",
    "prep_time_min": 25,
    "meal_prep_friendly": true,
    "estimated_cost": 5.40,
    "ingredients": [{
      "ah_name": "AH Volkoren wraps",
      "english_name": "wholegrain wraps",
      "quantity": "4 stuks",
      "est_price": 1.89,
      "bonus_deal": false,
      "category": "Brood & Bakkerij"
    }],
    "recipe_steps": ["Step 1", "Step 2"],
    "tip": "Optional tip"
  }],
  "dinners": []
}`

  const text = await ask(prompt)
  let mealPlan = normalizeMealPlan(
    sanitizeMealPlanPayload(parseJSON<unknown>(text, { lunches: [], dinners: [] })),
    lunchCount,
    dinnerCount
  )

  if (!hasExactMealCounts(mealPlan, lunchCount, dinnerCount)) {
    mealPlan = normalizeMealPlan(
      sanitizeMealPlanPayload(await repairMealPlanCounts(mealPlan, lunchCount, dinnerCount, options.budget)),
      lunchCount,
      dinnerCount
    )
  }

  if (!hasExactMealCounts(mealPlan, lunchCount, dinnerCount)) {
    throw new Error(`Meal plan generation did not match requested counts (${lunchCount} lunches, ${dinnerCount} dinners)`)
  }

  return mealPlan
}

// ─── Shopping list builder ───────────────────────────────────────
export async function buildShoppingList(
  mealPlan: MealPlanData,
  deals: AhDeal[],
  pantryFamilyKeys: string[] = []
) {
  const allIngredients = [
    ...mealPlan.lunches.flatMap(m => m.ingredients),
    ...mealPlan.dinners.flatMap(m => m.ingredients),
  ]

  if (allIngredients.length === 0) return []

  const prompt = `Consolidate this ingredient list into a deduplicated AH shopping list grouped by store category.
Combine duplicates (e.g. 2x "Ui (onion) 500g" → "Ui (onion) 1kg").
Sort by AH store layout: Groente & Fruit → Zuivel → Vlees → Brood → Dranken → Droog → Huishoud.

Current deals: ${deals.map(d => d.name).join(', ')}

Ingredients:
${JSON.stringify(allIngredients)}

Respond with ONLY valid JSON array, no markdown:
[{
  "category": "Groente & Fruit (Produce)",
  "items": [{"ah_name":"Tomaten (tomatoes)","english_name":"tomatoes","quantity":"500g","est_price":1.49,"bonus_deal":false}]
}]`

  let shoppingList = sanitizeShoppingList(parseJSON<unknown>(await ask(prompt), []))
  if (shoppingList.length === 0) {
    shoppingList = await repairShoppingList(allIngredients, deals)
  }

  if (shoppingList.length === 0) {
    throw new Error('Shopping list generation returned no valid items')
  }

  return markPantryCoveredShoppingList(shoppingList, pantryFamilyKeys)
}

// ─── AH Deals — uses Gemini Google Search grounding ─────────────
export async function fetchAhDeals(): Promise<AhDeal[]> {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  // AH bonus week runs Wednesday–Tuesday
  const dow = today.getDay() // 0=Sun
  const daysToNextTue = (2 - dow + 7) % 7 || 7
  const nextTue = new Date(today)
  nextTue.setDate(today.getDate() + daysToNextTue)
  const validUntil = nextTue.toISOString().slice(0, 10)

  const prompt = `Today is ${todayStr}. Search ah.nl/bonus for the current Albert Heijn Bonuskaart deals valid this week in the Netherlands.

The current bonus week runs until ${validUntil}. All deals must have valid_until set to "${validUntil}".

Return a JSON array of 20 real current deals. Each item:
{"name":"exact Dutch product name from AH","discount":"e.g. 2e halve prijs or 50% korting or 3 voor €5","category":"food category in Dutch","deal_price":null,"valid_until":"${validUntil}"}

IMPORTANT: Use "${validUntil}" as valid_until for ALL deals. Do NOT invent past dates.
Respond with ONLY a valid JSON array, no markdown.`

  let deals = sanitizeDeals(parseJSON<unknown>(await ask(prompt, true), []), validUntil)
  if (deals.length < 5) {
    deals = await repairDeals(validUntil)
  }

  if (deals.length === 0) {
    throw new Error('Deals fetch returned no valid deals')
  }

  // Force correct valid_until on every deal regardless of what Gemini returned
  return dedupeAndScoreDeals(
    deals.map(d => ({ ...d, valid_until: validUntil })),
    validUntil
  )
}
