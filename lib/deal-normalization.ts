import type { AhDeal } from './db'
import { normalizeItemName } from './normalization.ts'

const ALLOWED_DEAL_CATEGORIES = new Set([
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
])

export interface DealQualitySummary {
  total: number
  unique_products: number
  category_coverage: number
  missing_prices: number
  avg_confidence: number
  quality: 'high' | 'medium' | 'low'
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeDiscount(discount: string) {
  return collapseWhitespace(
    discount
      .replace(/eur/gi, '€')
      .replace(/\s*euro/gi, '€')
      .replace(/,\s*(\d{2})/g, ',$1')
      .replace(/\s*%\s*/g, '% ')
      .replace(/\s+/g, ' ')
  )
}

function normalizeCategory(category?: string | null) {
  if (!category) return undefined
  const cleaned = collapseWhitespace(category)
  if (ALLOWED_DEAL_CATEGORIES.has(cleaned)) return cleaned

  const lowered = cleaned.toLowerCase()
  if (lowered.includes('groente') || lowered.includes('fruit')) return 'Groente & Fruit'
  if (lowered.includes('zuivel') || lowered.includes('eieren')) return 'Zuivel & Eieren'
  if (lowered.includes('brood') || lowered.includes('bakkerij')) return 'Brood & Bakkerij'
  if (lowered.includes('pasta') || lowered.includes('rijst') || lowered.includes('granen')) return 'Pasta, Rijst & Granen'
  if (lowered.includes('saus') || lowered.includes('kruid')) return 'Sauzen & Kruiden'
  if (lowered.includes('maaltijd')) return 'Maaltijden kant-en-klaar'
  if (lowered.includes('snack') || lowered.includes('zoet')) return 'Snacks & Zoetwaren'
  if (lowered.includes('drank')) return 'Dranken'
  if (lowered.includes('bier') || lowered.includes('wijn')) return 'Bier & Wijn'
  if (lowered.includes('huishoud')) return 'Huishoud'
  if (lowered.includes('verzorg')) return 'Persoonlijke verzorging'
  if (lowered.includes('non-food')) return 'Overig non-food'
  if (lowered.includes('vlees') || lowered.includes('vis')) return 'Vlees & Vis'
  return undefined
}

function clampCurrency(value: unknown): number | undefined {
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(amount)) return undefined
  return Math.max(0, Math.round(amount * 100) / 100)
}

function computeConfidence(deal: AhDeal) {
  let score = 0
  if (deal.name.length >= 6) score += 30
  if (deal.category) score += 20
  if (deal.discount.match(/\d/)) score += 25
  if (deal.discount.includes('%') || deal.discount.includes('voor') || deal.discount.includes('halve')) score += 15
  if (deal.deal_price !== undefined || deal.original_price !== undefined) score += 10
  return Math.min(100, score)
}

export function normalizeDeal(input: AhDeal, validUntil: string): AhDeal | null {
  const rawName = collapseWhitespace(input.name ?? '')
  const rawDiscount = collapseWhitespace(input.discount ?? '')
  if (!rawName || !rawDiscount) return null
  if (rawName.length < 4) return null

  const name = toTitleCase(rawName)
  const discount = normalizeDiscount(rawDiscount)
  const normalizedName = normalizeItemName(name)
  const category = normalizeCategory(input.category)
  const originalPrice = clampCurrency(input.original_price)
  const dealPrice = clampCurrency(input.deal_price)

  const deal: AhDeal = {
    ...input,
    name,
    normalized_name: normalizedName,
    discount,
    category,
    original_price: originalPrice,
    deal_price: dealPrice,
    valid_until: validUntil,
  }
  deal.confidence = computeConfidence(deal)
  return deal
}

export function dedupeAndScoreDeals(deals: AhDeal[], validUntil: string): AhDeal[] {
  const byKey = new Map<string, AhDeal>()

  for (const deal of deals) {
    const normalized = normalizeDeal(deal, validUntil)
    if (!normalized) continue

    const key = normalized.normalized_name
      ? `${normalized.normalized_name}::${normalized.discount}`
      : `${normalized.name}::${normalized.discount}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, normalized)
      continue
    }

    const existingScore = existing.confidence ?? 0
    const nextScore = normalized.confidence ?? 0
    if (nextScore > existingScore || (!existing.category && normalized.category)) {
      byKey.set(key, normalized)
    }
  }

  return [...byKey.values()]
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || a.name.localeCompare(b.name))
}

export function summarizeDealQuality(deals: AhDeal[]): DealQualitySummary {
  const uniqueProducts = new Set(deals.map((deal) => deal.normalized_name ?? deal.name))
  const categories = new Set(deals.map((deal) => deal.category).filter(Boolean))
  const missingPrices = deals.filter((deal) => deal.deal_price === undefined && deal.original_price === undefined).length
  const avgConfidence = deals.length
    ? Math.round((deals.reduce((sum, deal) => sum + (deal.confidence ?? 0), 0) / deals.length) * 10) / 10
    : 0

  const quality: DealQualitySummary['quality'] =
    deals.length >= 12 && avgConfidence >= 75 ? 'high' :
    deals.length >= 8 && avgConfidence >= 60 ? 'medium' :
    'low'

  return {
    total: deals.length,
    unique_products: uniqueProducts.size,
    category_coverage: categories.size,
    missing_prices: missingPrices,
    avg_confidence: avgConfidence,
    quality,
  }
}
