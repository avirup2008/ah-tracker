import { NextResponse } from 'next/server'

import sql from '@/lib/db'
import { assessReceiptReview } from '@/lib/review-queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await sql`
      WITH item_stats AS (
        SELECT
          receipt_id,
          COUNT(*) AS items_total,
          SUM(CASE WHEN category IS NULL THEN 1 ELSE 0 END) AS missing_categories,
          SUM(CASE WHEN clean_name IS NULL THEN 1 ELSE 0 END) AS missing_clean_names,
          SUM(CASE WHEN btw_rate IS NULL THEN 1 ELSE 0 END) AS unknown_btw
        FROM receipt_items
        GROUP BY receipt_id
      )
      SELECT
        r.id,
        r.filename,
        r.receipt_date,
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

    const queue = rows
      .map((row: Record<string, unknown>) => {
        const review = assessReceiptReview({
          parsed: Boolean(row.parsed),
          parse_error: row.parse_error ? String(row.parse_error) : null,
          reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
          store_id: row.store_id ? String(row.store_id) : null,
          payment_method: row.payment_method ? String(row.payment_method) : null,
          item_count: Number(row.item_count ?? 0),
          total_paid: Number(row.total_paid ?? 0),
          subtotal: Number(row.subtotal ?? 0),
          koopzegels: Number(row.koopzegels ?? 0),
          statiegeld: Number(row.statiegeld ?? 0),
          missing_categories: Number(row.missing_categories ?? 0),
          missing_clean_names: Number(row.missing_clean_names ?? 0),
          unknown_btw: Number(row.unknown_btw ?? 0),
          items_total: Number(row.items_total ?? 0),
        })

        return {
          ...row,
          review,
        }
      })
      .filter((row) => row.review.needs_review)
      .sort((a, b) => b.review.score - a.review.score)
      .slice(0, 30)

    return NextResponse.json({
      queue,
      total: queue.length,
      highPriority: queue.filter((item) => item.review.priority === 'high').length,
    })
  } catch (err) {
    console.error('Review queue error:', err)
    return NextResponse.json({ error: 'Failed to load review queue' }, { status: 500 })
  }
}
