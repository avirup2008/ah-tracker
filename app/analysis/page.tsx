'use client'

import { useState, useEffect } from 'react'
import { formatEuro, formatDate, CATEGORY_ICONS } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend
} from 'recharts'
import { useTheme } from 'next-themes'
import OverviewTab from '@/components/analysis/OverviewTab'

type Feature = 'overview' | 'inflation' | 'brand' | 'waste' | 'seasonality' | 'forecast'

export default function AnalysisPage() {
  const [active, setActive] = useState<Feature>('overview')
  const [data, setData] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const accentColor = isDark ? '#FFB547' : '#BF7A18'
  const warnColor   = isDark ? '#FF5F7E' : '#B83820'
  const goodColor   = isDark ? '#4ADE80' : '#1A6B3A'
  const gridColor   = isDark ? '#252B40' : '#E4D9C8'
  const textColor   = isDark ? '#3D4860' : '#AE9E86'

  useEffect(() => {
    setLoading(true)
    fetch('/api/analysis?feature=all&period=month')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  const tabs: { id: Feature; label: string; icon: string }[] = [
    { id: 'overview',    label: 'Overview',     icon: '📊' },
    { id: 'inflation',   label: 'Inflation',    icon: '📈' },
    { id: 'brand',       label: 'Brand Switch', icon: '🔄' },
    { id: 'waste',       label: 'Waste',        icon: '🗑️' },
    { id: 'seasonality', label: 'Seasonality',  icon: '🌡️' },
    { id: 'forecast',    label: 'Forecast',     icon: '🔮' },
  ]

  return (
    <div className="flex flex-col gap-5">

      {/* Tab bar */}
      <div className="card p-2 flex gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              background: active === t.id ? 'var(--primary-light)' : 'transparent',
              color: active === t.id ? 'var(--primary)' : 'var(--text-3)',
              transition: 'all 0.15s',
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card p-10" style={{ textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>
          Loading analysis...
        </div>
      ) : (
        <>
          {/* ── Overview ──────────────────────────────────────── */}
          {active === 'overview' && <OverviewTab />}

          {/* ── A: Inflation tracker ─────────────────────────── */}
          {active === 'inflation' && (
            <div className="card p-5">
              <div className="card-label">Price Inflation — Your Regular Items</div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                Tracks price changes for items you buy 3+ times, comparing first recorded price to most recent. Items bought fewer than 3 times are excluded.
              </p>
              {!(data.inflation as InflationItem[])?.length ? (
                <EmptyState message="Parse more receipts to see price trends" />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      {['Item', 'Category', 'First Price', 'Latest Price', 'Change', 'Purchases'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-4)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.inflation as InflationItem[]).map((item, i) => {
                      const pct = item.pct_change ?? 0
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px', color: 'var(--text)', fontFamily: 'var(--font-body)', maxWidth: 240 }}>{item.clean_name}</td>
                          <td style={{ padding: '10px', color: 'var(--text-3)', fontSize: 11 }}>{item.category}</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{formatEuro(Number(item.first_price))}</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)' }}>{formatEuro(Number(item.latest_price))}</td>
                          <td style={{ padding: '10px' }}>
                            <span style={{
                              fontSize: 11, padding: '3px 10px', borderRadius: 100, fontWeight: 600, fontFamily: 'var(--font-mono)',
                              background: pct > 0 ? 'var(--warn-dim)' : pct < 0 ? 'var(--good-dim)' : 'var(--surface2)',
                              color: pct > 0 ? warnColor : pct < 0 ? goodColor : 'var(--text-3)',
                            }}>
                              {pct > 0 ? '+' : ''}{pct}%
                            </span>
                          </td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{item.purchase_count}×</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── B: Brand switching ───────────────────────────── */}
          {active === 'brand' && (
            <div className="card p-5">
              <div className="card-label">Brand Switching — AH Own Brand vs A-Brand</div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                Items starting with "AH" are own-brand (Eigen Merk). Switching to A-brands costs more — this shows where the gap is biggest.
              </p>
              {!(data.brandSwitch as BrandRow[])?.length ? (
                <EmptyState message="Not enough data yet — parse more receipts" />
              ) : (
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(data.brandSwitch as BrandRow[]).map(r => ({
                        category: (r.category ?? '').split(' (')[0].replace('&', '&'),
                        'AH Own Brand': Math.round(Number(r.own_brand_spend) * 100) / 100,
                        'A-Brand':      Math.round(Number(r.abrand_spend) * 100) / 100,
                      }))}
                      margin={{ left: 0, right: 10 }}
                    >
                      <CartesianGrid vertical={false} stroke={gridColor} />
                      <XAxis dataKey="category" tick={{ fontSize: 10, fill: textColor }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: textColor, fontFamily: 'IBM Plex Mono' }} tickFormatter={v => `€${v}`} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ background: isDark ? '#131620' : '#fff', border: `1px solid ${gridColor}`, borderRadius: 8, fontSize: 12, fontFamily: 'IBM Plex Mono' }} formatter={(v: number) => [`€${v.toFixed(2)}`]} />
                      <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-body)' }} />
                      <Bar dataKey="AH Own Brand" fill={goodColor}   radius={[3, 3, 0, 0]} />
                      <Bar dataKey="A-Brand"      fill={warnColor}   radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ── C: Waste predictor ───────────────────────────── */}
          {active === 'waste' && (
            <div className="card p-5">
              <div className="card-label">Potential Waste — Perishables</div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                Perishable items (produce, dairy, meat, bakery) bought 4+ times. Items frequently purchased in very small shops (&lt;5 items) may indicate impulse buys that get wasted.
              </p>
              {!(data.waste as WasteRow[])?.length ? (
                <EmptyState message="Not enough perishable purchase history yet" />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                      {['Item', 'Category', 'Times Bought', 'Total Spent', 'Avg Qty', 'Small Shop Buys', 'Risk'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-4)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.waste as WasteRow[]).map((item, i) => {
                      const smallPct = item.purchase_count > 0 ? Math.round((Number(item.small_shop_count) / Number(item.purchase_count)) * 100) : 0
                      const risk = smallPct > 50 ? 'High' : smallPct > 25 ? 'Medium' : 'Low'
                      const riskColor = risk === 'High' ? warnColor : risk === 'Medium' ? accentColor : goodColor
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{item.clean_name}</td>
                          <td style={{ padding: '10px', color: 'var(--text-3)', fontSize: 11 }}>{CATEGORY_ICONS[item.category ?? ''] ?? ''} {item.category}</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{item.purchase_count}×</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{formatEuro(Number(item.total_spent))}</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{Number(item.avg_qty).toFixed(1)}</td>
                          <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{item.small_shop_count} ({smallPct}%)</td>
                          <td style={{ padding: '10px' }}>
                            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 100, fontWeight: 600, color: riskColor, background: riskColor + '18', fontFamily: 'var(--font-body)' }}>{risk}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── D: Seasonality ───────────────────────────────── */}
          {active === 'seasonality' && (
            <div className="card p-5">
              <div className="card-label">Price Seasonality — Monthly Averages</div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                Shows average price per month for your regularly purchased items. Helps identify when to stock up at seasonal lows.
              </p>
              {!(data.seasonality as SeasonRow[])?.length ? (
                <EmptyState message="Need more months of data to show seasonality" />
              ) : (
                <SeasonalityView data={data.seasonality as SeasonRow[]} isDark={isDark} accentColor={accentColor} gridColor={gridColor} textColor={textColor} />
              )}
            </div>
          )}

          {/* ── H: Forecast ──────────────────────────────────── */}
          {active === 'forecast' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="card p-5">
                <div className="card-label">Monthly Budget Forecast</div>
                {!data.forecast ? (
                  <EmptyState />
                ) : (
                  <ForecastView forecast={data.forecast as ForecastData} goodColor={goodColor} warnColor={warnColor} accentColor={accentColor} />
                )}
              </div>
              <div className="card p-5">
                <div className="card-label">Frequent Bonus Deal Items</div>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>Items you've historically bought on Bonus deal — great candidates to stock up on when on offer again.</p>
                {!(data.frequentDealItems as DealItem[])?.length ? (
                  <EmptyState message="No bonus items tracked yet" />
                ) : (
                  <div className="flex flex-col">
                    {(data.frequentDealItems as DealItem[]).slice(0, 8).map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{item.clean_name}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1 }}>{item.category} · Last: {formatDate(item.last_bought, 'd MMM yyyy')}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: goodColor }}>{item.bonus_purchases}× on deal</div>
                          <div className="mono" style={{ fontSize: 10, color: 'var(--text-4)' }}>avg {formatEuro(Number(item.avg_bonus_price))}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────

function EmptyState({ message = 'No data yet — upload and parse receipts first' }: { message?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-4)', fontSize: 13 }}>
      {message}
    </div>
  )
}

interface SeasonRow { clean_name: string; category: string; month: number; avg_price: number }
interface SeasonalityViewProps { data: SeasonRow[]; isDark: boolean; accentColor: string; gridColor: string; textColor: string }

function SeasonalityView({ data, isDark, accentColor, gridColor, textColor }: SeasonalityViewProps) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  // Group by item, get top 5 by data points
  const byItem: Record<string, SeasonRow[]> = {}
  data.forEach(r => {
    if (!byItem[r.clean_name]) byItem[r.clean_name] = []
    byItem[r.clean_name].push(r)
  })
  const topItems = Object.entries(byItem).sort((a, b) => b[1].length - a[1].length).slice(0, 1)
  if (!topItems.length) return <EmptyState />

  const [selectedItem, setSelectedItem] = useState(topItems[0][0])
  const allItems = Object.keys(byItem)
  const chartData = MONTHS.map((m, i) => {
    const row = byItem[selectedItem]?.find(r => r.month === i + 1)
    return { month: m, price: row ? Math.round(Number(row.avg_price) * 100) / 100 : null }
  }).filter(d => d.price !== null)

  return (
    <div>
      <select
        value={selectedItem}
        onChange={e => setSelectedItem(e.target.value)}
        style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 13, width: '100%' }}
      >
        {allItems.map(item => <option key={item} value={item}>{item}</option>)}
      </select>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ left: -10, right: 10 }}>
            <CartesianGrid vertical={false} stroke={gridColor} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: textColor, fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: textColor, fontFamily: 'IBM Plex Mono' }} tickFormatter={v => `€${v}`} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: isDark ? '#131620' : '#fff', border: `1px solid ${gridColor}`, borderRadius: 8, fontSize: 12, fontFamily: 'IBM Plex Mono' }} formatter={(v: number) => [`€${v.toFixed(2)}`, 'Avg price']} />
            <Line type="monotone" dataKey="price" stroke={accentColor} strokeWidth={2.5} dot={{ r: 4, fill: accentColor }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface ForecastData { spentSoFar: number; projected: number; monthlyTarget: number; onTrack: boolean; remainingDays: number; dailyBudgetRemaining: number }
function ForecastView({ forecast, goodColor, warnColor, accentColor }: { forecast: ForecastData; goodColor: string; warnColor: string; accentColor: string }) {
  const pct = Math.min(100, Math.round((forecast.spentSoFar / forecast.monthlyTarget) * 100))
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>SPENT SO FAR THIS MONTH</div>
        <div className="display-num" style={{ fontSize: 40 }}>{formatEuro(forecast.spentSoFar)}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--font-body)' }}>of {formatEuro(forecast.monthlyTarget)} monthly target</div>
      </div>
      <div>
        <div style={{ height: 7, background: 'var(--gauge-track)', borderRadius: 100, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: forecast.onTrack ? goodColor : warnColor, borderRadius: 100 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-4)' }}>
          <span style={{ color: forecast.onTrack ? goodColor : warnColor, fontWeight: 600 }}>{pct}% used</span>
          <span>{forecast.remainingDays} days left</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Projected month-end', value: formatEuro(forecast.projected), highlight: !forecast.onTrack },
          { label: 'Daily budget left', value: formatEuro(forecast.dailyBudgetRemaining), highlight: false },
        ].map(s => (
          <div key={s.label} className="rounded-[var(--radius-sm)] p-3 border" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
            <div className="mono" style={{ fontSize: 16, fontWeight: 600, color: s.highlight ? warnColor : accentColor }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: forecast.onTrack ? 'var(--good-dim)' : 'var(--warn-dim)', border: `1px solid ${forecast.onTrack ? goodColor : warnColor}28` }}>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
          {forecast.onTrack
            ? `✅ You're on track! Projected to end the month at ${formatEuro(forecast.projected)} — under your ${formatEuro(forecast.monthlyTarget)} target.`
            : `⚠️ Projected to exceed monthly target by ${formatEuro(forecast.projected - forecast.monthlyTarget)}. Consider reducing spend to ${formatEuro(forecast.dailyBudgetRemaining)}/day.`}
        </p>
      </div>
    </div>
  )
}

// Type helpers
interface CategoryRow { category: string; total: number; item_count: number }
interface InflationItem { clean_name: string; category: string; first_price: number; latest_price: number; purchase_count: number; pct_change: number | null }
interface BrandRow { category: string; own_brand_spend: number; abrand_spend: number; own_brand_count: number; abrand_count: number }
interface WasteRow { clean_name: string; category: string; purchase_count: number; total_spent: number; avg_qty: number; small_shop_count: number }
interface AnomalyData { weeklySpend: WeekSpend[]; average: number; stddev: number; anomalies: WeekSpend[] }
interface WeekSpend { week_saturday: string; total_spend: number; receipt_count: number }
interface DealItem { clean_name: string; category: string; bonus_purchases: number; avg_bonus_price: number; last_bought: string }
