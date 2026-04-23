import { NextResponse } from 'next/server'
import { getProductIntelligence, recommendDealsForProducts } from '@/lib/product-intelligence'
import { getCurrentDealsWithCache } from '@/lib/deals-service'
import { getPantryFamilyKeys } from '@/lib/meal-plan-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  try {
    const products = await getProductIntelligence(20)
    const pantryFamilyKeys = await getPantryFamilyKeys()
    const { deals, fetched_at, cached, quality, usedFallback } = await getCurrentDealsWithCache()

    return NextResponse.json({
      deals,
      recommendations: recommendDealsForProducts(deals, products, 6, pantryFamilyKeys),
      fetched_at,
      cached,
      usedFallback,
      quality,
    })
  } catch (err) {
    console.error('Deals fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch deals' }, { status: 500 })
  }
}

// Force refresh
export async function DELETE() {
  const { refreshDealsCache } = await import('@/lib/deals-service')
  const refreshed = await refreshDealsCache(true)
  return NextResponse.json({
    message: refreshed.usedFallback ? 'Refresh kept previous high-quality cache' : 'Deals refreshed',
    count: refreshed.deals.length,
    quality: refreshed.quality,
    usedFallback: refreshed.usedFallback,
  })
}
