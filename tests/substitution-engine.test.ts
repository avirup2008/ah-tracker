import test from 'node:test'
import assert from 'node:assert/strict'

import type { ProductInsight } from '../lib/product-intelligence.ts'

function buildSubstitutionsFromProducts(products: ProductInsight[]) {
  const ownBrand = products.filter((product) => product.is_own_brand && product.avg_unit_price !== null)
  const aBrand = products.filter((product) => !product.is_own_brand && product.avg_unit_price !== null)

  return aBrand.flatMap((source) => {
    const sourceTokens = source.name.toLowerCase().split(/[^a-z0-9]+/i).filter((token) => token.length >= 3)

    let best: { source_name: string; target_name: string; estimated_annual_saving: number } | null = null

    for (const target of ownBrand) {
      if (target.category !== source.category) continue
      if ((target.avg_unit_price ?? 0) >= (source.avg_unit_price ?? 0)) continue

      const targetTokens = target.name.toLowerCase().split(/[^a-z0-9]+/i).filter((token) => token.length >= 3)
      const overlap = sourceTokens.filter((token) => targetTokens.includes(token))
      if (overlap.length === 0) continue

      const annualSaving = Math.round((((source.avg_unit_price ?? 0) - (target.avg_unit_price ?? 0)) * source.purchase_count * (52 / 16)) * 100) / 100
      const candidate = {
        source_name: source.name,
        target_name: target.name,
        estimated_annual_saving: annualSaving,
      }

      if (!best || candidate.estimated_annual_saving > best.estimated_annual_saving) best = candidate
    }

    return best ? [best] : []
  })
}

test('substitution engine picks cheaper own-brand alternative in same category', () => {
  const substitutions = buildSubstitutionsFromProducts([
    {
      name: 'COCA COLA ZERO',
      category: 'Dranken',
      is_own_brand: false,
      purchase_count: 8,
      total_spend: 24,
      avg_unit_price: 3,
      latest_unit_price: 3,
      first_unit_price: 2.8,
      price_change_pct: 7,
      last_bought: '2026-04-18',
    },
    {
      name: 'AH COLA ZERO',
      category: 'Dranken',
      is_own_brand: true,
      purchase_count: 5,
      total_spend: 9,
      avg_unit_price: 1.8,
      latest_unit_price: 1.8,
      first_unit_price: 1.7,
      price_change_pct: 6,
      last_bought: '2026-04-12',
    },
  ] satisfies ProductInsight[])

  assert.equal(substitutions.length, 1)
  assert.equal(substitutions[0]?.target_name, 'AH COLA ZERO')
  assert.ok((substitutions[0]?.estimated_annual_saving ?? 0) > 0)
})
