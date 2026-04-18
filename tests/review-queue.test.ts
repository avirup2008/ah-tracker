import test from 'node:test'
import assert from 'node:assert/strict'

import { assessReceiptReview } from '../lib/review-queue.ts'

test('assessReceiptReview prioritizes parse failures', () => {
  const result = assessReceiptReview({
    parsed: false,
    parse_error: 'Could not parse receipt structure',
    reviewed_at: null,
  })

  assert.equal(result.needs_review, true)
  assert.equal(result.priority, 'high')
  assert.ok(result.reasons.includes('Parse failed'))
})

test('assessReceiptReview flags parsed receipts with missing classifications', () => {
  const result = assessReceiptReview({
    parsed: true,
    parse_error: null,
    reviewed_at: null,
    store_id: '1251',
    payment_method: 'PIN',
    item_count: 5,
    total_paid: 12,
    subtotal: 12,
    koopzegels: 0,
    statiegeld: 0,
    missing_categories: 2,
    missing_clean_names: 1,
    unknown_btw: 1,
    items_total: 5,
  })

  assert.equal(result.needs_review, true)
  assert.equal(result.priority, 'medium')
  assert.ok(result.reasons.some((reason) => reason.includes('uncategorised')))
})
