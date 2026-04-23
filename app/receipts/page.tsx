'use client'

import { useState, useCallback, useEffect } from 'react'
import { CATEGORY_LABEL, formatDate, formatEuro } from '@/lib/utils'

interface Receipt {
  id: number
  filename: string
  receipt_date: string
  net_grocery_spend: number
  bonus_savings: number
  item_count: number
  store_name: string
  store_id: string
  parsed: boolean
  parse_error: string | null
  reviewed_at?: string | null
  total_paid?: number
  payment_method?: string | null
  subtotal?: number
  koopzegels?: number
  statiegeld?: number
}

interface ReviewAssessment {
  score: number
  priority: 'high' | 'medium' | 'low' | 'none'
  needs_review: boolean
  reasons: string[]
}

interface ReviewQueueItem extends Receipt {
  review: ReviewAssessment
}

interface Summary {
  total: number
  parsed: number
  pending: number
  errors: number
  totalSpend: number
  totalSavings: number
  dateMin: string
  dateMax: string
  avgPerWeek: number
}

interface ReceiptItem {
  id?: number
  raw_name: string
  clean_name: string | null
  category: string | null
  subcategory: string | null
  quantity: number
  unit_price: number
  total_price: number
  is_bonus_item: boolean
  is_statiegeld: boolean
  is_koopzegel: boolean
  is_non_food: boolean
  btw_rate: number | null
}

