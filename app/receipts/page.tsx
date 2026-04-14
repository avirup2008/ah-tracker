'use client'

import { useState, useCallback, useEffect } from 'react'
import { formatDate, formatEuro } from '@/lib/utils'

interface Receipt {
  id: number; filename: string; receipt_date: string
  net_grocery_spend: number; bonus_savings: number
  item_count: number; store_name: string; store_id: string
  parsed: boolean; parse_error: string | null
}

interface Summary {
  total: number; parsed: number; pending: number; errors: number
  totalSpend: number; totalSavings: number; dateMin: string; dateMax: string
  avgPerWeek: number
}

export default function ReceiptsPage() {
  const [receipts,    setReceipts]    = useState<Receipt[]>([])
  const [summary,     setSummary]     = useState<Summary | null>(null)
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [uploading,   setUploading]   = useState(false)
  const [uploadMsg,   setUploadMsg]   = useState<string | null>(null)
  const [isDragging,  setIsDragging]  = useState(false)
  const [parseMsg,    setParseMsg]    = useState<string | null>(null)

  const fetchReceipts = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/receipts?limit=200')
      const data = await res.json()
      const all: Receipt[] = data.receipts ?? []
      setReceipts(all)
      setTotal(data.total ?? 0)

      // Compute summary from data
      const parsed   = all.filter(r => r.parsed)
      const pending  = all.filter(r => !r.parsed && !r.parse_error)
      const errors   = all.filter(r => !!r.parse_error)
      const totalSpend   = parsed.reduce((s,r) => s + Number(r.net_grocery_spend ?? 0), 0)
      const totalSavings = parsed.reduce((s,r) => s + Number(r.bonus_savings ?? 0), 0)
      const dates    = parsed.map(r => r.receipt_date).filter(Boolean).sort()
      const dateMin  = dates[0] ?? ''
      const dateMax  = dates[dates.length-1] ?? ''

      // Weeks spanned
      let weeksSpanned = 1
      if (dateMin && dateMax) {
        const ms = new Date(dateMax).getTime() - new Date(dateMin).getTime()
        weeksSpanned = Math.max(1, Math.round(ms / (7*24*60*60*1000)))
      }
      const avgPerWeek = weeksSpanned > 0 ? totalSpend / weeksSpanned : 0

      setSummary({ total: all.length, parsed: parsed.length, pending: pending.length, errors: errors.length, totalSpend, totalSavings, dateMin, dateMax, avgPerWeek })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReceipts() }, [fetchReceipts])

  const handleFiles = async (files: FileList | File[]) => {
    if (!files.length) return
    setUploading(true)
    setUploadMsg(null)
    const fd = new FormData()
    Array.from(files).forEach(f => fd.append('files', f))
    try {
      const res  = await fetch('/api/upload', { method:'POST', body:fd })
      const data = await res.json()
      setUploadMsg(`✅ ${data.uploaded} uploaded · ${data.duplicates} duplicates`)
      fetchReceipts()
    } catch {
      setUploadMsg('❌ Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const parsePending = async () => {
    setParseMsg('Triggering parse…')
    const res  = await fetch('/api/parse')
    const data = await res.json()
    setParseMsg(`Parsed ${data.parsed ?? 0} receipts`)
    fetchReceipts()
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Stat bar ──────────────────────────────────────────── */}
      {summary && (
        <div className="stat-bar animate-in">
          <div className="stat-bar-item">
            <div className="mono" style={{ fontSize:22, fontWeight:700, color:'var(--text)' }}>{summary.total}</div>
            <div style={{ fontSize:10.5, color:'var(--text-4)', marginTop:2, fontFamily:'var(--font-body)' }}>Total receipts</div>
          </div>
          <div className="stat-bar-item">
            <div className="mono" style={{ fontSize:22, fontWeight:700, color:'var(--text)' }}>{formatEuro(summary.totalSpend)}</div>
            <div style={{ fontSize:10.5, color:'var(--text-4)', marginTop:2, fontFamily:'var(--font-body)' }}>All-time spend</div>
          </div>
          <div className="stat-bar-item">
            <div className="mono" style={{ fontSize:22, fontWeight:700, color:'var(--good)' }}>{formatEuro(summary.totalSavings)}</div>
            <div style={{ fontSize:10.5, color:'var(--text-4)', marginTop:2, fontFamily:'var(--font-body)' }}>Bonus saved</div>
          </div>
          <div className="stat-bar-item">
            <div className="mono" style={{ fontSize:22, fontWeight:700, color:'var(--text)' }}>{formatEuro(Math.round(summary.avgPerWeek*100)/100)}</div>
            <div style={{ fontSize:10.5, color:'var(--text-4)', marginTop:2, fontFamily:'var(--font-body)' }}>Avg per week</div>
          </div>
          <div className="stat-bar-item">
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', fontFamily:'var(--font-body)' }}>
              {summary.dateMin ? formatDate(summary.dateMin, 'MMM yyyy') : '—'}
              {' '}→{' '}
              {summary.dateMax ? formatDate(summary.dateMax, 'MMM yyyy') : '—'}
            </div>
            <div style={{ fontSize:10.5, color:'var(--text-4)', marginTop:2, fontFamily:'var(--font-body)' }}>Date range</div>
          </div>
          <div className="stat-bar-item">
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <span className="badge badge-good">{summary.parsed} parsed</span>
              {summary.pending > 0 && <span className="badge badge-neutral">{summary.pending} pending</span>}
              {summary.errors > 0  && <span className="badge badge-warn">{summary.errors} errors</span>}
            </div>
            <div style={{ fontSize:10.5, color:'var(--text-4)', marginTop:4, fontFamily:'var(--font-body)' }}>Parse status</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">

        {/* ── Receipt table ──────────────────────────────────── */}
        <div className="card p-5">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <span className="card-label" style={{ marginBottom:0 }}>All Receipts ({total})</span>
            <button className="btn-ghost" onClick={fetchReceipts} style={{ fontSize:11 }}>↻ Refresh</button>
          </div>

          {loading ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[1,2,3,4,5].map(i=>(
                <div key={i} style={{ display:'flex', gap:12, alignItems:'center' }}>
                  <div className="skeleton" style={{ height:12, flex:1 }} />
                  <div className="skeleton" style={{ height:12, width:60 }} />
                  <div className="skeleton" style={{ height:12, width:50 }} />
                </div>
              ))}
            </div>
          ) : receipts.length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-4)', fontSize:13 }}>
              No receipts yet — upload your first PDF →
            </div>
          ) : (
            <div className="overflow-x-auto"><table className="data-table" style={{minWidth:480}}>
              <thead>
                <tr>
                  {['Date','Store','Items','Spend','Bonus saved','Status'].map(h=>(
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontFamily:'var(--font-body)', color:'var(--text)' }}>
                      {formatDate(r.receipt_date,'EEE d MMM yyyy')}
                    </td>
                    <td style={{ color:'var(--text-2)', fontFamily:'var(--font-body)' }}>
                      {r.store_name ?? 'Unknown'}
                    </td>
                    <td className="mono" style={{ color:'var(--text-3)' }}>{r.item_count ?? '—'}</td>
                    <td className="mono" style={{ fontWeight:600, color:'var(--text)' }}>{formatEuro(r.net_grocery_spend)}</td>
                    <td className="mono" style={{ color:'var(--good)' }}>
                      {Number(r.bonus_savings) > 0 ? `−${formatEuro(Number(r.bonus_savings))}` : '—'}
                    </td>
                    <td>
                      <span className={`badge ${r.parsed ? 'badge-good' : r.parse_error ? 'badge-warn' : 'badge-neutral'}`}>
                        {r.parsed ? 'Parsed' : r.parse_error ? 'Error' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        {/* ── Upload + parse panel ───────────────────────────── */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Drop zone */}
          <div className="card p-5">
            <div className="card-label">Upload Receipts</div>
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }}
              onClick={() => document.getElementById('receipt-file-input')?.click()}
              style={{
                border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border2)'}`,
                borderRadius: 'var(--radius-sm)',
                background: isDragging ? 'var(--accent-dim)' : 'var(--surface2)',
                padding: '28px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize:24, marginBottom:8 }}>📄</div>
              <p style={{ fontSize:12.5, color:'var(--text-2)', fontFamily:'var(--font-body)', lineHeight:1.5, margin:0 }}>
                Drop AH receipt PDFs here<br />
                <span style={{ color:'var(--text-4)', fontSize:11 }}>or click to browse</span>
              </p>
              <input
                id="receipt-file-input"
                type="file" accept=".pdf" multiple
                style={{ display:'none' }}
                onChange={e => e.target.files && handleFiles(e.target.files)}
              />
            </div>

            {uploading && <p style={{ fontSize:12, color:'var(--accent)', fontFamily:'var(--font-mono)', marginTop:10, textAlign:'center' }}>Uploading…</p>}
            {uploadMsg && <p style={{ fontSize:11.5, color:'var(--text-2)', fontFamily:'var(--font-body)', marginTop:10, lineHeight:1.5 }}>{uploadMsg}</p>}
          </div>

          {/* Bulk parse */}
          <div className="card p-5">
            <div className="card-label">Bulk Parse</div>
            <p style={{ fontSize:11.5, color:'var(--text-3)', fontFamily:'var(--font-body)', lineHeight:1.5, marginBottom:14 }}>
              Parse all pending receipts. Run from Terminal for best results with 100+ receipts.
            </p>
            <button className="btn-primary" style={{ width:'100%', justifyContent:'center' }} onClick={parsePending}>
              Parse All Pending
            </button>
            {parseMsg && <p style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--font-body)', marginTop:10, textAlign:'center' }}>{parseMsg}</p>}
          </div>
        </div>

      </div>
    </div>
  )
}
