'use client'

import { useState } from 'react'
import { formatEuro } from '@/lib/utils'

interface Props {
  weekSpend:     number
  monthSpend:    number
  projected:     number
  monthlyTarget: number
  moDelta:       number | null
}

function renderMarkdown(text: string) {
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    // Bold section header **text**
    if (line.startsWith('**') && line.endsWith('**')) {
      result.push(
        <div key={i} style={{
          fontSize: 11,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
          marginTop: result.length > 0 ? 16 : 0,
          marginBottom: 6,
        }}>
          {line.slice(2,-2)}
        </div>
      )
    } else if (/^\d+\./.test(line)) {
      // Numbered list item
      result.push(
        <div key={i} style={{ display:'flex', gap:8, marginBottom:4 }}>
          <span style={{ fontSize:11, fontFamily:'var(--font-mono)', color:'var(--accent)', flexShrink:0, minWidth:16 }}>
            {line.match(/^(\d+)\./)?.[1]}.
          </span>
          <p style={{ fontSize:12, lineHeight:1.65, color:'var(--text-2)', fontFamily:'var(--font-body)', margin:0 }}>
            {line.replace(/^\d+\.\s*/,'')}
          </p>
        </div>
      )
    } else {
      result.push(
        <p key={i} style={{ fontSize:12, lineHeight:1.65, color:'var(--text-2)', fontFamily:'var(--font-body)', margin:'0 0 4px 0' }}>
          {line}
        </p>
      )
    }
    i++
  }
  return result
}

export function AiInsightsDashboard({ weekSpend, monthSpend, projected, monthlyTarget, moDelta }: Props) {
  const [open, setOpen]         = useState(false)
  const [loading, setLoading]   = useState(false)
  const [text, setText]         = useState('')
  const [error, setError]       = useState<string|null>(null)

  const overBudget  = projected > monthlyTarget
  const overAmount  = Math.abs(projected - monthlyTarget)

  const teaser = overBudget
    ? `Projecting ${formatEuro(projected)} this month — ${formatEuro(overAmount)} over target.`
    : `On track for ${formatEuro(projected)} this month — ${formatEuro(overAmount)} under target.`

  const run = async () => {
    setLoading(true)
    setError(null)
    setText('')
    setOpen(true)
    try {
      const iRes  = await fetch('/api/ai-insights')
      const iData = await iRes.json()
      if (iData.error) throw new Error(iData.error)
      const gRes  = await fetch('/api/ai-insights/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: iData.prompt }),
      })
      const gData = await gRes.json()
      if (gData.error) throw new Error(gData.error)
      setText(gData.text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* ── Header row ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'space-between',
        padding: '14px 20px',
        borderBottom: open ? '1px solid var(--border)' : 'none',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:18 }}>✦</span>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', fontFamily:'var(--font-body)' }}>
              AI Spend Analysis
            </div>
            <div style={{ fontSize:11, color: overBudget ? 'var(--warn)' : 'var(--good)', fontFamily:'var(--font-body)', marginTop:1 }}>
              {teaser}
            </div>
          </div>
        </div>

        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {text && (
            <button className="btn-ghost" onClick={run} disabled={loading}>
              ↺ Refresh
            </button>
          )}
          <button
            className="btn-primary"
            onClick={text ? () => setOpen(o => !o) : run}
            disabled={loading}
          >
            {loading ? '⏳ Analysing…' : text ? (open ? '↑ Collapse' : '↓ Show Analysis') : '✦ Analyse Spending'}
          </button>
        </div>
      </div>

      {/* ── Expandable body ────────────────────────────────────── */}
      {open && (
        <div className="animate-in" style={{ padding: '20px 24px' }}>
          {loading && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'16px 0', color:'var(--text-3)' }}>
              <div style={{ width:6,height:6,borderRadius:'50%',background:'var(--accent)',animation:'pulse 1s infinite' }} />
              <span style={{ fontSize:12.5, fontFamily:'var(--font-body)' }}>Reading your spending data…</span>
            </div>
          )}
          {error && (
            <div className="so-what warn">
              ⚠️ {error.includes('429') ? 'Gemini quota exceeded — try again tomorrow.' : error}
            </div>
          )}
          {text && !loading && (
            <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap:'20px 40px' }}>
              {renderMarkdown(text)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
