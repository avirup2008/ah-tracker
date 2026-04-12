import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { fetchAhDeals } from '@/lib/claude'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  try {
    // Check cache first (valid for 24 hours)
    const cached = await sql`
      SELECT deals_json, fetched_at FROM ah_deals_cache
      WHERE expires_at > NOW()
      ORDER BY fetched_at DESC
      LIMIT 1
    `

    if (cached.length > 0) {
      return NextResponse.json({
        deals: cached[0].deals_json,
        fetched_at: cached[0].fetched_at,
        cached: true,
      })
    }

    // Fetch fresh deals via Claude web search
    const deals = await fetchAhDeals()

    if (deals.length > 0) {
      await sql`
        INSERT INTO ah_deals_cache (deals_json, expires_at)
        VALUES (
          ${JSON.stringify(deals)}::jsonb,
          NOW() + INTERVAL '24 hours'
        )
      `
    }

    return NextResponse.json({
      deals,
      fetched_at: new Date().toISOString(),
      cached: false,
    })
  } catch (err) {
    console.error('Deals fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch deals' }, { status: 500 })
  }
}

// Force refresh
export async function DELETE() {
  await sql`DELETE FROM ah_deals_cache WHERE expires_at < NOW() + INTERVAL '48 hours'`
  return NextResponse.json({ message: 'Cache cleared' })
}
