import test from 'node:test'
import assert from 'node:assert/strict'

import { markPantryCoveredShoppingList } from '../lib/shopping-list.ts'

test('markPantryCoveredShoppingList flags pantry-covered families and pushes them down', () => {
  const list = markPantryCoveredShoppingList(
    [
      {
        category: 'Zuivel & Eieren',
        items: [
          { ah_name: 'AH Halfvolle Melk', english_name: 'semi-skimmed milk', quantity: '1 l', est_price: 1.35, bonus_deal: false },
          { ah_name: 'Vrije uitloop eieren', english_name: 'free-range eggs', quantity: '6 stuks', est_price: 2.99, bonus_deal: false },
        ],
      },
    ],
    ['halfvolle melk']
  )

  assert.equal(list[0]?.items[0]?.ah_name, 'Vrije uitloop eieren')
  assert.equal(list[0]?.items[0]?.pantry_covered, false)
  assert.equal(list[0]?.items[1]?.ah_name, 'AH Halfvolle Melk')
  assert.equal(list[0]?.items[1]?.pantry_covered, true)
})
