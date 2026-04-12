import Anthropic from '@anthropic-ai/sdk'
import type { ParsedItem } from './parser'
import type { MealPlanData, AhDeal } from './db'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODEL = 'claude-sonnet-4-6'

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
  cleanName: string      // "Halfvolle melk (semi-skimmed milk)"
  category: string
  subcategory?: string
  isNonFood: boolean
  btwRate: 9 | 21
}

export async function categoriseItems(items: ParsedItem[]): Promise<CategorisedItem[]> {
  if (items.length === 0) return []

  const itemList = items
    .filter(i => !i.isStatiegeld && !i.isKoopzegel)
    .map((item, i) => `${i}: ${item.rawName}`)
    .join('\n')

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are an Albert Heijn product expert. Categorise each abbreviated Dutch grocery item name.

${CATEGORIES}

Rules:
- cleanName format: "Dutch name (English translation)" e.g. "Halfvolle melk (semi-skimmed milk)"
- If item is non-food (household, personal care), set isNonFood: true and btwRate: 21
- Food items get btwRate: 9
- Alcohol gets btwRate: 21 but stays in budget (Bier & Wijn category)
- Item names may be abbreviated AH shortcodes - expand them intelligently
- AH EIGEN MERK = AH own brand
- HV = halfvolle (semi-skimmed)
- SCHARREL = free-range

Items to categorise (index: raw_name):
${itemList}

Respond with ONLY a JSON array, no markdown. Each element:
{
  "index": number,
  "cleanName": "Dutch name (English name)",
  "category": "exact category from list above",
  "subcategory": "optional finer detail",
  "isNonFood": boolean,
  "btwRate": 9 or 21
}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

  try {
    const parsed = JSON.parse(text.replace(/```json?|```/g, '').trim())
    const filteredItems = items.filter(i => !i.isStatiegeld && !i.isKoopzegel)
    return parsed.map((p: CategorisedItem & { index: number }) => ({
      rawName: filteredItems[p.index]?.rawName ?? '',
      cleanName: p.cleanName,
      category: p.category,
      subcategory: p.subcategory,
      isNonFood: p.isNonFood,
      btwRate: p.btwRate,
    }))
  } catch {
    return []
  }
}

// ─── AI Analysis features ───────────────────────────────────────

