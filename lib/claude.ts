import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ParsedItem } from './parser'
import type { MealPlanData, AhDeal } from './db'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)
const MODEL = 'gemini-2.5-flash-lite'

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

  const text = await ask(prompt)
  const parsed = parseJSON<Array<CategorisedItem & { index: number }>>(text, [])

  return parsed.map(p => ({
    rawName: filteredItems[p.index]?.rawName ?? '',
    cleanName: p.cleanName,
    category: p.category,
    subcategory: p.subcategory,
    isNonFood: p.isNonFood,
    btwRate: p.btwRate,
  }))
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
  currentDeals: AhDeal[]
  userMeals?: string
  previousPlans?: string
}): Promise<MealPlanData> {
  const dealsText = options.currentDeals.length > 0
    ? options.currentDeals.map(d => `- ${d.name}: ${d.discount}`).join('\n')
    : 'No current deals available'

  const prompt = `You are a meal planner for a Dutch couple who shops at Albert Heijn.
They meal prep on Sundays. Recipes must be simple (max 30 min active time) and batch-cook friendly.
Cuisine: Indian and European mixed. Budget-conscious and healthy.

Week starting: ${options.weekStart} (Saturday)
Weekly grocery budget: €${options.budget}
${options.userMeals ? `User requested meals: ${options.userMeals}` : 'Generate a full AI-recommended plan'}
${options.previousPlans ? `Avoid repeating from recent weeks: ${options.previousPlans}` : ''}

Current AH Bonus deals:
${dealsText}

Generate 7 lunches + 7 dinners. Rules:
- All text in English
- AH product names: Dutch first, English in brackets e.g. "Kipblokjes (chicken pieces)"
- Prioritise Bonus deal ingredients
- Use realistic AH 2026 NL prices
- meal_prep_friendly: true if can batch cook Sunday
- Simple recipes: max 6 numbered steps
- Mix: ~4 European, ~3 Indian per week
- Lunches: lighter (salads, wraps, soup). Dinners: more substantial
- Total cost max €${Math.round(options.budget * 0.7)} (leaving room for breakfast/snacks)

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
  return parseJSON<MealPlanData>(text, { lunches: [], dinners: [] })
}

// ─── Shopping list builder ───────────────────────────────────────
export async function buildShoppingList(mealPlan: MealPlanData, deals: AhDeal[]) {
  const allIngredients = [
    ...mealPlan.lunches.flatMap(m => m.ingredients),
    ...mealPlan.dinners.flatMap(m => m.ingredients),
  ]

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

  const text = await ask(prompt)
  return parseJSON<unknown[]>(text, [])
}

// ─── AH Deals — uses Gemini Google Search grounding ─────────────
export async function fetchAhDeals(): Promise<AhDeal[]> {
  const prompt = `Search for the current Albert Heijn bonus deals and Bonuskaart promotions 
this week in the Netherlands at ah.nl/bonus.

Return a JSON array of at least 15 current food deals. Each deal:
{"name":"product name in Dutch","discount":"e.g. 2e halve prijs or 50% korting","category":"food category","deal_price":null,"valid_until":null}

Respond with ONLY a valid JSON array, no markdown.`

  // useSearch=true enables Gemini's built-in Google Search grounding
  const text = await ask(prompt, true)
  return parseJSON<AhDeal[]>(text, [])
}
