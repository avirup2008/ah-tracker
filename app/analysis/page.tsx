'use client'

import { useState, useEffect, useRef } from 'react'
import { formatEuro, formatDate, CATEGORY_ICONS, catLabel } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, Cell, ReferenceLine
} from 'recharts'
import { useTheme } from 'next-themes'

const SECTIONS = [
  { id: 'overview',   label: '📊 Overview'    },
  { id: 'inflation',  label: '📈 Inflation'   },
  { id: 'brand-switch', label: '🔄 Brand Switch' },
  { id: 'product-catalog', label: '🧾 Product Families' },
  { id: 'waste',      label: '🗑️ Waste'       },
  { id: 'seasonality',label: '🌡️ Seasonality' },
  { id: 'forecast',   label: '🔮 Forecast'    },
]

export default function AnalysisPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData]     = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [active, setActive]  = useState('overview')
  const { theme } = useTheme()
  const isDark  = theme === 'dark'
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const accent  = isDark ? '#FFB547' : '#BF7A18'
  const warn    = isDark ? '#FF5F7E' : '#B83820'
  const good    = isDark ? '#4ADE80' : '#1A6B3A'
  const grid    = isDark ? '#252B40' : '#E4D9C8'
  const muted   = isDark ? '#3D4860' : '#AE9E86'

  useEffect(() => {
    fetch('/api/analysis?feature=all&period=month')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  // Scroll spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: '-30% 0px -60% 0px' }
    )
    Object.values(sectionRefs.current).forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [loading])

  const scrollTo = (id: string) => {
    const el = sectionRefs.current[id]
    if (!el) return
    const offset = 120 // header + section-nav height
    const top = el.getBoundingClientRect().top + window.scrollY - offset
    window.scrollTo({ top, behavior: 'smooth' })
  }

  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div className="section-nav animate-nav">
        {SECTIONS.map(s => <button key={s.id} className="section-nav-item">{s.label}</button>)}
      </div>
      {[1,2,3].map(i => (
        <div key={i} className="card p-5" style={{ height:200 }}>
          <div className="skeleton" style={{ height:12, width:120, marginBottom:16 }} />
          <div className="skeleton" style={{ height:140, borderRadius:8 }} />
        </div>
      ))}
    </div>
  )

  const anom   = data.anomaly   ?? {}
  const inflat = data.inflation ?? []
  const brand  = data.brandSwitch ?? []
  const substitutions = data.substitutions ?? []
  const productCatalog = data.productCatalog ?? []
  const waste  = data.waste ?? []
  const season = data.seasonality ?? []
  const fc     = data.forecast ?? {}
  const deals  = data.frequentDealItems ?? []

  // Verdicts
  const weekAvg  = anom.average ?? 0
  const anomWeeks = (anom.anomalies ?? []).length
  const overCount = (anom.weeklySpend ?? []).filter((w: { total_spend: number }) => Number(w.total_spend) > 90).length
  const totalWeeks = (anom.weeklySpend ?? []).length

  const topInflatItem  = inflat.find((i: { pct_change: number }) => (i.pct_change ?? 0) > 0)
  const topDropItem    = inflat.find((i: { pct_change: number }) => (i.pct_change ?? 0) < 0)
  const topWasteItem   = waste[0]
  const totalAhSpend   = brand.reduce((s: number, r: { own_brand_spend: number }) => s + Number(r.own_brand_spend), 0)
  const totalAbrand    = brand.reduce((s: number, r: { abrand_spend: number }) => s + Number(r.abrand_spend), 0)
  const switchPotential = substitutions.slice(0, 5).reduce((sum: number, item: { estimated_annual_saving: number }) => {
    return sum + Number(item.estimated_annual_saving ?? 0)
  }, 0)

  return (
    <div className="flex flex-col gap-6">

      {/* ── Sticky section nav ──────────────────────────────── */}
      <nav className="section-nav animate-nav">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className={`section-nav-item ${active === s.id ? 'active' : ''}`}
            onClick={() => scrollTo(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* ════════════════════════════════════════════════════════
          SECTION 1 — OVERVIEW
      ════════════════════════════════════════════════════════ */}
      <div id="overview" ref={el => { sectionRefs.current.overview = el }}>
        <div className="section-header">
          <div className="section-accent" />
          <div className="section-title">Overview</div>
          <div style={{ marginLeft:'auto', fontSize:11, color:'var(--text-4)', fontFamily:'var(--font-mono)' }}>
            {totalWeeks} weeks of data
          </div>
        </div>

        {/* So-what */}
        {totalWeeks > 0 && (
          <div className={`so-what ${weekAvg > 90 ? 'warn' : 'good'} mb-4`} style={{ marginBottom:16 }}>
            Weekly average is <strong>{formatEuro(weekAvg)}</strong> against a €90 target.
            {' '}{overCount} of {totalWeeks} weeks exceeded budget.
            {' '}{anomWeeks > 0 ? `${anomWeeks} weeks were statistical anomalies — worth investigating.` : 'No anomalous weeks detected.'}
          </div>
        )}

        <div className="card p-5">
          <div className="card-label" style={{ marginBottom:8 }}>Weekly Spend — All Time</div>
          {!(anom.weeklySpend ?? []).length ? (
            <EmptyState title="Spend history" desc="Weekly spend bars will appear here once receipts are parsed" />
          ) : (
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={(anom.weeklySpend ?? []).map((w: { week_saturday: string; total_spend: number }) => ({
                    week: w.week_saturday?.slice(5),
                    spend: Math.round(Number(w.total_spend)*100)/100,
                    over: Number(w.total_spend) > (anom.average ?? 0) + (anom.stddev ?? 0),
                  }))}
                  margin={{ top:4, right:4, bottom:0, left:-20 }}
                >
                  <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 3" />
                  <XAxis dataKey="week" tick={{ fontSize:8, fill:muted, fontFamily:'IBM Plex Mono' }} axisLine={false} tickLine={false} interval={Math.floor((anom.weeklySpend?.length??1)/8)} />
                  <YAxis tick={{ fontSize:8, fill:muted, fontFamily:'IBM Plex Mono' }} tickFormatter={v=>`€${v}`} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background:isDark?'#131620':'#fff', border:`1px solid ${grid}`, borderRadius:8, fontSize:11, fontFamily:'IBM Plex Mono' }} formatter={(v:number)=>[`€${v.toFixed(2)}`,'Spend']} />
                  <ReferenceLine y={90} stroke={grid} strokeDasharray="5 4" strokeWidth={1.5} label={{ value:'€90 target', position:'insideTopLeft', fontSize:8, fill:muted }} />
                  {anom.stddev > 0 && <ReferenceLine y={anom.average + anom.stddev} stroke={warn} strokeDasharray="3 3" strokeWidth={1} label={{ value:'anomaly threshold', position:'insideTopRight', fontSize:7, fill:warn }} />}
                  <Bar dataKey="spend" radius={[3,3,0,0]}>
                    {(anom.weeklySpend??[]).map((_:unknown, i: number) => {
                      const w = (anom.weeklySpend??[])[i]
                      return <Cell key={i} fill={Number(w.total_spend) > (anom.average??0)+(anom.stddev??0) ? warn : accent} fillOpacity={Number(w.total_spend) > (anom.average??0)+(anom.stddev??0) ? 1 : 0.75} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {totalWeeks > 0 && (
            <div style={{ display:'flex', gap:16, marginTop:12, paddingTop:12, borderTop:`1px solid ${grid}` }}>
              {[
                { label:'Weekly avg',   value: formatEuro(anom.average),                   color: 'var(--text)'  },
                { label:'Std deviation',value: formatEuro(anom.stddev),                    color: 'var(--text-3)'},
                { label:'Weeks over €90',value:`${overCount} / ${totalWeeks}`,              color: overCount > totalWeeks*0.4 ? warn : good },
                { label:'Anomalous weeks',value:`${anomWeeks}`,                             color: anomWeeks > 3  ? warn : good },
              ].map(s=>(
                <div key={s.label}>
                  <div className="mono" style={{ fontSize:15, fontWeight:700, color:s.color }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--text-4)', marginTop:2, fontFamily:'var(--font-body)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="section-divider" />

      {/* ════════════════════════════════════════════════════════
          SECTION 2 — INFLATION
      ════════════════════════════════════════════════════════ */}
      <div id="inflation" ref={el => { sectionRefs.current.inflation = el }}>
        <div className="section-header">
          <div className="section-accent" style={{ background:'var(--warn)' }} />
          <div className="section-title">Price Inflation</div>
          <div style={{ marginLeft:'auto', fontSize:11, color:'var(--text-4)', fontFamily:'var(--font-mono)' }}>
            Items bought 3+ times
          </div>
        </div>

        {inflat.length > 0 && (
          <div style={{ marginBottom:14 }}>
            {topInflatItem && (
              <div className="so-what warn" style={{ marginBottom:6 }}>
                <strong>{topInflatItem.clean_name}</strong> is up <strong>{topInflatItem.pct_change}%</strong> since first purchase (
                {formatEuro(Number(topInflatItem.first_price))} → {formatEuro(Number(topInflatItem.latest_price))}).
                {topDropItem && ` ${topDropItem.clean_name} has dropped ${Math.abs(topDropItem.pct_change)}% — a good time to stock up.`}
              </div>
            )}
          </div>
        )}

        <div className="card">
          {inflat.length === 0 ? (
            <div style={{ padding:20 }}><EmptyState title="Price tracker" desc="Shows price changes for items you buy 3+ times, comparing your first purchase to the most recent price" /></div>
          ) : (
            <div className="overflow-x-auto -mx-1"><table className="data-table" style={{minWidth:520}}>
              <thead>
                <tr>
                  {['Item', 'Category', 'First seen', 'Latest', 'Change', 'Times bought'].map(h=>(
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inflat.map((item: { clean_name: string; category: string; first_price: number; latest_price: number; pct_change: number|null; purchase_count: number }, i: number) => {
                  const pct = item.pct_change ?? 0
                  return (
                    <tr key={i}>
                      <td style={{ color:'var(--text)', fontWeight:500, fontFamily:'var(--font-body)', maxWidth:220 }}>{item.clean_name}</td>
                      <td style={{ color:'var(--text-3)', fontSize:11 }}>{catLabel(item.category)}</td>
                      <td className="mono" style={{ color:'var(--text-3)' }}>{formatEuro(Number(item.first_price))}</td>
                      <td className="mono" style={{ color:'var(--text)', fontWeight:600 }}>{formatEuro(Number(item.latest_price))}</td>
                      <td>
                        <span className={`badge ${pct > 0 ? 'badge-warn' : pct < 0 ? 'badge-good' : 'badge-neutral'}`}>
                          {pct > 0 ? '+' : ''}{pct}%
                        </span>
                      </td>
                      <td className="mono" style={{ color:'var(--text-3)' }}>{item.purchase_count}×</td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      <div className="section-divider" />

      {/* ════════════════════════════════════════════════════════
          SECTION 3 — BRAND SWITCH
      ════════════════════════════════════════════════════════ */}
      <div id="brand-switch" ref={el => { sectionRefs.current['brand-switch'] = el }}>
        <div className="section-header">
          <div className="section-accent" style={{ background:'var(--info)' }} />
          <div className="section-title">Brand Switching</div>
        </div>

        {brand.length > 0 && switchPotential > 0 && (
          <div className="so-what info" style={{ marginBottom:14 }}>
            You spend <strong>{formatEuro(totalAbrand)}</strong> on A-brands vs <strong>{formatEuro(totalAhSpend)}</strong> on AH own-brand.
            Switching your top 5 repeat A-brand items to likely AH equivalents could save approximately <strong>{formatEuro(switchPotential)}/year</strong>.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="card-label" style={{ marginBottom:12 }}>Spend by category — AH vs A-brand</div>
            {brand.length === 0 ? (
              <EmptyState title="Brand comparison" desc="Compares AH own-brand spend vs A-brand spend by food category" />
            ) : (
              <div style={{ height:280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={brand.filter((r: { category: string }) => r.category !== 'Overig').map((r: { category: string; own_brand_spend: number; abrand_spend: number }) => ({
                      category: catLabel(r.category).split('(')[0].trim(),
                      'AH': Math.round(Number(r.own_brand_spend)*100)/100,
                      'A-Brand': Math.round(Number(r.abrand_spend)*100)/100,
                    }))}
                    margin={{ left:0, right:10 }}
                  >
                    <CartesianGrid vertical={false} stroke={grid} />
                    <XAxis dataKey="category" tick={{ fontSize:9, fill:muted }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:8, fill:muted, fontFamily:'IBM Plex Mono' }} tickFormatter={v=>`€${v}`} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background:isDark?'#131620':'#fff', border:`1px solid ${grid}`, borderRadius:8, fontSize:11, fontFamily:'IBM Plex Mono' }} formatter={(v:number)=>[`€${v.toFixed(2)}`]} />
                    <Legend wrapperStyle={{ fontSize:10, fontFamily:'var(--font-body)' }} />
                    <Bar dataKey="AH"      fill={good}   radius={[3,3,0,0]} />
                    <Bar dataKey="A-Brand" fill={warn}   radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card p-5">
            <div className="card-label" style={{ marginBottom:12 }}>Switch recommendations</div>
            {substitutions.length === 0 ? (
              <EmptyState title="Switch table" desc="Shows specific A-brand items you buy regularly with an AH equivalent and estimated annual saving" />
            ) : (
              <div className="flex flex-col">
                {substitutions.slice(0,8).map((item: {
                  source_name: string
                  source_category: string
                  source_avg_price: number
                  source_purchase_count: number
                  target_name: string
                  target_avg_price: number
                  estimated_saving_per_buy: number
                  estimated_annual_saving: number
                  confidence: 'high' | 'medium'
                }, i: number) => {
                  return (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:`1px solid ${grid}` }}>
                      <div>
                        <div style={{ fontSize:12.5, fontWeight:500, color:'var(--text)', fontFamily:'var(--font-body)' }}>
                          {item.source_name}
                        </div>
                        <div style={{ fontSize:10, color:'var(--text-4)', marginTop:1 }}>
                          {catLabel(item.source_category)} · {item.source_purchase_count}× avg {formatEuro(Number(item.source_avg_price))}
                          <span style={{ color:'var(--text-3)' }}> → {item.target_name}: {formatEuro(Number(item.target_avg_price))}</span>
                        </div>
                        <div style={{ fontSize:10, color:'var(--text-4)', marginTop:3 }}>
                          Save about {formatEuro(Number(item.estimated_saving_per_buy))} per buy · {item.confidence} confidence
                        </div>
                      </div>
                      <span className="badge badge-good">~{formatEuro(Number(item.estimated_annual_saving))}/yr</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="section-divider" />

      {/* ════════════════════════════════════════════════════════
          SECTION 4 — PRODUCT CATALOG
      ════════════════════════════════════════════════════════ */}
      <div id="product-catalog" ref={el => { sectionRefs.current['product-catalog'] = el }}>
        <div className="section-header">
          <div className="section-accent" style={{ background:'var(--primary)' }} />
          <div className="section-title">Product Families</div>
        </div>

        <div className="so-what info" style={{ marginBottom:14 }}>
          Canonical product families collapse aliases like different AH name variants and pack labels into one record.
          This improves substitution matching, deals, and long-term price tracking.
        </div>

        <div className="card">
          {productCatalog.length === 0 ? (
            <div style={{ padding:20 }}>
              <EmptyState title="Product catalog" desc="Groups aliases into canonical product families with category, own-brand, aliases, and price signals." />
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1"><table className="data-table" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  {['Canonical product', 'Category', 'Aliases', 'Trips', 'Avg unit', 'Trend', 'Brand'].map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productCatalog.map((item: {
                  canonical_name: string
                  category: string | null
                  aliases: string[]
                  purchase_count: number
                  avg_unit_price: number | null
                  price_change_pct: number | null
                  is_own_brand: boolean
                }, i: number) => (
                  <tr key={`${item.canonical_name}-${i}`}>
                    <td style={{ color: 'var(--text)', fontWeight: 500, fontFamily: 'var(--font-body)', maxWidth: 220 }}>{item.canonical_name}</td>
                    <td style={{ color: 'var(--text-3)', fontSize: 11 }}>{catLabel(item.category)}</td>
                    <td style={{ maxWidth: 180, fontSize: 11, color: 'var(--text-4)' }}>
                      {item.aliases.slice(0, 3).join(', ')}
                      {item.aliases.length > 3 ? ` +${item.aliases.length - 3}` : ''}
                    </td>
                    <td className="mono">{item.purchase_count}×</td>
                    <td className="mono">{item.avg_unit_price ? formatEuro(Number(item.avg_unit_price)) : '—'}</td>
                    <td>
                      {item.price_change_pct === null ? (
                        <span className="badge badge-neutral">—</span>
                      ) : (
                        <span className={`badge ${item.price_change_pct > 0 ? 'badge-warn' : item.price_change_pct < 0 ? 'badge-good' : 'badge-neutral'}`}>
                          {item.price_change_pct > 0 ? '+' : ''}{item.price_change_pct}%
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${item.is_own_brand ? 'badge-good' : 'badge-neutral'}`}>
                        {item.is_own_brand ? 'AH' : 'A-brand'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      <div className="section-divider" />

      {/* ════════════════════════════════════════════════════════
          SECTION 5 — WASTE
      ════════════════════════════════════════════════════════ */}
      <div id="waste" ref={el => { sectionRefs.current.waste = el }}>
        <div className="section-header">
          <div className="section-accent" style={{ background:'#B45309' }} />
          <div className="section-title">Potential Waste</div>
        </div>

        {topWasteItem && (
          <div className="so-what warn" style={{ marginBottom:14 }}>
            <strong>{topWasteItem.clean_name}</strong> has been bought <strong>{topWasteItem.purchase_count}×</strong> across {' '}
            16 months — {Math.round(Number(topWasteItem.purchase_count)/16*4)} times a month on average.
            Items bought frequently in small top-up shops (under 5 items) are the highest waste risk.
          </div>
        )}

        <div className="card">
          {waste.length === 0 ? (
            <div style={{ padding:20 }}><EmptyState title="Waste predictor" desc="Perishable items (produce, dairy, meat, bakery) you buy 4+ times. Frequent purchases in tiny top-up shops may indicate over-buying that leads to waste." /></div>
          ) : (
            <div className="overflow-x-auto -mx-1"><table className="data-table" style={{minWidth:520}}>
              <thead>
                <tr>
                  {['Item','Category','Times bought','Total spent','Avg qty','Small shop buys','Risk'].map(h=>(
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {waste.map((item: { clean_name: string; category: string; purchase_count: number; total_spent: number; avg_qty: number; small_shop_count: number }, i: number) => {
                  const smallPct = item.purchase_count > 0 ? Math.round((Number(item.small_shop_count)/Number(item.purchase_count))*100) : 0
                  const risk = smallPct > 50 ? 'High' : smallPct > 25 ? 'Medium' : 'Low'
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight:500, fontFamily:'var(--font-body)' }}>{item.clean_name}</td>
                      <td style={{ fontSize:11, color:'var(--text-3)' }}>{CATEGORY_ICONS[item.category??'']??''} {catLabel(item.category)}</td>
                      <td className="mono">{item.purchase_count}×</td>
                      <td className="mono">{formatEuro(Number(item.total_spent))}</td>
                      <td className="mono">{Number(item.avg_qty).toFixed(1)}</td>
                      <td className="mono">{item.small_shop_count} ({smallPct}%)</td>
                      <td><span className={`badge ${risk==='High'?'badge-warn':risk==='Medium'?'badge-neutral':'badge-good'}`}>{risk}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      <div className="section-divider" />

      {/* ════════════════════════════════════════════════════════
          SECTION 6 — SEASONALITY
      ════════════════════════════════════════════════════════ */}
      <div id="seasonality" ref={el => { sectionRefs.current.seasonality = el }}>
        <div className="section-header">
          <div className="section-accent" style={{ background:'#0891B2' }} />
          <div className="section-title">Seasonality</div>
        </div>

        <div className="so-what info" style={{ marginBottom:14 }}>
          Shows monthly average price per item across your purchase history. Select an item below to see its price curve. Low months are the best time to stock up.
        </div>

        <div className="card p-5">
          {season.length === 0 ? (
            <EmptyState title="Price seasonality" desc="Monthly average price curves per item — shows when prices are lowest so you can stock up at the right time" />
          ) : (
            <SeasonalityChart data={season} isDark={isDark} accent={accent} grid={grid} muted={muted} />
          )}
        </div>
      </div>

      <div className="section-divider" />

      {/* ════════════════════════════════════════════════════════
          SECTION 7 — FORECAST
      ════════════════════════════════════════════════════════ */}
      <div id="forecast" ref={el => { sectionRefs.current.forecast = el }}>
        <div className="section-header">
          <div className="section-accent" style={{ background:'var(--good)' }} />
          <div className="section-title">Budget Forecast</div>
        </div>

        {fc.spentSoFar !== undefined && (
          <div className={`so-what ${fc.onTrack ? 'good' : 'warn'}`} style={{ marginBottom:14 }}>
            {fc.onTrack
              ? `Projecting ${formatEuro(fc.projected)} at month-end — ${formatEuro(fc.monthlyTarget - fc.projected)} under your ${formatEuro(fc.monthlyTarget)} target. Daily budget remaining: ${formatEuro(fc.dailyBudgetRemaining)}/day.`
              : `Projecting ${formatEuro(fc.projected)} at month-end — ${formatEuro(fc.projected - fc.monthlyTarget)} over your ${formatEuro(fc.monthlyTarget)} target. You need to spend under ${formatEuro(fc.dailyBudgetRemaining)}/day to stay on track.`
            }
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="card-label" style={{ marginBottom:14 }}>Monthly budget forecast</div>
            {fc.spentSoFar === undefined ? (
              <EmptyState title="Budget forecast" desc="Month-end projection based on your daily spend rate" />
            ) : <ForecastCard fc={fc} good={good} warn={warn} accent={accent} />}
          </div>

          <div className="card p-5">
            <div className="card-label" style={{ marginBottom:12 }}>Frequent bonus deal items</div>
            <p style={{ fontSize:11.5, color:'var(--text-3)', marginBottom:14, fontFamily:'var(--font-body)', lineHeight:1.5 }}>
              Items you have historically bought on Bonus deal — great candidates to stock up when on offer again.
            </p>
            {deals.length === 0 ? (
              <EmptyState title="Deal history" desc="Items you have previously bought on AH Bonus deal, ranked by frequency" />
            ) : (
              <div className="flex flex-col">
                {deals.slice(0,8).map((item: { clean_name: string; category: string; bonus_purchases: number; avg_bonus_price: number; last_bought: string }, i: number) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:`1px solid ${grid}` }}>
                    <div>
                      <div style={{ fontSize:12.5, color:'var(--text)', fontFamily:'var(--font-body)' }}>{item.clean_name}</div>
                      <div style={{ fontSize:10, color:'var(--text-4)', marginTop:1 }}>
                        {catLabel(item.category)} · Last: {formatDate(item.last_bought, 'd MMM yyyy')}
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div className="mono" style={{ fontSize:12, fontWeight:600, color:good }}>{item.bonus_purchases}× on deal</div>
                      <div className="mono" style={{ fontSize:10, color:'var(--text-4)' }}>avg {formatEuro(Number(item.avg_bonus_price))}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

/* ── Sub-components ─────────────────────────────────────────── */

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ padding:'28px 0', textAlign:'center' }}>
      <div style={{ fontSize:12.5, fontWeight:600, color:'var(--text-3)', fontFamily:'var(--font-body)', marginBottom:6 }}>
        {title}
      </div>
      <div style={{ fontSize:11.5, color:'var(--text-4)', fontFamily:'var(--font-body)', lineHeight:1.6, maxWidth:360, margin:'0 auto' }}>
        {desc}
      </div>
    </div>
  )
}

interface SeasonRow { clean_name: string; category: string; month: number; avg_price: number }
function SeasonalityChart({ data, isDark, accent, grid, muted }: {
  data: SeasonRow[]; isDark: boolean; accent: string; grid: string; muted: string
}) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const good = isDark ? '#4ADE80' : '#1A6B3A'
  const warn = isDark ? '#FF5F7E' : '#B83820'

  // Group by item, take top 8 by data coverage
  const byItem: Record<string, SeasonRow[]> = {}
  data.forEach(r => {
    if (!byItem[r.clean_name]) byItem[r.clean_name] = []
    byItem[r.clean_name].push(r)
  })
  const topItems = Object.entries(byItem)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 8)

  const [expanded, setExpanded] = useState<string | null>(null)

  if (topItems.length === 0) return null

  return (
    <div>
      <p style={{ fontSize:12, color:'var(--text-3)', marginBottom:16, fontFamily:'var(--font-body)', lineHeight:1.5 }}>
        Your top {topItems.length} most purchased items. Green dot = cheapest month to buy, red = most expensive.
        Tap any card to expand.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {topItems.map(([name, rows]) => {
          const chartData = MONTHS.map((m, i) => {
            const row = rows.find(r => r.month === i + 1)
            return { month: m, price: row ? Math.round(Number(row.avg_price) * 100) / 100 : null }
          })
          const prices = chartData.map(d => d.price).filter((p): p is number => p !== null)
          const minPrice = Math.min(...prices)
          const maxPrice = Math.max(...prices)
          const minMonth = MONTHS[chartData.findIndex(d => d.price === minPrice)]
          const maxMonth = MONTHS[chartData.findIndex(d => d.price === maxPrice)]
          const isExpanded = expanded === name
          const shortName = name.split('(')[0].trim()
          const range = maxPrice - minPrice
          const savingPct = minPrice > 0 ? Math.round((range / maxPrice) * 100) : 0

          return (
            <div
              key={name}
              onClick={() => setExpanded(isExpanded ? null : name)}
              className={isExpanded ? 'card p-4 col-span-2 md:col-span-4' : 'card p-3'}
              style={{ cursor:'pointer', transition:'all 0.2s', borderColor: isExpanded ? 'var(--accent)' : undefined }}
            >
              {/* Card header */}
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', fontFamily:'var(--font-body)', lineHeight:1.3, marginBottom:2 }}>
                  {shortName}
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <span style={{ fontSize:10, color:good, fontFamily:'var(--font-mono)', fontWeight:600 }}>
                    ↓ {minMonth} €{minPrice.toFixed(2)}
                  </span>
                  {savingPct > 5 && (
                    <span className="badge badge-good" style={{ fontSize:9 }}>
                      save {savingPct}%
                    </span>
                  )}
                </div>
              </div>

              {/* Mini sparkline (collapsed) or full chart (expanded) */}
              {!isExpanded ? (
                <div style={{ height:52 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top:4, right:2, bottom:0, left:2 }}>
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke={accent}
                        strokeWidth={1.5}
                        dot={(props) => {
                          const { cx, cy, payload } = props
                          if (payload.price === null) return <g key={cx} />
                          const isMin = payload.price === minPrice
                          const isMax = payload.price === maxPrice
                          if (!isMin && !isMax) return <g key={cx} />
                          return (
                            <circle key={cx} cx={cx} cy={cy} r={3}
                              fill={isMin ? good : warn}
                              stroke="none"
                            />
                          )
                        }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height:200, marginTop:8 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ left:-10, right:10, top:4 }}>
                      <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize:9, fill:muted, fontFamily:'IBM Plex Mono' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize:9, fill:muted, fontFamily:'IBM Plex Mono' }} tickFormatter={v=>`€${v}`} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ background:isDark?'#131620':'#fff', border:`1px solid ${grid}`, borderRadius:8, fontSize:11, fontFamily:'IBM Plex Mono' }}
                        formatter={(v:number)=>[`€${v.toFixed(2)}`,'Avg price']}
                      />
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke={accent}
                        strokeWidth={2}
                        connectNulls
                        dot={(props) => {
                          const { cx, cy, payload } = props
                          if (payload.price === null) return <g key={cx} />
                          const isMin = payload.price === minPrice
                          const isMax = payload.price === maxPrice
                          return (
                            <circle key={cx} cx={cx} cy={cy} r={isMin || isMax ? 5 : 3}
                              fill={isMin ? good : isMax ? warn : accent}
                              stroke="none"
                            />
                          )
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{ display:'flex', gap:16, marginTop:8, fontSize:11, fontFamily:'var(--font-body)' }}>
                    <span style={{ color:good }}>📉 Buy in <strong>{minMonth}</strong> — €{minPrice.toFixed(2)}</span>
                    <span style={{ color:warn }}>📈 Most expensive in <strong>{maxMonth}</strong> — €{maxPrice.toFixed(2)}</span>
                    {savingPct > 0 && <span style={{ color:'var(--text-3)' }}>Timing saves up to {savingPct}%</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ForecastCard({ fc, good, warn, accent }: { fc: { spentSoFar: number; projected: number; monthlyTarget: number; onTrack: boolean; remainingDays: number; dailyBudgetRemaining: number }; good: string; warn: string; accent: string }) {
  const pct = Math.min(100, Math.round((fc.spentSoFar / fc.monthlyTarget) * 100))
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div>
        <div style={{ fontSize:10, color:'var(--text-4)', fontFamily:'var(--font-mono)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:6 }}>Spent this month</div>
        <div className="display-num" style={{ fontSize:38 }}>{formatEuro(fc.spentSoFar)}</div>
        <div style={{ fontSize:12, color:'var(--text-3)', marginTop:4, fontFamily:'var(--font-body)' }}>of {formatEuro(fc.monthlyTarget)} target</div>
      </div>
      <div>
        <div className="gauge-track">
          <div className="gauge-fill" style={{ width:`${pct}%`, background: fc.onTrack ? good : warn }} />
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text-4)' }}>
          <span style={{ color: fc.onTrack ? good : warn, fontWeight:600 }}>{pct}% used</span>
          <span>{fc.remainingDays} days left</span>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        {[
          { label:'Projected month-end', value:formatEuro(fc.projected),             color: fc.onTrack ? accent : warn },
          { label:'Daily budget left',   value:formatEuro(fc.dailyBudgetRemaining),  color: accent },
        ].map(s=>(
          <div key={s.label} className="kpi-card">
            <div className="mono" style={{ fontSize:16, fontWeight:700, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:10, color:'var(--text-4)', marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
