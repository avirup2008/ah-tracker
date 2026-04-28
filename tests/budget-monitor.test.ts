import test from 'node:test'
import assert from 'node:assert/strict'

import { MONTHLY_TARGET, WEEKLY_BUDGET } from '../lib/budget-constants.ts'
import { getBudgetPeriod } from '../lib/budget-period.ts'

test('weekly and monthly budget constants stay aligned', () => {
  assert.equal(WEEKLY_BUDGET, 90)
  assert.equal(MONTHLY_TARGET, 450)
})

test('budget period runs from salary day 25th to next 25th', () => {
  const beforeSalary = getBudgetPeriod(new Date(2026, 3, 24))
  assert.equal(beforeSalary.startDate, '2026-03-25')
  assert.equal(beforeSalary.endDate, '2026-04-25')
  assert.equal(beforeSalary.previousStartDate, '2026-02-25')
  assert.equal(beforeSalary.previousEndDate, '2026-03-25')
  assert.equal(beforeSalary.totalDays, 31)
  assert.equal(beforeSalary.elapsedDays, 31)
  assert.equal(beforeSalary.remainingDays, 0)

  const salaryDay = getBudgetPeriod(new Date(2026, 3, 25))
  assert.equal(salaryDay.startDate, '2026-04-25')
  assert.equal(salaryDay.endDate, '2026-05-25')
  assert.equal(salaryDay.elapsedDays, 1)
  assert.equal(salaryDay.remainingDays, 29)
})
