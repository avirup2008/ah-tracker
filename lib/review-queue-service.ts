import sql from './db'
import { assessReceiptReview, summarizeReviewQueue, type ReviewAssessment, type ReviewQueueSummary } from './review-queue'

export interface ReviewQueueItem {
  id: number
  filename: string
  receipt_date: string | null
  store_id: string | null
  store_name: string
  item_count: number
  total_paid: number
  subtotal: number
  koopzegels: number
  statiegeld: number
  payment_method: string | null
  parsed: boolean
  parse_error: string | null
  reviewed_at: string | null
  items_total: number
  missing_categories: number
  missing_clean_names: number
  unknown_btw: number
  review: ReviewAssessment
}

export interface ReviewReminderSnapshot {
  summary: ReviewQueueSummary
  topReceipts: Array<{
    id: number
    filename: string
    receipt_date: string | null
    priority: ReviewAssessment['priority']
    score: number
    reasons: string[]
  }>
}

function toNumber(value: unknown): number {
  return Number(value ?? 0)
}

export async function fetchReviewQueue(limit = 30): Promise<ReviewQueueItem[]> {
  const rows = await sql`
    WITH item_stats AS (
      SELECT
        receipt_id,
        COUNT(*) AS items_total,
        SUM(CASE WHEN category IS NULL THEN 1 ELSE 0 END) AS missing_categories,
        SUM(CASE WHEN clean_name IS NULL THEN 1 ELSE 0 END) AS missing_clean_names,
        SUM(CASE WHEN btw_rate IS NULL THEN 1 ELSE 0 END) AS unknown_btw
      FROM receipt_items
      WHERE raw_name <> 'SUBTOTAAL'
      GROUP BY receipt_id
    )
    SELECT
      r.id,
      r.filename,
      TO_CHAR(r.receipt_date, 'YYYY-MM-DD') AS receipt_date,
      r.store_id,
      COALESCE(s.store_name, 'Unknown AH location') AS store_name,
      r.item_count,
      r.total_paid,
      r.subtotal,
      r.koopzegels,
      r.statiegeld,
      r.payment_method,
      r.parsed,
      r.parse_error,
      r.reviewed_at,
      COALESCE(stats.items_total, 0) AS items_total,
      COALESCE(stats.missing_categories, 0) AS missing_categories,
      COALESCE(stats.missing_clean_names, 0) AS missing_clean_names,
      COALESCE(stats.unknown_btw, 0) AS unknown_btw
    FROM receipts r
    LEFT JOIN store_locations s ON r.store_id = s.store_id
    LEFT JOIN item_stats stats ON stats.receipt_id = r.id
    ORDER BY r.receipt_date DESC, r.id DESC
  `

  return rows
    .map((row: Record<string, unknown>) => {
      const review = assessReceiptReview({
        parsed: Boolean(row.parsed),
        parse_error: row.parse_error ? String(row.parse_error) : null,
        reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
        store_id: row.store_id ? String(row.store_id) : null,
        payment_method: row.payment_method ? String(row.payment_method) : null,
        item_count: toNumber(row.item_count),
        total_paid: toNumber(row.total_paid),
        subtotal: toNumber(row.subtotal),
        koopzegels: toNumber(row.koopzegels),
        statiegeld: toNumber(row.statiegeld),
        missing_categories: toNumber(row.missing_categories),
        missing_clean_names: toNumber(row.missing_clean_names),
        unknown_btw: toNumber(row.unknown_btw),
        items_total: toNumber(row.items_total),
      })

      return {
        id: toNumber(row.id),
        filename: String(row.filename ?? 'Unknown receipt'),
        receipt_date: row.receipt_date ? String(row.receipt_date) : null,
        store_id: row.store_id ? String(row.store_id) : null,
        store_name: String(row.store_name ?? 'Unknown AH location'),
        item_count: toNumber(row.item_count),
        total_paid: toNumber(row.total_paid),
        subtotal: toNumber(row.subtotal),
        koopzegels: toNumber(row.koopzegels),
        statiegeld: toNumber(row.statiegeld),
        payment_method: row.payment_method ? String(row.payment_method) : null,
        parsed: Boolean(row.parsed),
        parse_error: row.parse_error ? String(row.parse_error) : null,
        reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
        items_total: toNumber(row.items_total),
        missing_categories: toNumber(row.missing_categories),
        missing_clean_names: toNumber(row.missing_clean_names),
        unknown_btw: toNumber(row.unknown_btw),
        review,
      }
    })
    .filter((row) => row.review.needs_review)
    .sort((a, b) => b.review.score - a.review.score)
    .slice(0, limit)
}

export async function buildReviewReminderSnapshot(limit = 30): Promise<ReviewReminderSnapshot> {
  const queue = await fetchReviewQueue(limit)
  return {
    summary: summarizeReviewQueue(queue),
    topReceipts: queue.slice(0, 5).map((item) => ({
      id: item.id,
      filename: item.filename,
      receipt_date: item.receipt_date,
      priority: item.review.priority,
      score: item.review.score,
      reasons: item.review.reasons,
    })),
  }
}
