export interface ReviewSignalInput {
  parsed: boolean
  parse_error: string | null
  reviewed_at?: string | null
  store_id?: string | null
  payment_method?: string | null
  item_count?: number | null
  total_paid?: number | null
  subtotal?: number | null
  koopzegels?: number | null
  statiegeld?: number | null
  missing_categories?: number | null
  missing_clean_names?: number | null
  unknown_btw?: number | null
  items_total?: number | null
}

export interface ReviewAssessment {
  score: number
  priority: 'high' | 'medium' | 'low' | 'none'
  needs_review: boolean
  reasons: string[]
}

export interface ReviewQueueSummary {
  total: number
  highPriority: number
  mediumPriority: number
  lowPriority: number
  topReasons: string[]
}

function addReason(reasons: string[], label: string) {
  if (!reasons.includes(label)) reasons.push(label)
}

export function assessReceiptReview(input: ReviewSignalInput): ReviewAssessment {
  const reasons: string[] = []
  let score = 0

  if (input.parse_error) {
    score += 100
    addReason(reasons, 'Parse failed')
  }

  if (!input.parsed && !input.parse_error) {
    score += 80
    addReason(reasons, 'Pending parse')
  }

  const itemsTotal = Number(input.items_total ?? 0)
  const missingCategories = Number(input.missing_categories ?? 0)
  const missingCleanNames = Number(input.missing_clean_names ?? 0)
  const unknownBtw = Number(input.unknown_btw ?? 0)

  if (itemsTotal > 0 && missingCategories > 0) {
    score += Math.min(35, missingCategories * 10)
    addReason(reasons, `${missingCategories} uncategorised item${missingCategories !== 1 ? 's' : ''}`)
  }

  if (itemsTotal > 0 && missingCleanNames > 0) {
    score += Math.min(20, missingCleanNames * 4)
    addReason(reasons, `${missingCleanNames} item${missingCleanNames !== 1 ? 's' : ''} missing clean names`)
  }

  if (itemsTotal > 0 && unknownBtw > 0) {
    score += Math.min(15, unknownBtw * 3)
    addReason(reasons, `${unknownBtw} item${unknownBtw !== 1 ? 's' : ''} missing VAT`)
  }

  if (input.parsed && !input.reviewed_at) {
    score += 10
    addReason(reasons, 'Never manually reviewed')
  }

  if (input.parsed && (!input.store_id || input.store_id === 'unknown')) {
    score += 8
    addReason(reasons, 'Unknown store')
  }

  const itemCount = Number(input.item_count ?? 0)
  if (input.parsed && itemCount <= 1) {
    score += 20
    addReason(reasons, 'Very low item count')
  }

  const needsReview = score >= 20 || Boolean(input.parse_error) || !input.parsed
  const priority: ReviewAssessment['priority'] =
    score >= 70 ? 'high' :
    score >= 35 ? 'medium' :
    score >= 20 ? 'low' :
    'none'

  return {
    score,
    priority,
    needs_review: needsReview,
    reasons,
  }
}

export function summarizeReviewQueue(items: Array<{ review: ReviewAssessment }>): ReviewQueueSummary {
  const reasonCounts = new Map<string, number>()
  let highPriority = 0
  let mediumPriority = 0
  let lowPriority = 0

  for (const item of items) {
    if (item.review.priority === 'high') highPriority += 1
    if (item.review.priority === 'medium') mediumPriority += 1
    if (item.review.priority === 'low') lowPriority += 1

    for (const reason of item.review.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
    }
  }

  const topReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([reason, count]) => `${reason} (${count})`)

  return {
    total: items.length,
    highPriority,
    mediumPriority,
    lowPriority,
    topReasons,
  }
}
