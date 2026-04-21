import test from 'node:test'
import assert from 'node:assert/strict'

import { buildFamilyKey, buildProductCatalog, extractPackSignature } from '../lib/product-catalog.ts'
import type { ProductInsight } from '../lib/product-intelligence.ts'

test('extractPackSignature finds simple pack sizes', () => {
  assert.equal(extractPackSignature('AH PINDAKAAS 500G'), '500g')
  assert.equal(extractPackSignature('COCA COLA ZERO 1.5L'), '1.5l')
  assert.equal(extractPackSignature('VERSE SOEP'), null)
})

test('buildFamilyKey removes brand noise and pack tokens', () => {
  assert.equal(buildFamilyKey('AH Halfvolle melk 1L'), 'halfvolle melk')
  assert.equal(buildFamilyKey('Albert Heijn Volkoren pasta 500g'), 'volkoren pasta')
})

test('buildProductCatalog groups aliases into one canonical family', () => {
  const catalog = buildProductCatalog([
    {
      name: 'AH HALFVOLLE MELK',
      category: 'Zuivel & Eieren',
      is_own_brand: true,
      purchase_count: 6,
      total_spend: 10.5,
      avg_unit_price: 1.75,
      latest_unit_price: 1.8,
      first_unit_price: 1.6,
      price_change_pct: 13,
      last_bought: '2026-04-20',
    },
    {
      name: 'ALBERT HEIJN HALFVOLLE MELK 1L',
      category: 'Zuivel & Eieren',
      is_own_brand: true,
      purchase_count: 3,
      total_spend: 5.4,
      avg_unit_price: 1.8,
      latest_unit_price: 1.8,
      first_unit_price: 1.7,
      price_change_pct: 6,
      last_bought: '2026-04-10',
    },
  ] satisfies ProductInsight[])

  assert.equal(catalog.length, 1)
  assert.equal(catalog[0]?.canonical_name, 'AH HALFVOLLE MELK')
  assert.equal(catalog[0]?.purchase_count, 9)
  assert.deepEqual(catalog[0]?.aliases, ['AH HALFVOLLE MELK', 'ALBERT HEIJN HALFVOLLE MELK 1L'])
})
