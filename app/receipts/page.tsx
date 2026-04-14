'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { formatDate, formatEuro } from '@/lib/utils'

interface Receipt {
  id: number; filename: string; receipt_date: string
  net_grocery_spend: number; bonus_savings: number
  item_count: number; store_name: string; store_id: string
  parsed: boolean; parse_error: string | null
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [fetched, setFetched] = useState(false)

  const fetchReceipts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/receipts?limit=50')
      const data = await res.json()
      setReceipts(data.receipts ?? [])
      setTotal(data.total ?? 0)
      setFetched(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => { fetchReceipts() }, [fetchReceipts])

  const handleUpload = async (files: FileList | File[]) => {
    if (!files.length) return
    setUploading(true)
    setUploadResult(null)
    const formData = new FormData()
    Array.from(files).forEach(f => formData.append('files', f))
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      setUploadResult(`✅ ${data.uploaded} uploaded · ${data.duplicates} duplicates · ${data.errors} errors. Parsing in background...`)
      fetchReceipts()
    } catch {
      setUploadResult('❌ Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[1fr_320px] gap-4">

        {/* Receipt list */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="card-label" style={{ marginBottom: 0 }}>All Receipts ({total})</span>
            <button
              onClick={fetchReceipts}
              className="mono"
              style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-4)', fontSize: 13 }}>Loading...</p>
          ) : receipts.length === 0 ? (
            <p style={{ color: 'var(--text-4)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
              No receipts yet — upload your first PDF above
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Date','Store','Items','Spend','Savings','Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-4)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {receipts.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 8px', color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
                      {formatDate(r.receipt_date, 'EEE d MMM yyyy')}
                    </td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
                      {r.store_name ?? 'Unknown'}
                    </td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                      {r.item_count ?? '—'}
                    </td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)' }}>
                      {formatEuro(r.net_grocery_spend)}
                    </td>
                    <td style={{ padding: '9px 8px', fontFamily: 'var(--font-mono)', color: 'var(--good)' }}>
                      {Number(r.bonus_savings) > 0 ? `−${formatEuro(Number(r.bonus_savings))}` : '—'}
                    </td>
                    <td style={{ padding: '9px 8px' }}>
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 100, fontWeight: 600,
                        background: r.parsed ? 'var(--good-dim)' : r.parse_error ? 'var(--warn-dim)' : 'var(--accent-dim)',
                        color: r.parsed ? 'var(--good)' : r.parse_error ? 'var(--warn)' : 'var(--accent)',
                      }}>
                        {r.parsed ? 'Parsed' : r.parse_error ? 'Error' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Upload panel */}
        <div className="flex flex-col gap-4">
          <div className="card p-5">
            <div className="card-label">Upload Receipts</div>
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files) }}
              onClick={() => fileRef.current?.click()}
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
              <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                Drop AH receipt PDFs here<br />
                <span style={{ color: 'var(--text-4)', fontSize: 11 }}>or click to browse</span>
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                multiple
                style={{ display: 'none' }}
                onChange={e => e.target.files && handleUpload(e.target.files)}
              />
            </div>

            {uploading && (
              <p style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginTop: 12, textAlign: 'center' }}>
                Uploading & parsing...
              </p>
            )}
            {uploadResult && (
              <p style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', marginTop: 12, lineHeight: 1.5 }}>
                {uploadResult}
              </p>
            )}
          </div>

          <div className="card p-5">
            <div className="card-label">Bulk Parse</div>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)', lineHeight: 1.5, marginBottom: 12 }}>
              Trigger parsing for all pending receipts (runs in background).
            </p>
            <button
              onClick={async () => {
                setUploadResult('Triggering parse...')
                const res = await fetch('/api/parse')
                const data = await res.json()
                setUploadResult(`Parsed ${data.parsed ?? 0} receipts`)
                fetchReceipts()
              }}
              style={{
                width: '100%', padding: '9px 0', borderRadius: 100,
                background: 'var(--primary)', color: 'var(--bg)',
                border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                fontFamily: 'var(--font-body)',
              }}
            >
              Parse All Pending
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
