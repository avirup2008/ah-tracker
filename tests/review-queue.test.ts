import test from 'node:test'
import assert from 'node:assert/strict'

import { assessReceiptReview, summarizeReviewQueue } from '../lib/review-queue.ts'

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
  assert.equal(result.priority, 'low')
  assert.ok(result.reasons.some((reason) => reason.includes('uncategorised')))
})

test('assessReceiptReview ignores missing VAT because it is not actionable', () => {
  const result = assessReceiptReview({
    parsed: true,
    parse_error: null,
    reviewed_at: '2026-04-23T00:00:00.000Z',
    store_id: '1251',
    payment_method: 'Maestro',
    item_count: 5,
    total_paid: 12,
    subtotal: 12,
    koopzegels: 0,
    statiegeld: 0,
    missing_categories: 0,
    missing_clean_names: 0,
    unknown_btw: 5,
    items_total: 5,
  })

  assert.equal(result.needs_review, false)
  assert.equal(result.priority, 'none')
  assert.equal(result.reasons.length, 0)
})

test('assessReceiptReview ignores receipt total mismatches', () => {
  const result = assessReceiptReview({
    parsed: true,
    parse_error: null,
    reviewed_at: '2026-04-23T00:00:00.000Z',
    store_id: '1251',
    payment_method: 'Maestro',
    item_count: 8,
    total_paid: 20,
    subtotal: 12,
    koopzegels: 0,
    statiegeld: 0,
    missing_categories: 0,
    missing_clean_names: 0,
    unknown_btw: 0,
    items_total: 8,
  })

  assert.equal(result.needs_review, false)
  assert.equal(result.priority, 'none')
  assert.equal(result.reasons.length, 0)
})

test('assessReceiptReview ignores one-item receipts because quick purchases are valid', () => {
  const result = assessReceiptReview({
    parsed: true,
    parse_error: null,
    reviewed_at: '2026-04-23T00:00:00.000Z',
    store_id: '1251',
    payment_method: 'Maestro',
    item_count: 1,
    total_paid: 3.5,
    subtotal: 3.5,
    koopzegels: 0,
    statiegeld: 0,
    missing_categories: 0,
    missing_clean_names: 0,
    unknown_btw: 0,
    items_total: 1,
  })

  assert.equal(result.needs_review, false)
  assert.equal(result.priority, 'none')
  assert.equal(result.reasons.length, 0)
})

test('summarizeReviewQueue counts priorities and top reasons', () => {
  const summary = summarizeReviewQueue([
    { review: { score: 80, priority: 'high', needs_review: true, reasons: ['Parse failed', 'Unknown store'] } },
    { review: { score: 45, priority: 'medium', needs_review: true, reasons: ['Unknown store'] } },
    { review: { score: 24, priority: 'low', needs_review: true, reasons: ['Never manually reviewed'] } },
  ])

  assert.equal(summary.total, 3)
  assert.equal(summary.highPriority, 1)
  assert.equal(summary.mediumPriority, 1)
  assert.equal(summary.lowPriority, 1)
  assert.deepEqual(summary.topReasons, ['Unknown store (2)', 'Never manually reviewed (1)', 'Parse failed (1)'])
})
