import Link from 'next/link'
import { formatDate, formatEuro } from '@/lib/utils'
import type { Receipt } from '@/lib/db'

export function RecentReceipts({ receipts }: { receipts: Receipt[] }) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="card-label" style={{ marginBottom: 0 }}>Recent Receipts</div>
        <Link
          href="/receipts"
          style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
        >
          View all →
        </Link>
      </div>

      {receipts.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-4)', textAlign: 'center', padding: '20px 0' }}>
          No receipts yet — upload your first receipt!
        </div>
      ) : (
        <div className="flex flex-col">
          {receipts.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2.5 py-2.5"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              {/* Icon */}
              <div
                className="flex items-center justify-center text-[13px] flex-shrink-0"
                style={{
                  width: 30, height: 30,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                }}
              >
                {r.store_id === '5805' ? '☕' : '🏪'}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
                  {formatDate(r.receipt_date, 'EEE d MMM')} — {r.store_name ?? 'AH'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 1, fontFamily: 'var(--font-body)' }}>
                  {r.item_count ?? '?'} items · Store {r.store_id}
                </div>
              </div>

              {/* Amount */}
              <div className="text-right flex-shrink-0">
                <div className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                  {formatEuro(r.net_grocery_spend ?? r.total_paid)}
                </div>
                {Number(r.bonus_savings) > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--good)' }}>
                    −{formatEuro(Number(r.bonus_savings))} bonus
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
