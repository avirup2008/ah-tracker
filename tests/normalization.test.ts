import test from 'node:test'
import assert from 'node:assert/strict'

import { buildNormalizedItemFields, detectOwnBrand, normalizeItemName } from '../lib/normalization.ts'

test('normalizeItemName expands common raw receipt abbreviations', () => {
  assert.equal(normalizeItemName('AH HV MELK', null), 'AH HALFVOLLE MELK')
  assert.equal(normalizeItemName('AH BIO TOMATEN', null), 'AH BIOLOGISCH TOMATEN')
})

test('normalizeItemName prefers Dutch clean names without translation suffixes', () => {
  assert.equal(
    normalizeItemName('AH HV MELK', 'Albert Heijn Halfvolle Melk (semi-skimmed milk)'),
    'AH HALFVOLLE MELK'
  )
})

test('detectOwnBrand recognizes AH and Albert Heijn prefixes', () => {
  assert.equal(detectOwnBrand('AH PINDAKAAS'), true)
  assert.equal(detectOwnBrand('MELKAN HALFVOLLE MELK', 'Albert Heijn Halfvolle Melk'), true)
  assert.equal(detectOwnBrand('COCA COLA ZERO'), false)
})

test('buildNormalizedItemFields returns canonical name and own-brand flag together', () => {
  assert.deepEqual(buildNormalizedItemFields('AH VOL MELK', null), {
    normalizedName: 'AH VOLLE MELK',
    isOwnBrand: true,
  })
})
