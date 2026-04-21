import sql from './db.ts'
import { normalizeItemName } from './normalization.ts'
import type { AhDeal } from './db.ts'

export interface ProductInsight {
  name: string
  category: string | null
  is_own_brand: boolean
  purchase_count: number
  total_spend: number
  avg_unit_price: number | null
  latest_unit_price: number | null
  first_unit_price: number | null
  price_change_pct: number | null
  last_bought: string | null
}

export interface DealRecommendation extends AhDeal {
  matched_product: string
  match_type: 'exact' | 'partial'
  recommendation: 'buy_now' | 'good_if_needed'
  score: number
}

export interface ProductSubstitution {
  source_name: string
  source_category: string | null
  source_avg_price: number
  source_purchase_count: number
  target_name: string
  target_category: string | null
  target_avg_price: number
  target_purchase_count: number
  estimated_saving_per_buy: number
  estimated_annual_saving: number
  confidence: 'high' | 'medium'
  score: number
}

function toNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3)
}

function baseProductKey(value: string): string {
  const stopwords = new Set(['ah', 'albert', 'heijn'])
  const tokens = tokenize(normalizeItemName(value)).filter((token) => !stopwords.has(token))
  return tokens.slice(0, 4).join(' ')
}

export async function getProductIntelligence(limit = 12): Promise<ProductInsight[]> {
  const rows = await sql`
    WITH product_history AS (
      SELECT
        COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name) AS product_name,
        ri.category,
        BOOL_OR(COALESCE(ri.is_own_brand, false) OR ri.raw_name LIKE 'AH %' OR ri.raw_name LIKE 'ALBERT HEIJN %') AS is_own_brand,
        COUNT(DISTINCT ri.receipt_id) AS purchase_count,
        ROUND(SUM(ri.total_price)::numeric, 2) AS total_spend,
        ROUND(AVG(ri.unit_price)::numeric, 2) AS avg_unit_price,
        TO_CHAR(MAX(r.receipt_date), 'YYYY-MM-DD') AS last_bought
      FROM receipt_items ri
      JOIN receipts r ON ri.receipt_id = r.id
      WHERE r.parsed = true
        AND ri.raw_name NOT IN ('SUBTOTAAL', 'KOOPZEGELS')
        AND ri.is_statiegeld = false
        AND ri.is_koopzegel = false
        AND ri.unit_price IS NOT NULL
      GROUP BY COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name), ri.category
      HAVING COUNT(DISTINCT ri.receipt_id) >= 2
    ),
    price_points AS (
      SELECT
        COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name) AS product_name,
        ri.unit_price,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name)
          ORDER BY r.receipt_date ASC
        ) AS rn_first,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(ri.normalized_name, ri.clean_name, ri.raw_name)
          ORDER BY r.receipt_date DESC
        ) AS rn_latest
      FROM receipt_items ri
      JOIN receipts r ON ri.receipt_id = r.id
      WHERE r.parsed = true
        AND ri.raw_name NOT IN ('SUBTOTAAL', 'KOOPZEGELS')
        AND ri.is_statiegeld = false
        AND ri.is_koopzegel = false
        AND ri.unit_price IS NOT NULL
    )
    SELECT
      ph.product_name AS name,
      ph.category,
      ph.is_own_brand,
      ph.purchase_count,
      ph.total_spend,
      ph.avg_unit_price,
      ph.last_bought,
      MAX(CASE WHEN pp.rn_first = 1 THEN pp.unit_price END) AS first_unit_price,
      MAX(CASE WHEN pp.rn_latest = 1 THEN pp.unit_price END) AS latest_unit_price
    FROM product_history ph
    JOIN price_points pp ON ph.product_name = pp.product_name
    GROUP BY
      ph.product_name,
      ph.category,
      ph.is_own_brand,
      ph.purchase_count,
      ph.total_spend,
      ph.avg_unit_price,
      ph.last_bought
    ORDER BY ph.purchase_count DESC, ph.total_spend DESC
    LIMIT ${limit}
  `

  return rows.map((row: Record<string, unknown>) => {
    const first = toNumber(row.first_unit_price)
    const latest = toNumber(row.latest_unit_price)
    return {
      name: String(row.name ?? ''),
      category: row.category ? String(row.category) : null,
      is_own_brand: Boolean(row.is_own_brand),
      purchase_count: Number(row.purchase_count ?? 0),
      total_spend: Number(row.total_spend ?? 0),
      avg_unit_price: toNumber(row.avg_unit_price),
      latest_unit_price: latest,
      first_unit_price: first,
      price_change_pct: first && latest ? Math.round(((latest - first) / first) * 100) : null,
      last_bought: row.last_bought ? String(row.last_bought) : null,
    }
  })
}