export async function generateAnalysis(receiptsData: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are an expert household budget analyst for a Dutch couple shopping at Albert Heijn.
      
Analyse this grocery spending data and provide insights in the following JSON format:

{
  "brandSwitches": [{ "category": string, "fromBrand": string, "toBrand": string, "extraCost": number, "occurrences": number }],
  "wasteAlerts": [{ "item": string, "buyFreqDays": number, "concern": string }],
  "seasonalAlerts": [{ "item": string, "currentPrice": number, "seasonalLow": number, "bestMonths": string }],
  "anomalies": [{ "week": string, "spend": number, "normal": number, "pctAbove": number }],
  "forecast": { "projectedMonthEnd": number, "target": number, "onTrack": boolean, "message": string },
  "topInsight": string
}

Spending data:
${receiptsData}`
    }]
  })

  return response.content[0].type === 'text' ? response.content[0].text : '{}'
}

// ─── Meal planning ──────────────────────────────────────────────

export async function generateMealPlan(options: {
  weekStart: string   // Saturday date
  budget: number      // target food budget for week
  currentDeals: AhDeal[]
  userMeals?: string  // optional user-specified meals
  previousPlans?: string // last 2 weeks to avoid repetition
}): Promise<MealPlanData> {
  const dealsText = options.currentDeals.length > 0
    ? options.currentDeals.map(d => `- ${d.name}: ${d.discount}`).join('\n')
    : 'No current deals available'

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `You are a meal planner for a Dutch couple who shops at Albert Heijn. 
They meal prep on Sundays — all recipes must be simple (max 30 min active time) and batch-cook friendly.
Cuisine style: Indian and European mixed. Budget-conscious and health-focused.

Week starting: ${options.weekStart} (Saturday)
Weekly grocery budget: €${options.budget}
${options.userMeals ? `User requested meals: ${options.userMeals}` : 'Generate a full AI-recommended plan'}
${options.previousPlans ? `Avoid repeating from recent weeks: ${options.previousPlans}` : ''}

Current AH Bonus deals this week:
${dealsText}

Generate a meal plan for 7 lunches and 7 dinners. Rules:
- All text in English
- AH product names: Dutch first, then English in brackets e.g. "Kipblokjes (chicken pieces)"  
- Prioritise ingredients on Bonus deal this week
- Include realistic AH prices (NL 2026 prices)
- Mark meal_prep_friendly: true if it can be batch cooked Sunday
- Recipes: simple numbered steps, max 6 steps, home cooking level
- Mix Indian and European across the week (4 European, 3 Indian or similar)
- Lunches should be lighter (salads, wraps, soup)
- Dinners more substantial
- Total estimated cost should not exceed €${options.budget * 0.7} (leaving room for breakfast/snacks)

Respond with ONLY a JSON object, no markdown:
{
  "lunches": [
    {
      "day": "Saturday",
      "name": "Meal name",
      "cuisine": "Indian|European|Mixed",
      "prep_time_min": 25,
      "meal_prep_friendly": true,
      "estimated_cost": 5.40,
      "ingredients": [
        {
          "ah_name": "AH Volkoren wraps",
          "english_name": "wholegrain wraps",
          "quantity": "4 stuks",
          "est_price": 1.89,
          "bonus_deal": false,
          "category": "Brood & Bakkerij"
        }
      ],
      "recipe_steps": ["Step 1...", "Step 2..."],
      "tip": "Optional tip"
    }
  ],
  "dinners": [ ...same structure... ]
}`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  try {
    return JSON.parse(text.replace(/```json?|```/g, '').trim())
  } catch {
    return { lunches: [], dinners: [] }
  }
}

// ─── Build shopping list from meal plan ─────────────────────────

export async function buildShoppingList(mealPlan: MealPlanData, deals: AhDeal[]) {
  const allIngredients = [
    ...mealPlan.lunches.flatMap(m => m.ingredients),
    ...mealPlan.dinners.flatMap(m => m.ingredients),
  ]

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Consolidate this ingredient list into a deduplicated AH shopping list, grouped by store category.
Combine duplicate ingredients (e.g. 2× "Ui (onion) 500g" → "Ui (onion) 1kg").
Sort by AH store layout: Groente & Fruit first, then Zuivel, Vlees, Brood, Dranken, Droog, Huishoud.

Current deals: ${deals.map(d => d.name).join(', ')}

Ingredients:
${JSON.stringify(allIngredients, null, 2)}

Respond with ONLY JSON array, no markdown:
[
  {
    "category": "Groente & Fruit (Produce)",
    "items": [
      { "ah_name": "Tomaten (tomatoes)", "english_name": "tomatoes", "quantity": "500g", "est_price": 1.49, "bonus_deal": false }
    ]
  }
]`
    }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  try {
    return JSON.parse(text.replace(/```json?|```/g, '').trim())
  } catch {
    return []
  }
}

// ─── AH Deals fetch ─────────────────────────────────────────────

export async function fetchAhDeals(): Promise<AhDeal[]> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    tools: [{
      type: 'web_search_20250305' as const,
      name: 'web_search',
    }],
    messages: [{
      role: 'user',
      content: `Search for current Albert Heijn bonus deals and promotions this week in the Netherlands (ah.nl/bonus).
Find the current week's Bonuskaart offers including product name, discount percentage or deal price, and category.
Return a JSON array of deals. Focus on food items. Get at least 15 deals if available.

Format each deal as:
{ "name": "product name in Dutch", "discount": "e.g. 2e halve prijs or 50% korting", "category": "category", "deal_price": number_or_null, "valid_until": "date_or_null" }

Return ONLY the JSON array, no markdown.`
    }]
  })

  // Extract text from response (may include tool use blocks)
  const textBlock = response.content.find(b => b.type === 'text')
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : '[]'

  try {
    return JSON.parse(text.replace(/```json?|```/g, '').trim())
  } catch {
    return []
  }
}
