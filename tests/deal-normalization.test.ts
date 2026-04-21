import test from 'node:test'
import assert from 'node:assert/strict'

import { dedupeAndScoreDeals, summarizeDealQuality } from '../lib/deal-normalization.ts'

test('dedupeAndScoreDeals collapses duplicate deals and normalizes category', () => {
  const deals = dedupeAndScoreDeals([
    { name: 'ah blauwe bessen', discount: ' 50 % korting ', category: 'groente en fruit' },
    { name: 'AH Blauwe Bessen', discount: '50% korting', category: 'Groente & Fruit', deal_price: 2.49 },
  ], '2026-04-28')

  assert.equal(deals.length, 1)
  assert.equal(deals[0].category, 'Groente & Fruit')
  assert.equal(deals[0].normalized_name, 'AH BLAUWE BESSEN')
  assert.equal(deals[0].confidence, 100)
})

test('summarizeDealQuality grades sparse weak sets as low quality', () => {
  const summary = summarizeDealQuality([
    { name: 'Cola', discount: 'actie', confidence: 40 },
    { name: 'Chips', discount: 'deal', confidence: 35 },
  ])

  assert.equal(summary.total, 2)
  assert.equal(summary.quality, 'low')
  assert.equal(summary.avg_confidence, 37.5)
})
