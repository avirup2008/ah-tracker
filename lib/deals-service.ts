import sql from './db'
import { fetchAhDeals } from './ai'

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
  if (force) {
    await sql`DELETE FROM ah_deals_cache`
  }

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

  return deals
}

export async function getCurrentDealsWithCache() {
  const cached = await getCachedDeals()
  if (cached) {
    return { deals: cached.deals_json, fetched_at: cached.fetched_at, cached: true }
  }

  const deals = await refreshDealsCache()
  return { deals, fetched_at: new Date().toISOString(), cached: false }
}