export function recommendDealsForProducts(deals: AhDeal[], products: ProductInsight[], limit = 6): DealRecommendation[] {
  const recommendations: DealRecommendation[] = []

  for (const deal of deals) {
    const normalizedDeal = deal.normalized_name ?? normalizeItemName(deal.name)
    const dealTokens = tokenize(normalizedDeal)

    let bestMatch: { product: ProductInsight; score: number; match_type: 'exact' | 'partial' } | null = null

    for (const product of products) {
      const normalizedProduct = normalizeItemName(product.name)
      let score = 0
      let matchType: 'exact' | 'partial' | null = null

      if (normalizedProduct === normalizedDeal) {
        score = 100
        matchType = 'exact'
      } else {
        const productTokens = tokenize(normalizedProduct)
        const overlap = productTokens.filter((token) => dealTokens.includes(token))
        if (overlap.length >= 2 || (overlap.length >= 1 && normalizedDeal.includes(normalizedProduct))) {
          score = overlap.length * 18
          matchType = 'partial'
        }
      }

      if (!matchType) continue

      score += product.purchase_count * 6
      score += Math.min(20, Math.round(product.total_spend / 5))

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { product, score, match_type: matchType }
      }
    }

    if (!bestMatch) continue

    recommendations.push({
      ...deal,
      matched_product: bestMatch.product.name,
      match_type: bestMatch.match_type,
      recommendation: bestMatch.score >= 110 ? 'buy_now' : 'good_if_needed',
      score: bestMatch.score,
    })
  }

  return recommendations
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export async function buildSubstitutionRecommendations(limit = 12): Promise<ProductSubstitution[]> {
  const products = await getProductIntelligence(250)
  const ownBrand = products.filter((product) => product.is_own_brand && product.avg_unit_price !== null)
  const aBrand = products.filter((product) => !product.is_own_brand && product.avg_unit_price !== null)

  const substitutions: ProductSubstitution[] = []

  for (const source of aBrand) {
    const sourceKey = baseProductKey(source.name)
    if (!sourceKey || source.avg_unit_price === null) continue

    let best: ProductSubstitution | null = null

    for (const target of ownBrand) {
      if (target.avg_unit_price === null) continue
      if (target.category !== source.category) continue

      const targetKey = baseProductKey(target.name)
      if (!targetKey) continue

      const sourceTokens = sourceKey.split(' ').filter(Boolean)
      const targetTokens = targetKey.split(' ').filter(Boolean)
      const overlap = sourceTokens.filter((token) => targetTokens.includes(token))

      if (overlap.length === 0) continue
      if (target.avg_unit_price >= source.avg_unit_price) continue

      const tokenCoverage = overlap.length / Math.max(sourceTokens.length, 1)
      if (tokenCoverage < 0.5 && overlap.length < 2) continue

      const savingPerBuy = Math.round((source.avg_unit_price - target.avg_unit_price) * 100) / 100
      const annualizedTrips = source.purchase_count * (52 / 16)
      const annualSaving = Math.round(savingPerBuy * annualizedTrips * 100) / 100
      const score = Math.round((tokenCoverage * 100) + (source.purchase_count * 4) + Math.min(20, annualSaving))

      const candidate: ProductSubstitution = {
        source_name: source.name,
        source_category: source.category,
        source_avg_price: source.avg_unit_price,
        source_purchase_count: source.purchase_count,
        target_name: target.name,
        target_category: target.category,
        target_avg_price: target.avg_unit_price,
        target_purchase_count: target.purchase_count,
        estimated_saving_per_buy: savingPerBuy,
        estimated_annual_saving: annualSaving,
        confidence: tokenCoverage >= 0.8 ? 'high' : 'medium',
        score,
      }

      if (!best || candidate.score > best.score) {
        best = candidate
      }
    }

    if (best) substitutions.push(best)
  }

  return substitutions
    .sort((a, b) => b.estimated_annual_saving - a.estimated_annual_saving || b.score - a.score)
    .slice(0, limit)
}
