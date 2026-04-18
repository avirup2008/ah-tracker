import test from 'node:test'
import assert from 'node:assert/strict'

import { recommendDealsForProducts } from '../lib/product-intelligence.ts'

test('recommendDealsForProducts ranks exact purchase matches first', () => {
  const recommendations = recommendDealsForProducts(
    [
      { name: 'AH Halfvolle Melk', discount: '2 voor €3', category: 'Zuivel & Eieren' },
      { name: 'Paprika mix', discount: '25% korting', category: 'Groente & Fruit' },
    ],
    [
      {
        name: 'AH HALFVOLLE MELK',
        category: 'Zuivel & Eieren',
        is_own_brand: true,
        purchase_count: 8,
        total_spend: 20,
        avg_unit_price: 1.5,
        latest_unit_price: 1.6,
        first_unit_price: 1.3,
        price_change_pct: 23,
        last_bought: '2026-04-17',
      },
    ],
    5
  )

  assert.equal(recommendations.length, 1)
  assert.equal(recommendations[0]?.matched_product, 'AH HALFVOLLE MELK')
  assert.equal(recommendations[0]?.match_type, 'exact')
  assert.equal(recommendations[0]?.recommendation, 'buy_now')
})
