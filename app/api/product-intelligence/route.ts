import { NextRequest, NextResponse } from 'next/server'

import { getProductCatalog, getProductIntelligence } from '@/lib/product-intelligence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.max(1, Math.min(50, Number(searchParams.get('limit') ?? 12) || 12))
    const includeCatalog = searchParams.get('includeCatalog') === '1'

    const products = await getProductIntelligence(limit)
    const catalog = includeCatalog ? await getProductCatalog(Math.max(limit, 50)) : undefined
    return NextResponse.json({ products, catalog })
  } catch (err) {
    console.error('Product intelligence error:', err)
    return NextResponse.json({ error: 'Failed to load product intelligence' }, { status: 500 })
  }
}
