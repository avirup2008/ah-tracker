import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSubstitutionRecommendationsFromCatalog } from '../lib/product-intelligence.ts'
import type { ProductCatalogEntry } from '../lib/product-catalog.ts'

test('substitution engine picks cheaper own-brand alternative in same category', () => {
  const substitutions = buildSubstitutionRecommendationsFromCatalog([
    {
      canonical_name: 'COCA COLA ZERO 1.5L',
      category: 'Dranken',
      is_own_brand: false,
      family_key: 'coca cola zero',
      pack_signature: '1.5l',
      purchase_count: 8,
      total_spend: 24,
      avg_unit_price: 3,
      latest_unit_price: 3,
      first_unit_price: 2.8,
      price_change_pct: 7,
      last_bought: '2026-04-18',
      aliases: ['COCA COLA ZERO 1.5L'],
    },
    {
      canonical_name: 'AH COLA ZERO 1.5L',
      category: 'Dranken',
      is_own_brand: true,
      family_key: 'cola zero',
      pack_signature: '1.5l',
      purchase_count: 5,
      total_spend: 9,
      avg_unit_price: 1.8,
      latest_unit_price: 1.8,
      first_unit_price: 1.7,
      price_change_pct: 6,
      last_bought: '2026-04-12',
      aliases: ['AH COLA ZERO 1.5L'],
    },
  ] satisfies ProductCatalogEntry[])

  assert.equal(substitutions.length, 1)
  assert.equal(substitutions[0]?.target_name, 'AH COLA ZERO 1.5L')
  assert.equal(substitutions[0]?.pack_match, 'exact')
  assert.ok((substitutions[0]?.estimated_annual_saving ?? 0) > 0)
})
