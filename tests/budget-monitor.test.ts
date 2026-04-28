import test from 'node:test'
import assert from 'node:assert/strict'

import { MONTHLY_TARGET, WEEKLY_BUDGET } from '../lib/budget-constants.ts'

test('weekly and monthly budget constants stay aligned', () => {
  assert.equal(WEEKLY_BUDGET, 90)
  assert.equal(MONTHLY_TARGET, 450)
})
