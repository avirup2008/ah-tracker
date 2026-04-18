import sql from './db.ts'
import { normalizeItemName } from './normalization.ts'
import type { MealPlan, ShoppingListItem } from './db.ts'

export interface ReconciliationItem {
  planned_name: string
  matched_name: string | null
  quantity?: string
  category?: string | null
  est_price?: number | null
  actual_spend?: number | null
  status: 'matched' | 'missing'
}

export interface UnplannedPurchase {
  name: string
  category: string | null
  spend: number
  purchase_count: number
}

export interface MealPlanReconciliation {
  week_saturday: string
  planned_items: number
  matched_items: number
  missing_items: number
  adherence_pct: number
  planned_estimated_cost: number
  matched_actual_spend: number
  impulse_spend: number
  matched: ReconciliationItem[]
  missing: ReconciliationItem[]
  unplanned: UnplannedPurchase[]
}

interface PurchaseRow {
  normalized_name: string
  display_name: string
  category: string | null
  spend: number
  purchase_count: number
}

interface PlannedRow {
  planned_name: string
  normalized_name: string
  quantity?: string
  category?: string | null
  est_price?: number | null
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3)
}

export function flattenShoppingList(shoppingList: ShoppingListItem[] | null | undefined): PlannedRow[] {
  if (!shoppingList) return []

  return shoppingList.flatMap((section) =>
    section.items.map((item) => ({
      planned_name: item.ah_name,
      normalized_name: normalizeItemName(item.ah_name),
      quantity: item.quantity,
      category: section.category,
      est_price: item.est_price,
    }))
  )
}

export function matchPlannedItems(plannedItems: PlannedRow[], purchases: PurchaseRow[]) {
  const usedPurchaseNames = new Set<string>()
  const matched: ReconciliationItem[] = []
  const missing: ReconciliationItem[] = []

  for (const planned of plannedItems) {
    let best: PurchaseRow | null = null
    let bestScore = 0

    for (const purchase of purchases) {
      if (usedPurchaseNames.has(purchase.normalized_name)) continue

      let score = 0
      if (purchase.normalized_name === planned.normalized_name) {
        score = 100
      } else {
        const plannedTokens = tokenize(planned.normalized_name)
        const purchaseTokens = tokenize(purchase.normalized_name)
        const overlap = plannedTokens.filter((token) => purchaseTokens.includes(token))
        if (overlap.length >= 2 || planned.normalized_name.includes(purchase.normalized_name) || purchase.normalized_name.includes(planned.normalized_name)) {
          score = overlap.length * 20 + 20
        }
      }

      if (score > bestScore) {
        best = purchase
        bestScore = score
      }
    }

    if (best && bestScore >= 40) {
      usedPurchaseNames.add(best.normalized_name)
      matched.push({
        planned_name: planned.planned_name,
        matched_name: best.display_name,
        quantity: planned.quantity,
        category: planned.category,
        est_price: planned.est_price ?? null,
        actual_spend: best.spend,
        status: 'matched',
      })
    } else {
      missing.push({
        planned_name: planned.planned_name,
        matched_name: null,
        quantity: planned.quantity,
        category: planned.category,
        est_price: planned.est_price ?? null,
        actual_spend: null,
        status: 'missing',
      })
    }
  }

  const unplanned = purchases
    .filter((purchase) => !usedPurchaseNames.has(purchase.normalized_name))
    .map((purchase) => ({
      name: purchase.display_name,
      category: purchase.category,
      spend: purchase.spend,
      purchase_count: purchase.purchase_count,
    }))

  return { matched, missing, unplanned }
}

async function getPurchasedItemsForWeek(weekSaturday: string): Promise<PurchaseRow[]> {
  const rows = await sql`
    SELECT
      COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name) AS normalized_name,
      MAX(COALESCE(ri.clean_name, ri.raw_name)) AS display_name,
      MAX(ri.category) AS category,
      ROUND(SUM(ri.total_price)::numeric, 2) AS spend,
      COUNT(DISTINCT ri.receipt_id) AS purchase_count
    FROM receipt_items ri
    JOIN receipts r ON ri.receipt_id = r.id
    WHERE r.parsed = true
      AND r.week_saturday = ${weekSaturday}
      AND ri.raw_name NOT IN ('SUBTOTAAL', 'KOOPZEGELS')
      AND ri.is_statiegeld = false
      AND ri.is_koopzegel = false
    GROUP BY COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name)
  `

  return rows.map((row: Record<string, unknown>) => ({
    normalized_name: String(row.normalized_name ?? ''),
    display_name: String(row.display_name ?? row.normalized_name ?? ''),
    category: row.category ? String(row.category) : null,
    spend: Number(row.spend ?? 0),
    purchase_count: Number(row.purchase_count ?? 0),
  }))
}

export async function reconcileMealPlan(mealPlan: MealPlan | null): Promise<MealPlanReconciliation | null> {
  if (!mealPlan) return null

  const plannedItems = flattenShoppingList(mealPlan.shopping_list as ShoppingListItem[] | null)
  if (plannedItems.length === 0) {
    return {
      week_saturday: mealPlan.week_saturday,
      planned_items: 0,
      matched_items: 0,
      missing_items: 0,
      adherence_pct: 0,
      planned_estimated_cost: Number(mealPlan.estimated_cost ?? 0),
      matched_actual_spend: 0,
      impulse_spend: 0,
      matched: [],
      missing: [],
      unplanned: [],
    }
  }

  const purchases = await getPurchasedItemsForWeek(mealPlan.week_saturday)
  const result = matchPlannedItems(plannedItems, purchases)
  const matchedActualSpend = Math.round(result.matched.reduce((sum, item) => sum + Number(item.actual_spend ?? 0), 0) * 100) / 100
  const impulseSpend = Math.round(result.unplanned.reduce((sum, item) => sum + item.spend, 0) * 100) / 100

  return {
    week_saturday: mealPlan.week_saturday,
    planned_items: plannedItems.length,
    matched_items: result.matched.length,
    missing_items: result.missing.length,
    adherence_pct: Math.round((result.matched.length / Math.max(1, plannedItems.length)) * 100),
    planned_estimated_cost: Number(mealPlan.estimated_cost ?? 0),
    matched_actual_spend: matchedActualSpend,
    impulse_spend: impulseSpend,
    matched: result.matched,
    missing: result.missing,
    unplanned: result.unplanned.sort((a, b) => b.spend - a.spend).slice(0, 8),
  }
}
