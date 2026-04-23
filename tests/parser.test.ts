import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { diagnoseReceiptParse, getWeekSaturday, parseFilename, parseReceiptText } from '../lib/parser.ts'

const fixturesDir = join(import.meta.dirname, 'fixtures')

function readFixture(name: string) {
  return readFileSync(join(fixturesDir, name), 'utf8')
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

test('parseFilename extracts AH receipt metadata', () => {
  const parsed = parseFilename('AH_kassabon_2025-11-14_184400_1251.pdf')

  assert.ok(parsed)
  assert.equal(parsed.storeId, '1251')
  assert.equal(parsed.time, '18:44:00')
  assert.equal(formatLocalDate(parsed.date), '2025-11-14')
})

test('getWeekSaturday aligns any date to the preceding Saturday', () => {
  const saturday = getWeekSaturday(new Date('2025-11-14T00:00:00Z'))
  assert.equal(saturday.toISOString().slice(0, 10), '2025-11-08')
})

test('parseReceiptText parses a standard grocery receipt with discounts and fees', () => {
  const rawText = readFixture('receipt-standard.txt')
  const parsed = parseReceiptText(rawText, rawText)

  assert.ok(parsed)
  assert.equal(parsed.storeId, '1251')
  assert.equal(formatLocalDate(parsed.date), '2025-11-14')
  assert.equal(parsed.time, '18:44:00')
  assert.equal(parsed.paymentMethod, 'PIN')
  assert.equal(parsed.items.length, 3)
  assert.equal(parsed.itemCount, 3)
  assert.equal(parsed.bonusSavings, 2)
  assert.equal(parsed.koopzegels, 4.2)
  assert.equal(parsed.statiegeld, 0.2)
  assert.equal(parsed.subtotal, 9)
  assert.equal(parsed.totalPaid, 13.2)
  assert.equal(parsed.netGrocerySpend, 8.8)

  const bonusItem = parsed.items.find((item) => item.rawName === 'AH LUNCHSAL')
  assert.ok(bonusItem)
  assert.equal(bonusItem.isBonusItem, true)
})

test('parseReceiptText handles totals printed on the next line', () => {
  const rawText = readFixture('receipt-total-next-line.txt')
  const parsed = parseReceiptText(rawText, rawText)

  assert.ok(parsed)
  assert.equal(parsed.storeId, '5805')
  assert.equal(parsed.paymentMethod, 'Cash')
  assert.equal(parsed.totalPaid, 3.6)
  assert.equal(parsed.subtotal, 3.6)
  assert.equal(parsed.itemCount, 2)
  assert.equal(parsed.netGrocerySpend, 3.6)
})

test('parseReceiptText rejects receipts without a valid total', () => {
  const rawText = readFixture('receipt-invalid-missing-total.txt')
  assert.equal(parseReceiptText(rawText, rawText), null)

  const diagnostic = diagnoseReceiptParse(rawText)
  assert.equal(diagnostic.ok, false)
  assert.ok(diagnostic.missing.includes('TOTAAL amount'))
  assert.match(diagnostic.error ?? '', /missing TOTAAL amount/)
})

test('diagnoseReceiptParse explains empty text failures', () => {
  const diagnostic = diagnoseReceiptParse('')

  assert.equal(diagnostic.ok, false)
  assert.deepEqual(diagnostic.missing, [
    'readable PDF text',
    'AH receipt date/time line',
    'TOTAAL amount',
    'grocery line items',
  ])
})

test('parseReceiptText supports item names split across multiple lines', () => {
  const rawText = readFixture('receipt-multiline-item.txt')
  const parsed = parseReceiptText(rawText, rawText)

  assert.ok(parsed)
  assert.equal(parsed.itemCount, 2)
  assert.equal(parsed.totalPaid, 6.08)
  assert.equal(parsed.subtotal, 6.08)
  assert.equal(parsed.items[0]?.rawName, 'AH PINDAKAAS STUKJES')
  assert.equal(parsed.items[0]?.totalPrice, 3.29)
  assert.equal(parsed.items[1]?.rawName, 'AH BROOD')
})

test('parseReceiptText keeps refund lines and flexible koopzegel labels in totals', () => {
  const rawText = readFixture('receipt-return-koopzegels.txt')
  const parsed = parseReceiptText(rawText, rawText)

  assert.ok(parsed)
  assert.equal(parsed.paymentMethod, 'PIN')
  assert.equal(parsed.itemCount, 3)
  assert.equal(parsed.koopzegels, 4.2)
  assert.equal(parsed.subtotal, 1.99)
  assert.equal(parsed.totalPaid, 6.19)
  assert.equal(parsed.netGrocerySpend, 1.99)
  assert.equal(parsed.items[2]?.rawName, 'AH PASTA')
  assert.equal(parsed.items[2]?.totalPrice, -2.49)
})
