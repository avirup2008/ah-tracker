import { NextResponse } from 'next/server'
import { getProductIntelligence, recommendDealsForProducts } from '@/lib/product-intelligence'
import { getCurrentDealsWithCache } from '@/lib/deals-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  try {
    const products = await getProductIntelligence(20)
    const { deals, fetched_at, cached } = await getCurrentDealsWithCache()

    return NextResponse.json({
      deals,
      recommendations: recommendDealsForProducts(deals, products),
      fetched_at,
      cached,
    })
  } catch (err) {
    console.error('Deals fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch deals' }, { status: 500 })
  }
}

// Force refresh
export async function DELETE() {
  const { refreshDealsCache } = await import('@/lib/deals-service')
  await refreshDealsCache(true)
  return NextResponse.json({ message: 'Cache cleared' })
}
