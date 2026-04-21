import test from 'node:test'
import assert from 'node:assert/strict'

import { sanitizePantryInput } from '../lib/pantry.ts'

test('sanitizePantryInput normalizes pantry items', () => {
  const item = sanitizePantryInput({
    name: 'AH HV Melk',
    quantity_note: '2 cartons',
    category: 'Zuivel & Eieren',
  })

  assert.deepEqual(item, {
    name: 'AH HV Melk',
    normalized_name: 'AH HALFVOLLE MELK',
    family_key: 'halfvolle melk',
    quantity_note: '2 cartons',
    category: 'Zuivel & Eieren',
  })
})

test('sanitizePantryInput rejects empty names', () => {
  assert.equal(sanitizePantryInput({ name: '   ' }), null)
})
