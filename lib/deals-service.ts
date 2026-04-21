import sql from './db'
import { fetchAhDeals } from './ai'
import { summarizeDealQuality } from './deal-normalization'

export async function getCachedDeals() {
  const rows = await sql`
    SELECT deals_json, fetched_at
    FROM ah_deals_cache
    WHERE expires_at > NOW()
    ORDER BY fetched_at DESC
    LIMIT 1
  `

  return rows[0] ?? null
}

export async function refreshDealsCache(force = false) {
  const previous = await getCachedDeals()

  const deals = await fetchAhDeals()
  const quality = summarizeDealQuality(deals)
  const previousDeals = previous?.deals_json as typeof deals | undefined
  const previousQuality = previousDeals ? summarizeDealQuality(previousDeals) : null

  const shouldPersistFresh =
    deals.length > 0 &&
    (
      force ||
      quality.quality === 'high' ||
      quality.total >= 10 ||
      !previousQuality ||
      quality.avg_confidence >= previousQuality.avg_confidence
    )

  if (shouldPersistFresh) {
    await sql`DELETE FROM ah_deals_cache`
    await sql`
      INSERT INTO ah_deals_cache (deals_json, expires_at)
      VALUES (${JSON.stringify(deals)}::jsonb, NOW() + INTERVAL '24 hours')
    `
    return { deals, quality, cached: false, usedFallback: false as const }
  }

  if (previousDeals) {
    return {
      deals: previousDeals,
      quality: previousQuality ?? summarizeDealQuality(previousDeals),
      cached: true,
      usedFallback: true as const,
    }
  }

  return { deals, quality, cached: false, usedFallback: false as const }
}

export async function getCurrentDealsWithCache() {
  const cached = await getCachedDeals()
  if (cached) {
    const deals = cached.deals_json as Awaited<ReturnType<typeof fetchAhDeals>>
    return {
      deals,
      fetched_at: cached.fetched_at,
      cached: true,
      usedFallback: false,
      quality: summarizeDealQuality(deals),
    }
  }

  const refreshed = await refreshDealsCache()
  return {
    deals: refreshed.deals,
    fetched_at: new Date().toISOString(),
    cached: refreshed.cached,
    usedFallback: refreshed.usedFallback,
    quality: refreshed.quality,
  }
}
