'use client'

import { useState, useEffect } from 'react'
import { formatEuro } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts'
import { useTheme } from 'next-themes'

// ── Types ──────────────────────────────────────────────────────
interface WeekSpend { week_saturday: string; total_spend: number; receipt_count: number }
interface AnomalyData { weeklySpend: WeekSpend[]; average: number; stddev: number; anomalies: WeekSpend[] }
interface Context {
  spent: number; projected: number; savings: number; trips: number
  lastSpend: number; dayRate: number; avgMonthly: number; avgWeekly: number
  highMonths: number; bonusTotal: number; MONTHLY: number; WEEKLY: number
  monthName: string; yr: number
}

// ── Markdown renderer (bold + numbered lists) ──────────────────
function renderMarkdown(text: string) {
  return text.split('\n').map((line, i) => {
    // Bold headers **text**
    const parts = line.split(/(\*\*[^*]+\*\*)/)
    const rendered = parts.map((part, j) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={j} style={{ color: 'var(--text)', display: 'block', marginTop: i === 0 ? 0 : 18, marginBottom: 4, fontSize: 12.5, fontFamily: 'var(--font-body)', letterSpacing: '-0.01em' }}>{part.slice(2,-2)}</strong>
        : <span key={j}>{part}</span>
    )
    return (
      <p key={i} style={{ margin: '0 0 4px 0', fontSize: 12, lineHeight: 1.65, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
        {rendered}
      </p>
    )
  })
}

export default function OverviewTab() {
  const [anomaly, setAnomaly] = useState<AnomalyData | null>(null)
  const [context, setContext] = useState<Context | null>(null)
  const [aiText, setAiText] = useState<string>('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const accent  = isDark ? '#FFB547' : '#BF7A18'
  const warn    = isDark ? '#FF5F7E' : '#B83820'
  const good    = isDark ? '#4ADE80' : '#1A6B3A'
  const grid    = isDark ? '#252B40' : '#E4D9C8'
  const muted   = isDark ? '#3D4860' : '#AE9E86'

  // Load anomaly + context on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/analysis?feature=anomaly').then(r=>r.json()),
      fetch('/api/ai-insights').then(r=>r.json()),
    ]).then(([aData, iData]) => {
      setAnomaly(aData.anomaly ?? null)
      setContext(iData.context ?? null)
    }).finally(() => setDataLoading(false))
  }, [])

  const runAnalysis = async () => {
    setAiLoading(true)
    setAiError(null)
    setAiText('')
    try {
      // Get the prompt from our insights endpoint
      const iRes = await fetch('/api/ai-insights')
      const iData = await iRes.json()
      if (iData.error) throw new Error(iData.error)

      // Call the server route that proxies Gemini generation
      const res = await fetch('/api/ai-insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: iData.prompt }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAiText(data.text)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAiLoading(false)
    }
  }

  const chartData = (anomaly?.weeklySpend ?? []).map(w => ({
    week: w.week_saturday?.slice(5) ?? '',
    spend: Math.round(Number(w.total_spend) * 100) / 100,
    over: Number(w.total_spend) > (anomaly?.average ?? 0) + (anomaly?.stddev ?? 0),
  }))

  const pct = context ? Math.min(100, Math.round((context.spent / context.MONTHLY) * 100)) : 0
  const onTrack = context ? context.projected <= context.MONTHLY : true

  return (
    <div className="flex flex-col gap-4">

      {/* ── KPI strip ─────────────────────────────────────────── */}
      {context && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: `${context.monthName} spend`, value: formatEuro(context.spent), sub: `${pct}% of target`, color: onTrack ? good : warn },
            { label: 'Month projection', value: formatEuro(context.projected), sub: onTrack ? 'On track' : `€${(context.projected-context.MONTHLY).toFixed(0)} over`, color: onTrack ? good : warn },
            { label: 'Bonus saved', value: formatEuro(context.savings), sub: `€${context.bonusTotal.toFixed(0)} all time`, color: good },
            { label: '8-week avg', value: formatEuro(context.avgWeekly), sub: `target €${context.WEEKLY}/wk`, color: context.avgWeekly > context.WEEKLY ? warn : good },
          ].map(k => (
            <div key={k.label} className="card p-4">
              <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</div>
              <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{k.value}</div>
              <div style={{ fontSize: 10.5, color: k.color, fontWeight: 600, marginTop: 3, fontFamily: 'var(--font-body)' }}>{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">

        {/* ── AI Analysis panel ───────────────────────────────── */}
        <div className="card p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="card-label" style={{ marginBottom: 2 }}>AI Spend Analysis</div>
              <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-body)' }}>
                Powered by Gemini · based on your real data
              </div>
            </div>
            <button
              onClick={runAnalysis}
              disabled={aiLoading}
              style={{
                padding: '8px 18px', borderRadius: 100, border: 'none', cursor: aiLoading ? 'not-allowed' : 'pointer',
                background: aiLoading ? 'var(--surface2)' : 'var(--primary)',
                color: aiLoading ? 'var(--text-4)' : 'var(--bg)',
                fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              {aiLoading ? '⏳ Analysing...' : aiText ? '↺ Regenerate' : '✦ Analyse Spending'}
            </button>
          </div>

          {/* Empty state */}
          {!aiText && !aiLoading && !aiError && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 10, padding: '32px 0',
              border: '1.5px dashed var(--border2)', borderRadius: 'var(--radius-sm)',
              background: 'var(--surface2)',
            }}>
              <div style={{ fontSize: 28 }}>✦</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-body)', textAlign: 'center', lineHeight: 1.6 }}>
                Click <strong>Analyse Spending</strong> to get<br />AI-generated insights on your grocery data
              </div>
              {context && (
                <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {context.monthName} · €{context.spent.toFixed(0)} spent · {context.avgMonthly.toFixed(0)} avg/mo
                </div>
              )}
            </div>
          )}

          {/* Loading */}
          {aiLoading && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'32px 0' }}>
              <div style={{ width:6,height:6,borderRadius:'50%',background:accent,animation:'pulse 1s infinite' }} />
              <span style={{ fontSize:12.5, color:'var(--text-3)', fontFamily:'var(--font-body)' }}>Gemini is reading your spending data…</span>
            </div>
          )}

          {/* Error */}
          {aiError && (
            <div style={{ padding:'14px', borderRadius:'var(--radius-sm)', background:'var(--warn-dim)', border:`1px solid ${warn}28` }}>
              <p style={{ fontSize:12, color: warn, fontFamily:'var(--font-body)' }}>⚠️ {aiError.includes('429') ? 'AI quota exceeded — try again tomorrow or add billing to Google AI Studio' : aiError}</p>
            </div>
          )}

          {/* Result */}
          {aiText && !aiLoading && (
            <div style={{ flex:1, overflowY:'auto' }}>
              {renderMarkdown(aiText)}
            </div>
          )}
        </div>

        {/* ── Anomaly chart ────────────────────────────────────── */}
        <div className="card p-5">
          <div className="card-label">Weekly Spend — All Time</div>
          {anomaly && (
            <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-body)', marginBottom: 12 }}>
              Avg €{anomaly.average}/wk · {anomaly.anomalies.length} anomalous weeks
              <span style={{ marginLeft:10, color: warn, fontWeight:600 }}>
                {anomaly.anomalies.length > 0 ? `${anomaly.anomalies.length} weeks flagged` : ''}
              </span>
            </div>
          )}
          {dataLoading ? (
            <div style={{ height:300, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-4)', fontSize:13 }}>Loading…</div>
          ) : chartData.length === 0 ? (
            <div style={{ height:300, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-4)', fontSize:13 }}>No data yet</div>
          ) : (
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top:4, right:4, bottom:0, left:-20 }}>
                  <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 3" />
                  <XAxis dataKey="week" tick={{ fontSize:8, fill:muted, fontFamily:'IBM Plex Mono' }} axisLine={false} tickLine={false} interval={Math.floor(chartData.length/8)} />
                  <YAxis tick={{ fontSize:8, fill:muted, fontFamily:'IBM Plex Mono' }} axisLine={false} tickLine={false} tickFormatter={v=>`€${v}`} />
                  <Tooltip
                    contentStyle={{ background:isDark?'#131620':'#fff', border:`1px solid ${grid}`, borderRadius:8, fontSize:11, fontFamily:'IBM Plex Mono' }}
                    formatter={(v:number)=>[`€${v.toFixed(2)}`,'Spend']}
                  />
                  <ReferenceLine y={90} stroke={grid} strokeDasharray="5 4" strokeWidth={1.5}
                    label={{ value:'€90', position:'insideTopLeft', fontSize:8, fill:muted, fontFamily:'IBM Plex Mono' }} />
                  {anomaly && (
                    <ReferenceLine y={anomaly.average + anomaly.stddev} stroke={warn} strokeDasharray="3 3" strokeWidth={1}
                      label={{ value:'anomaly', position:'insideTopRight', fontSize:7, fill:warn, fontFamily:'IBM Plex Mono' }} />
                  )}
                  <Bar dataKey="spend" radius={[3,3,0,0]}>
                    {chartData.map((d,i) => (
                      <Cell key={i} fill={d.over ? warn : accent} fillOpacity={d.over ? 1 : 0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
