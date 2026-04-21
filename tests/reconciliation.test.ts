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
  assert.equal(rows[0]?.family_key, 'halfvolle melk')
})

test('matchPlannedItems separates matched, missing, and unplanned purchases', () => {
  const result = matchPlannedItems(
    [
      { planned_name: 'AH Halfvolle Melk', normalized_name: 'AH HALFVOLLE MELK', family_key: 'halfvolle melk', pack_signature: null, quantity: '2 stuks', category: 'Zuivel', est_price: 3 },
      { planned_name: 'Paprika mix', normalized_name: 'PAPRIKA MIX', family_key: 'paprika mix', pack_signature: null, quantity: '3 stuks', category: 'Groente', est_price: 2.5 },
    ],
    [
      { normalized_name: 'AH HALFVOLLE MELK', family_key: 'halfvolle melk', pack_signature: null, display_name: 'AH HALFVOLLE MELK', category: 'Zuivel', spend: 3.2, purchase_count: 1 },
      { normalized_name: 'BANANEN', family_key: 'bananen', pack_signature: null, display_name: 'BANANEN', category: 'Groente & Fruit', spend: 2, purchase_count: 1 },
    ]
  )

  assert.equal(result.matched.length, 1)
  assert.equal(result.missing.length, 1)
  assert.equal(result.unplanned.length, 1)
  assert.equal(result.matched[0]?.planned_name, 'AH Halfvolle Melk')
  assert.equal(result.unplanned[0]?.name, 'BANANEN')
})

test('matchPlannedItems uses family keys to match alias spellings', () => {
  const result = matchPlannedItems(
    [
      { planned_name: 'AH Blauwe Bessen 300g', normalized_name: 'AH BLAUWE BESSEN', family_key: 'blauwe bessen', pack_signature: '300g', quantity: '1 bakje', category: 'Groente & Fruit', est_price: 3.5 },
    ],
    [
      { normalized_name: 'BLAUWE BESSEN', family_key: 'blauwe bessen', pack_signature: '300g', display_name: 'Blauwe bessen', category: 'Groente & Fruit', spend: 3.1, purchase_count: 1 },
    ]
  )

  assert.equal(result.matched.length, 1)
  assert.equal(result.missing.length, 0)
  assert.equal(result.matched[0]?.matched_name, 'Blauwe bessen')
})
