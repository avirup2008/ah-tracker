import test from 'node:test'
import assert from 'node:assert/strict'

import { getNextRunIso } from '../lib/automation-jobs.ts'

test('getNextRunIso rolls daily jobs to the next day when the window has passed', () => {
  const next = getNextRunIso({
    jobKey: 'review_queue_reminder',
    jobName: 'Review Queue Reminder',
    cadenceLabel: 'Daily',
    kind: 'daily',
    hourUtc: 7,
    minuteUtc: 0,
  }, new Date('2026-04-21T08:00:00.000Z'))

  assert.equal(next, '2026-04-22T07:00:00.000Z')
})

test('getNextRunIso advances weekly jobs to the next week after same-day run time', () => {
  const next = getNextRunIso({
    jobKey: 'deals_refresh',
    jobName: 'Deals Refresh',
    cadenceLabel: 'Weekly',
    kind: 'weekly',
    weekday: 3,
    hourUtc: 6,
    minuteUtc: 0,
  }, new Date('2026-04-22T06:30:00.000Z'))

  assert.equal(next, '2026-04-29T06:00:00.000Z')
})
