'use client'

import { useState, useEffect } from 'react'
import { formatDate } from '@/lib/utils'
import type { AhDeal } from '@/lib/db'

interface DealsResponse {
  deals: AhDeal[]
  recommendations: AhDeal[]
  fetched_at: string
  cached: boolean
}

export default function DealsPage() {
  const [data, setData]       = useState<DealsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch]   = useState('')

  const fetchDeals = async (force = false) => {
    if (force) {
      setRefreshing(true)
      await fetch('/api/deals', { method: 'DELETE' })
    }
    setLoading(true)
    try {
      const res = await fetch('/api/deals')
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchDeals() }, [])

  const deals = data?.deals ?? []
  const filtered = deals.filter(d =>
    !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.category?.toLowerCase().includes(search.toLowerCase())
  )
  const recommendations = data?.recommendations ?? []

  const categories = Array.from(new Set(deals.map(d => d.category).filter(Boolean)))

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="card p-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            AH Bonus Deals
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, fontFamily: 'var(--font-body)' }}>
            {data ? (
              <>
                {data.cached ? '🗄️ Cached' : '🔄 Live'} · Fetched {formatDate(data.fetched_at, 'd MMM HH:mm')} · {deals.length} deals found
              </>
            ) : 'Loading current Bonuskaart offers...'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchDeals(true)}
            disabled={refreshing}
            style={{
              padding: '8px 18px', borderRadius: 100, border: '1px solid var(--border)', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-body)',
              background: 'var(--surface2)', color: 'var(--text-2)', transition: 'all 0.15s',
            }}
          >
            {refreshing ? 'Fetching...' : '↻ Refresh Deals'}
          </button>
        </div>
      </div>

      {/* Explain */}
      <div className="card p-4 flex items-start gap-3" style={{ background: 'var(--primary-light)', borderColor: 'color-mix(in srgb, var(--primary) 20%, transparent)' }}>
        <span style={{ fontSize: 18 }}>🏷️</span>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', fontFamily: 'var(--font-body)', marginBottom: 3 }}>
            How deals work
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
            Deals are fetched via AI web search from ah.nl — updated every 24 hours. When you generate a meal plan,
            ingredients on Bonus deal this week are automatically prioritised and flagged. Head to the{' '}
            <strong>Meal Planner</strong> to generate a shopping list that maximises your Bonuskaart savings.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="card p-10" style={{ textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
          Fetching current AH Bonus deals...
        </div>
      ) : deals.length === 0 ? (
        <div className="card p-10" style={{ textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
          No deals found. Try refreshing — this uses AI web search so it may take a moment.
        </div>
      ) : (
        <>
          {recommendations.length > 0 && !search && (
            <div className="card p-5">
              <div className="card-label">Best Matches For You</div>
              <p style={{ fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.5 }}>
                Ranked using your normalized purchase history and most frequent products.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                {recommendations.map((deal, i) => (
                  <div key={`${deal.name}-${i}`} className="card p-4" style={{ background: 'var(--surface2)' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{deal.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-body)', marginTop: 3 }}>
                          Matches your purchase history: <strong>{deal.matched_product}</strong>
                        </div>
                      </div>
                      <span style={{
                        fontSize: 9.5, padding: '3px 9px', borderRadius: 100, fontWeight: 700, flexShrink: 0,
                        background: deal.recommendation === 'buy_now' ? 'var(--good-dim)' : 'var(--accent-dim)',
                        color: deal.recommendation === 'buy_now' ? 'var(--good)' : 'var(--accent)',
                        border: '1px solid var(--border)', fontFamily: 'var(--font-mono)',
                      }}>
                        {deal.recommendation === 'buy_now' ? 'BUY NOW' : 'GOOD IF NEEDED'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{deal.discount}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)' }}>
                        {deal.match_type === 'exact' ? 'Exact match' : 'Related staple'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search deals by name or category..."
            style={{
              padding: '11px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 13,
              outline: 'none', width: '100%',
            }}
          />

          {/* Deals grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((deal, i) => (
              <div key={i} className="card p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)', lineHeight: 1.3 }}>
                    {deal.name}
                  </h3>
                  <span style={{
                    fontSize: 9.5, padding: '3px 9px', borderRadius: 100, fontWeight: 700, flexShrink: 0,
                    background: 'var(--good-dim)', color: 'var(--good)',
                    border: '1px solid color-mix(in srgb, var(--good) 20%, transparent)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    BONUS
                  </span>
                </div>

                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                  {deal.discount}
                </p>

                <div className="flex items-center justify-between mt-auto pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  {deal.category && (
                    <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-body)' }}>
                      {deal.category}
                    </span>
                  )}
                  {deal.valid_until && (
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-4)' }}>
                      t/m {deal.valid_until}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && search && (
            <div className="card p-8" style={{ textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
              No deals found for &quot;{search}&quot;
            </div>
          )}

          {/* Categories summary */}
          {categories.length > 0 && !search && (
            <div className="card p-5">
              <div className="card-label">Deals by Category</div>
              <div className="flex flex-wrap gap-2 mt-3">
                {categories.map(cat => {
                  const count = deals.filter(d => d.category === cat).length
                  return (
                    <button
                      key={cat}
                      onClick={() => setSearch(cat ?? '')}
                      style={{
                        padding: '5px 12px', borderRadius: 100, border: '1px solid var(--border)', cursor: 'pointer',
                        fontSize: 12, fontFamily: 'var(--font-body)', background: 'var(--surface2)', color: 'var(--text-2)',
                      }}
                    >
                      {cat} <span style={{ color: 'var(--text-4)' }}>({count})</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
