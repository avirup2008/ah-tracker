import test from 'node:test'
import assert from 'node:assert/strict'

import { flattenShoppingList, matchPlannedItems } from '../lib/reconciliation.ts'

test('flattenShoppingList normalizes grouped shopping list items', () => {
  const rows = flattenShoppingList([
    {
      category: 'Zuivel',
      items: [
        { ah_name: 'AH Halfvolle Melk', english_name: 'semi-skimmed milk', quantity: '2 stuks', est_price: 3, bonus_deal: false },
      ],
    },
  ])

  assert.equal(rows.length, 1)
  assert.equal(rows[0]?.normalized_name, 'AH HALFVOLLE MELK')
})

test('matchPlannedItems separates matched, missing, and unplanned purchases', () => {
  const result = matchPlannedItems(
    [
      { planned_name: 'AH Halfvolle Melk', normalized_name: 'AH HALFVOLLE MELK', quantity: '2 stuks', category: 'Zuivel', est_price: 3 },
      { planned_name: 'Paprika mix', normalized_name: 'PAPRIKA MIX', quantity: '3 stuks', category: 'Groente', est_price: 2.5 },
    ],
    [
      { normalized_name: 'AH HALFVOLLE MELK', display_name: 'AH HALFVOLLE MELK', category: 'Zuivel', spend: 3.2, purchase_count: 1 },
      { normalized_name: 'BANANEN', display_name: 'BANANEN', category: 'Groente & Fruit', spend: 2, purchase_count: 1 },
    ]
  )

  assert.equal(result.matched.length, 1)
  assert.equal(result.missing.length, 1)
  assert.equal(result.unplanned.length, 1)
  assert.equal(result.matched[0]?.planned_name, 'AH Halfvolle Melk')
  assert.equal(result.unplanned[0]?.name, 'BANANEN')
})
