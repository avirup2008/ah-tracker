import { normalizeItemName } from './normalization.ts'
import type { ProductInsight } from './product-intelligence.ts'

export interface ProductCatalogEntry {
  canonical_name: string
  category: string | null
  is_own_brand: boolean
  family_key: string
  pack_signature: string | null
  purchase_count: number
  total_spend: number
  avg_unit_price: number | null
  latest_unit_price: number | null
  first_unit_price: number | null
  price_change_pct: number | null
  last_bought: string | null
  aliases: string[]
}

const BRAND_STOPWORDS = new Set(['ah', 'albert', 'heijn'])

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 2)
}

export function extractPackSignature(value: string): string | null {
  const normalized = value.toLowerCase().replace(',', '.')
  const match = normalized.match(/(\d+(?:\.\d+)?)\s?(kg|g|ml|l|stuks|stuk|x\d+)/i)
  if (!match) return null
  return `${match[1]}${match[2].toLowerCase()}`
}

export function buildFamilyKey(value: string): string {
  const normalized = normalizeItemName(value)
  const tokens = tokenize(normalized)
    .filter((token) => !BRAND_STOPWORDS.has(token))
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !/^\d+(?:\.\d+)?(?:kg|g|ml|l)$/.test(token))
    .filter((token) => !['kg', 'g', 'ml', 'l', 'stuks', 'stuk'].includes(token))

  return tokens.slice(0, 5).join(' ')
}

export function buildProductCatalog(products: ProductInsight[]): ProductCatalogEntry[] {
  const families = new Map<string, ProductCatalogEntry>()

  for (const product of products) {
    const familyKey = buildFamilyKey(product.name)
    if (!familyKey) continue

    const existing = families.get(familyKey)
    const aliases = existing ? new Set(existing.aliases) : new Set<string>()
    aliases.add(product.name)

    const canonicalName = existing
      ? (existing.purchase_count >= product.purchase_count ? existing.canonical_name : product.name)
      : product.name

    const merged: ProductCatalogEntry = {
      canonical_name: canonicalName,
      category: existing?.category ?? product.category,
      is_own_brand: existing ? existing.is_own_brand && product.is_own_brand : product.is_own_brand,
      family_key: familyKey,
      pack_signature: existing?.pack_signature ?? extractPackSignature(product.name),
      purchase_count: (existing?.purchase_count ?? 0) + product.purchase_count,
      total_spend: Math.round((((existing?.total_spend ?? 0) + product.total_spend) * 100)) / 100,
      avg_unit_price: weightedAverage(
        existing?.avg_unit_price ?? null,
        existing?.purchase_count ?? 0,
        product.avg_unit_price,
        product.purchase_count
      ),
      latest_unit_price: product.latest_unit_price ?? existing?.latest_unit_price ?? null,
      first_unit_price: existing?.first_unit_price ?? product.first_unit_price ?? null,
      price_change_pct: product.price_change_pct ?? existing?.price_change_pct ?? null,
      last_bought: maxDate(existing?.last_bought ?? null, product.last_bought),
      aliases: [...aliases].sort(),
    }

    families.set(familyKey, merged)
  }

  return [...families.values()].sort((a, b) => b.purchase_count - a.purchase_count || b.total_spend - a.total_spend)
}

function weightedAverage(a: number | null, aCount: number, b: number | null, bCount: number) {
  if (a === null && b === null) return null
  if (a === null) return b
  if (b === null) return a
  const totalCount = Math.max(1, aCount + bCount)
  return Math.round((((a * aCount) + (b * bCount)) / totalCount) * 100) / 100
}

function maxDate(a: string | null, b: string | null) {
  if (!a) return b
  if (!b) return a
  return a >= b ? a : b
}