interface ReceiptDetail {
  receipt: Receipt
  items: ReceiptItem[]
}

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))
const STORE_OPTIONS = [
  { value: '1251', label: 'Beverhof, Beverwijk' },
  { value: '5805', label: 'AH to go' },
  { value: '5609', label: 'Unknown AH location' },
  { value: '8755', label: 'Unknown AH location' },
  { value: '5606', label: 'Unknown AH location' },
  { value: '1653', label: 'Unknown AH location' },
  { value: '5833', label: 'Unknown AH location' },
  { value: '5885', label: 'Unknown AH location' },
  { value: '1379', label: 'Unknown AH location' },
]

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [parseMsg, setParseMsg] = useState<string | null>(null)
  const [parsingPending, setParsingPending] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ReceiptDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [retryingParse, setRetryingParse] = useState(false)
  const [categorisingItems, setCategorisingItems] = useState(false)
  const [editorMsg, setEditorMsg] = useState<string | null>(null)
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([])

  const fetchReceipts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/receipts?limit=200')
      const data = await res.json()
      const all: Receipt[] = data.receipts ?? []
      const reviewRes = await fetch('/api/receipts/review-queue')
      const reviewData = await reviewRes.json()
      setReceipts(all)
      setReviewQueue(reviewData.queue ?? [])
      setTotal(data.total ?? 0)

      const parsed = all.filter((receipt) => receipt.parsed)
      const pending = all.filter((receipt) => !receipt.parsed && !receipt.parse_error)
      const errors = all.filter((receipt) => !!receipt.parse_error)
      const totalSpend = parsed.reduce((sum, receipt) => sum + Number(receipt.net_grocery_spend ?? 0), 0)
      const totalSavings = parsed.reduce((sum, receipt) => sum + Number(receipt.bonus_savings ?? 0), 0)
      const dates = parsed.map((receipt) => receipt.receipt_date).filter(Boolean).sort()
      const dateMin = dates[0] ?? ''
      const dateMax = dates[dates.length - 1] ?? ''

      let weeksSpanned = 1
      if (dateMin && dateMax) {
        const ms = new Date(dateMax).getTime() - new Date(dateMin).getTime()
        weeksSpanned = Math.max(1, Math.round(ms / (7 * 24 * 60 * 60 * 1000)))
      }

      setSummary({
        total: all.length,
        parsed: parsed.length,
        pending: pending.length,
        errors: errors.length,
        totalSpend,
        totalSavings,
        dateMin,
        dateMax,
        avgPerWeek: weeksSpanned > 0 ? totalSpend / weeksSpanned : 0,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReceipts()
  }, [fetchReceipts])

  const fetchDetail = useCallback(async (receiptId: number) => {
    setSelectedId(receiptId)
    setDetailLoading(true)
    setEditorMsg(null)
    try {
      const res = await fetch(`/api/receipts/${receiptId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load receipt')
      setDetail(data)
    } catch (err) {
      setEditorMsg(err instanceof Error ? `❌ ${err.message}` : '❌ Failed to load receipt')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const handleFiles = async (files: FileList | File[]) => {
    if (!files.length) return
    setUploading(true)
    setUploadMsg(null)
    const formData = new FormData()
    Array.from(files).forEach((file) => formData.append('files', file))
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
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
    const pendingIds = receipts
      .filter((receipt) => !receipt.parsed && !receipt.parse_error)
      .map((receipt) => receipt.id)

    if (pendingIds.length === 0) {
      setParseMsg('No pending receipts to parse.')
      return
    }

    setParsingPending(true)
    setParseMsg(`Parsing 0/${pendingIds.length} receipts…`)

    let parsedCount = 0
    let errorCount = 0
    const chunkSize = 2

    try {
      for (let index = 0; index < pendingIds.length; index += chunkSize) {
        const receiptIds = pendingIds.slice(index, index + chunkSize)
        setParseMsg(`Parsing ${Math.min(index, pendingIds.length)}/${pendingIds.length} receipts…`)

        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => controller.abort(), 90000)

        try {
          const res = await fetch('/api/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receiptIds }),
            signal: controller.signal,
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Parse request failed')

          parsedCount += Number(data.parsed ?? 0)
          errorCount += Number(data.errors ?? 0)
        } finally {
          window.clearTimeout(timeoutId)
        }
      }

      setParseMsg(`Parsed ${parsedCount}/${pendingIds.length} receipts${errorCount ? ` · ${errorCount} errors` : ''}`)
      await fetchReceipts()
    } catch (err) {
      const message = err instanceof DOMException && err.name === 'AbortError'
        ? 'Parse timed out on the current batch. Refresh and try again; completed receipts were saved.'
        : err instanceof Error
          ? err.message
          : 'Parse failed'
      setParseMsg(`❌ ${message}`)
      await fetchReceipts()
    } finally {
      setParsingPending(false)
    }
  }

  const updateReceiptField = (field: keyof Receipt, value: string | number | null) => {
    setDetail((current) => current ? {
      ...current,
      receipt: {
        ...current.receipt,
        [field]: value,
      },
    } : current)
  }

  const updateItem = (index: number, patch: Partial<ReceiptItem>) => {
    setDetail((current) => {
      if (!current) return current
      const items = current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)
      return { ...current, items }
    })
  }

  const addItem = () => {
    setDetail((current) => current ? {
      ...current,
      items: [
        ...current.items,
        {
          raw_name: '',
          clean_name: null,
          category: null,
          subcategory: null,
          quantity: 1,
          unit_price: 0,
          total_price: 0,
          is_bonus_item: false,
          is_statiegeld: false,
          is_koopzegel: false,
          is_non_food: false,
          btw_rate: null,
        },
      ],
    } : current)
  }

  const removeItem = (index: number) => {
    setDetail((current) => current ? {
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    } : current)
  }

  const saveCorrections = async () => {
    if (!detail || !selectedId) return
    setSaving(true)
    setEditorMsg('Saving corrections…')
    try {
      const res = await fetch(`/api/receipts/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_date: String(detail.receipt.receipt_date).slice(0, 10),
          store_id: detail.receipt.store_id,
          payment_method: detail.receipt.payment_method,
          total_paid: Number(detail.receipt.total_paid ?? 0),
          bonus_savings: Number(detail.receipt.bonus_savings ?? 0),
          koopzegels: Number(detail.receipt.koopzegels ?? 0),
          statiegeld: Number(detail.receipt.statiegeld ?? 0),
          items: detail.items,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save receipt')
      setEditorMsg('✅ Corrections saved')
      await Promise.all([fetchReceipts(), fetchDetail(selectedId)])
    } catch (err) {
      setEditorMsg(err instanceof Error ? `❌ ${err.message}` : '❌ Failed to save receipt')
    } finally {
      setSaving(false)
    }
  }

  const retrySelectedParse = async () => {
    if (!selectedId) return

    setRetryingParse(true)
    setEditorMsg('Retrying parse…')
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptIds: [selectedId], force: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Retry parse failed')

      const result = data.results?.[0]
      if (result?.status === 'parsed') {
        setEditorMsg('✅ Receipt parsed successfully')
      } else {
        setEditorMsg(`❌ ${result?.message ?? 'Parse still failed'}`)
      }

      await Promise.all([fetchReceipts(), fetchDetail(selectedId)])
    } catch (err) {
      setEditorMsg(err instanceof Error ? `❌ ${err.message}` : '❌ Retry parse failed')
    } finally {
      setRetryingParse(false)
    }
  }

  const categoriseSelectedItems = async () => {
    if (!selectedId) return

    setCategorisingItems(true)
    setEditorMsg('Running AI categorisation…')
    try {
      const res = await fetch(`/api/receipts/${selectedId}/categorise`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI categorisation failed')

      const updated = Number(data.updated ?? 0)
      const totalItems = Number(data.total ?? updated)
      setEditorMsg(updated > 0
        ? `✅ Categorised ${updated}/${totalItems} items`
        : `No uncategorised items found${totalItems > 0 ? ', or AI returned no usable categories' : ''}`)
      await Promise.all([fetchReceipts(), fetchDetail(selectedId)])
    } catch (err) {
      setEditorMsg(err instanceof Error ? `❌ ${err.message}` : '❌ AI categorisation failed')
    } finally {
      setCategorisingItems(false)
    }
  }

  const detailSubtotal = detail?.items
    .filter((item) => !item.is_statiegeld && !item.is_koopzegel)
    .reduce((sum, item) => sum + Number(item.total_price || 0), 0) ?? 0
  const detailNetSpend = Math.max(
    0,
    Number(detail?.receipt.total_paid ?? 0) -
      Number(detail?.receipt.koopzegels ?? 0) -
      Number(detail?.receipt.statiegeld ?? 0)
  )
  const uncategorisedCount = detail?.items.filter((item) =>
    !item.is_statiegeld &&
    !item.is_koopzegel &&
    (!item.clean_name || !item.category || item.btw_rate === null)
  ).length ?? 0

  return (
    <div className="flex flex-col gap-5">
      {summary && (
        <div className="stat-bar animate-in">
          <div className="stat-bar-item">
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{summary.total}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 2, fontFamily: 'var(--font-body)' }}>Total receipts</div>
          </div>
          <div className="stat-bar-item">
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{formatEuro(summary.totalSpend)}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 2, fontFamily: 'var(--font-body)' }}>All-time spend</div>
          </div>
          <div className="stat-bar-item">
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--good)' }}>{formatEuro(summary.totalSavings)}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 2, fontFamily: 'var(--font-body)' }}>Bonus saved</div>
          </div>
          <div className="stat-bar-item">
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{formatEuro(Math.round(summary.avgPerWeek * 100) / 100)}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 2, fontFamily: 'var(--font-body)' }}>Avg per week</div>
          </div>
          <div className="stat-bar-item">
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
              {summary.dateMin ? formatDate(summary.dateMin, 'MMM yyyy') : '—'} → {summary.dateMax ? formatDate(summary.dateMax, 'MMM yyyy') : '—'}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 2, fontFamily: 'var(--font-body)' }}>Date range</div>
          </div>
          <div className="stat-bar-item">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="badge badge-good">{summary.parsed} parsed</span>
              {summary.pending > 0 && <span className="badge badge-neutral">{summary.pending} pending</span>}
              {summary.errors > 0 && <span className="badge badge-warn">{summary.errors} errors</span>}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 4, fontFamily: 'var(--font-body)' }}>Parse status</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px_440px] gap-4">
        <div className="card p-5">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span className="card-label" style={{ marginBottom: 0 }}>All Receipts ({total})</span>
            <button className="btn-ghost" onClick={fetchReceipts} style={{ fontSize: 11 }}>↻ Refresh</button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3, 4, 5].map((index) => (
                <div key={index} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="skeleton" style={{ height: 12, flex: 1 }} />
                  <div className="skeleton" style={{ height: 12, width: 60 }} />
                  <div className="skeleton" style={{ height: 12, width: 50 }} />
                </div>
              ))}
            </div>
          ) : receipts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-4)', fontSize: 13 }}>
              No receipts yet — upload your first PDF →
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table" style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    {['Date', 'Store', 'Items', 'Spend', 'Bonus saved', 'Status'].map((heading) => (
                      <th key={heading}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((receipt) => (
                    <tr
                      key={receipt.id}
                      onClick={() => fetchDetail(receipt.id)}
                      style={{
                        cursor: 'pointer',
                        background: selectedId === receipt.id ? 'var(--surface2)' : undefined,
                      }}
                    >
                      <td style={{ fontFamily: 'var(--font-body)', color: 'var(--text)' }}>
                        {formatDate(receipt.receipt_date, 'EEE d MMM yyyy')}
                      </td>
                      <td style={{ color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
                        {receipt.store_name ?? 'Unknown'}
                      </td>
                      <td className="mono" style={{ color: 'var(--text-3)' }}>{receipt.item_count ?? '—'}</td>
                      <td className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{formatEuro(receipt.net_grocery_spend)}</td>
                      <td className="mono" style={{ color: 'var(--good)' }}>
                        {Number(receipt.bonus_savings) > 0 ? `−${formatEuro(Number(receipt.bonus_savings))}` : '—'}
                      </td>
                      <td>
                        <span className={`badge ${receipt.parsed ? 'badge-good' : receipt.parse_error ? 'badge-warn' : 'badge-neutral'}`}>
                          {receipt.parsed ? 'Parsed' : receipt.parse_error ? 'Error' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card p-5">
            <div className="card-label">Upload Receipts</div>
            <div
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => { event.preventDefault(); setIsDragging(false); handleFiles(event.dataTransfer.files) }}
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
              <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.5, margin: 0 }}>
                Drop AH receipt PDFs here<br />
                <span style={{ color: 'var(--text-4)', fontSize: 11 }}>or click to browse</span>
              </p>
              <input
                id="receipt-file-input"
                type="file"
                accept=".pdf"
                multiple
                style={{ display: 'none' }}
                onChange={(event) => event.target.files && handleFiles(event.target.files)}
              />
            </div>

            {uploading && <p style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginTop: 10, textAlign: 'center' }}>Uploading…</p>}
            {uploadMsg && <p style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', marginTop: 10, lineHeight: 1.5 }}>{uploadMsg}</p>}
          </div>

          <div className="card p-5">
            <div className="card-label">Bulk Parse</div>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)', lineHeight: 1.5, marginBottom: 14 }}>
              Parse all pending receipts. Use manual review when a parsed receipt needs correction.
            </p>
            <button
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={parsePending}
              disabled={parsingPending}
            >
              {parsingPending ? 'Parsing…' : 'Parse All Pending'}
            </button>
            {parseMsg && <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-body)', marginTop: 10, textAlign: 'center' }}>{parseMsg}</p>}
          </div>

          <div className="card p-5">
            <div className="card-label">Review Queue</div>
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)', lineHeight: 1.5, marginBottom: 14 }}>
              Prioritized receipts with parse failures, low-confidence fields, or missing item metadata.
            </p>
            {reviewQueue.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--good)', fontFamily: 'var(--font-body)' }}>No receipts currently need review.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {reviewQueue.slice(0, 6).map((receipt) => (
                  <button
                    key={receipt.id}
                    className="btn-ghost"
                    style={{ justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', textAlign: 'left', padding: '10px 12px' }}
                    onClick={() => fetchDetail(receipt.id)}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                        {formatDate(receipt.receipt_date, 'd MMM')} · {receipt.store_name ?? 'Unknown store'}
                      </span>
                      <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)', lineHeight: 1.45 }}>
                        {receipt.review.reasons.slice(0, 2).join(' · ')}
                      </span>
                    </div>
                    <span className={`badge ${receipt.review.priority === 'high' ? 'badge-warn' : receipt.review.priority === 'medium' ? 'badge-neutral' : 'badge-good'}`}>
                      {receipt.review.priority}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card p-5" style={{ minHeight: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="card-label" style={{ marginBottom: 0 }}>Receipt Review</div>
            {selectedId && (
              <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => fetchDetail(selectedId)}>
                ↻ Reload
              </button>
            )}
          </div>

          {!selectedId && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-4)', fontSize: 13 }}>
              Select a receipt from the table to review and correct it.
            </div>
          )}

          {selectedId && detailLoading && (
            <div style={{ color: 'var(--text-4)', fontSize: 13, padding: '24px 0' }}>Loading receipt…</div>
          )}

          {selectedId && !detailLoading && detail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
                  {detail.receipt.filename}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>
                    ID {detail.receipt.id}
                  </div>
                  {detail.receipt.reviewed_at && (
                    <span className="badge badge-good">Reviewed</span>
                  )}
                </div>
              </div>

              {reviewQueue.find((item) => item.id === detail.receipt.id)?.review && (
                <div className="rounded-[var(--radius-sm)] border p-3" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div className="card-label" style={{ marginBottom: 0 }}>Needs Review</div>
                    <span className={`badge ${reviewQueue.find((item) => item.id === detail.receipt.id)?.review.priority === 'high' ? 'badge-warn' : 'badge-neutral'}`}>
                      score {reviewQueue.find((item) => item.id === detail.receipt.id)?.review.score}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                    {reviewQueue.find((item) => item.id === detail.receipt.id)?.review.reasons.map((reason) => (
                      <span key={reason} className="badge badge-neutral">{reason}</span>
                    ))}
                  </div>
                </div>
              )}

              {detail.receipt.parse_error && (
                <div
                  className="rounded-[var(--radius-sm)] border p-3"
                  style={{
                    background: 'color-mix(in srgb, var(--warn) 8%, var(--surface2))',
                    borderColor: 'color-mix(in srgb, var(--warn) 28%, var(--border))',
                  }}
                >
                  <div className="card-label" style={{ marginBottom: 8, color: 'var(--warn)' }}>Parse Error Detail</div>
                  <p style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-body)', lineHeight: 1.5, marginBottom: 10 }}>
                    {detail.receipt.parse_error}
                  </p>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)', lineHeight: 1.55 }}>
                    What to do: if the PDF is an AH receipt, enter the receipt date, total paid, and line items below, then save corrections.
                    If the PDF is unreadable or not an AH receipt, remove it from tracking or leave it in review.
                    {detail.receipt.parse_error === 'Could not parse receipt structure' && (
                      <span> This receipt was parsed before detailed diagnostics were added; retry parsing to see exactly which fields are missing.</span>
                    )}
                  </div>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 11, marginTop: 10 }}
                    onClick={retrySelectedParse}
                    disabled={retryingParse}
                  >
                    {retryingParse ? 'Retrying parse…' : 'Retry parse this receipt'}
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Receipt date">
                  <input className="editor-input" type="date" value={String(detail.receipt.receipt_date).slice(0, 10)} onChange={(event) => updateReceiptField('receipt_date', event.target.value)} />
                </Field>
                <Field label="Store">
                  <select className="editor-input" value={detail.receipt.store_id ?? ''} onChange={(event) => updateReceiptField('store_id', event.target.value || null)}>
                    <option value="">Unknown</option>
                    {STORE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
                <Field label="Payment method">
                  <input className="editor-input" type="text" value={detail.receipt.payment_method ?? ''} onChange={(event) => updateReceiptField('payment_method', event.target.value || null)} />
                </Field>
                <Field label="Bonus savings">
                  <input className="editor-input" type="number" step="0.01" value={Number(detail.receipt.bonus_savings ?? 0)} onChange={(event) => updateReceiptField('bonus_savings', Number(event.target.value))} />
                </Field>
                <Field label="Koopzegels">
                  <input className="editor-input" type="number" step="0.01" value={Number(detail.receipt.koopzegels ?? 0)} onChange={(event) => updateReceiptField('koopzegels', Number(event.target.value))} />
                </Field>
                <Field label="Statiegeld">
                  <input className="editor-input" type="number" step="0.01" value={Number(detail.receipt.statiegeld ?? 0)} onChange={(event) => updateReceiptField('statiegeld', Number(event.target.value))} />
                </Field>
                <Field label="Total paid">
                  <input className="editor-input" type="number" step="0.01" value={Number(detail.receipt.total_paid ?? 0)} onChange={(event) => updateReceiptField('total_paid', Number(event.target.value))} />
                </Field>
                <div className="rounded-[var(--radius-sm)] border p-3" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
                  <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{formatEuro(detailNetSpend)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 4 }}>Net grocery spend</div>
                  <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 6 }}>Subtotal {formatEuro(detailSubtotal)}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                <div className="card-label" style={{ marginBottom: 0 }}>Line Items ({detail.items.length})</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {uncategorisedCount > 0 && (
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 11 }}
                      onClick={categoriseSelectedItems}
                      disabled={categorisingItems}
                    >
                      {categorisingItems
                        ? 'Categorising…'
                        : `AI categorise ${uncategorisedCount} item${uncategorisedCount === 1 ? '' : 's'}`}
                    </button>
                  )}
                  <button className="btn-ghost" style={{ fontSize: 11 }} onClick={addItem}>＋ Add item</button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
                {detail.items.length === 0 && (
                  <div className="rounded-[var(--radius-sm)] border p-3" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                      No line items were parsed. Add the receipt items manually, or reload after trying parse again.
                    </p>
                  </div>
                )}
                {detail.items.map((item, index) => (
                  <div key={`${item.id ?? 'new'}-${index}`} className="rounded-[var(--radius-sm)] border p-3" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Raw name">
                        <input className="editor-input" type="text" value={item.raw_name} onChange={(event) => updateItem(index, { raw_name: event.target.value })} />
                      </Field>
                      <Field label="Clean name">
                        <input className="editor-input" type="text" value={item.clean_name ?? ''} onChange={(event) => updateItem(index, { clean_name: event.target.value || null })} />
                      </Field>
                      <Field label="Category">
                        <select className="editor-input" value={item.category ?? ''} onChange={(event) => updateItem(index, { category: event.target.value || null })}>
                          <option value="">Unknown</option>
                          {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Subcategory">
                        <input className="editor-input" type="text" value={item.subcategory ?? ''} onChange={(event) => updateItem(index, { subcategory: event.target.value || null })} />
                      </Field>
                      <Field label="Quantity">
                        <input className="editor-input" type="number" step="0.01" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} />
                      </Field>
                      <Field label="Unit price">
                        <input className="editor-input" type="number" step="0.01" value={item.unit_price} onChange={(event) => updateItem(index, { unit_price: Number(event.target.value) })} />
                      </Field>
                      <Field label="Total price">
                        <input className="editor-input" type="number" step="0.01" value={item.total_price} onChange={(event) => updateItem(index, { total_price: Number(event.target.value) })} />
                      </Field>
                      <Field label="BTW rate">
                        <select className="editor-input" value={item.btw_rate ?? ''} onChange={(event) => updateItem(index, { btw_rate: event.target.value ? Number(event.target.value) : null })}>
                          <option value="">Unknown</option>
                          <option value="9">9%</option>
                          <option value="21">21%</option>
                        </select>
                      </Field>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
                      <Check label="Bonus item" checked={item.is_bonus_item} onChange={(checked) => updateItem(index, { is_bonus_item: checked })} />
                      <Check label="Statiegeld" checked={item.is_statiegeld} onChange={(checked) => updateItem(index, { is_statiegeld: checked })} />
                      <Check label="Koopzegel" checked={item.is_koopzegel} onChange={(checked) => updateItem(index, { is_koopzegel: checked })} />
                      <Check label="Non-food" checked={item.is_non_food} onChange={(checked) => updateItem(index, { is_non_food: checked })} />
                      <button className="btn-ghost" style={{ fontSize: 11, marginLeft: 'auto' }} onClick={() => removeItem(index)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn-primary" onClick={saveCorrections} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Corrections'}
                </button>
                {editorMsg && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
                    {editorMsg}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </span>
      {children}
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  )
}
