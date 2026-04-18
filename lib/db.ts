import { neon } from '@neondatabase/serverless'

// Use a placeholder during build — real URL is injected at runtime by Vercel
const sql = neon(process.env.POSTGRES_URL ?? 'postgresql://build:build@localhost/build')

export default sql

// ─── Type helpers ───────────────────────────────────────────────

export interface Receipt {
  id: number
  filename: string
  blob_url: string
  store_id: string | null
  receipt_date: string
  receipt_time: string | null
  year: number
  month: number
  week_saturday: string
  item_count: number | null
  subtotal: number | null
  bonus_savings: number
  koopzegels: number
  statiegeld: number
  net_grocery_spend: number | null
  total_paid: number | null
  payment_method: string | null
  parsed: boolean
  parse_error: string | null
  reviewed_at?: string | null
  created_at: string
  // joined
  store_name?: string
}

export interface ReceiptItem {
  id: number
  receipt_id: number
  quantity: number
  raw_name: string
  clean_name: string | null
  normalized_name: string | null
  category: string | null
  subcategory: string | null
  unit_price: number | null
  total_price: number
  is_bonus_item: boolean
  is_own_brand: boolean
  is_statiegeld: boolean
  is_koopzegel: boolean
  is_non_food: boolean
  btw_rate: number | null
}

export interface MealPlan {
  id: number
  week_saturday: string
  generated_by: string
  meals_json: MealPlanData
  shopping_list: ShoppingListItem[] | null
  estimated_cost: number | null
  actual_cost: number | null
  notes: string | null
  created_at: string
}

export interface MealPlanData {
  lunches: Meal[]
  dinners: Meal[]
}

export interface Meal {
  day: string  // 'Monday' etc
  name: string
  cuisine: 'Indian' | 'European' | 'Mixed'
  prep_time_min: number
  meal_prep_friendly: boolean
  ingredients: MealIngredient[]
  recipe_steps: string[]
  estimated_cost: number
  tip?: string
}

export interface MealIngredient {
  ah_name: string       // Dutch AH product name
  english_name: string  // English translation
  quantity: string      // '500g', '2 stuks'
  est_price: number
  bonus_deal: boolean
  category: string
}

export interface ShoppingListItem {
  category: string
  items: {
    ah_name: string
    english_name: string
    quantity: string
    est_price: number
    bonus_deal: boolean
  }[]
}

export interface AhDeal {
  name: string
  discount: string
  original_price?: number
  deal_price?: number
  valid_until?: string
  category?: string
  matched_product?: string
  match_type?: 'exact' | 'partial'
  recommendation?: 'buy_now' | 'good_if_needed'
  score?: number
}
