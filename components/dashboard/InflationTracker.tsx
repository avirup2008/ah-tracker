import { formatEuro } from '@/lib/utils'

interface InflationItem {
  clean_name: string
  category: string
  first_price: number
  latest_price: number
  purchase_count: number
}

export function InflationTracker({ items }: { items: InflationItem[] }) {
  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="card-label">Price Inflation — Your Items (all time)</div>

      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-4)', textAlign: 'center', padding: '20px 0' }}>
          Parse more receipts to see price trends over time
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((item) => {
            const first  = Number(item.first_price)
            const latest = Number(item.latest_price)
            const diff   = latest - first
            const pct    = first > 0 ? Math.round((diff / first) * 100) : 0
            const isUp   = diff > 0
            const isDown = diff < 0

            return (
              <div
                key={item.clean_name}
                className="flex items-center justify-between py-2.5"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span
                  style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', flex: 1, paddingRight: 12, lineHeight: 1.3 }}
                >
                  {item.clean_name}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className="mono"
                    style={{ fontSize: 12, fontWeight: 600, color: isUp ? 'var(--warn)' : isDown ? 'var(--good)' : 'var(--text-3)' }}
                  >
                    {isUp ? '+' : ''}{pct}%
                  </span>
                  <span
                    style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 100, fontWeight: 600,
                      fontFamily: 'var(--font-body)',
                      background: isUp ? 'var(--warn-dim)' : isDown ? 'var(--good-dim)' : 'var(--surface2)',
                      color: isUp ? 'var(--warn)' : isDown ? 'var(--good)' : 'var(--text-3)',
                    }}
                  >
                    {isUp ? '↑' : isDown ? '↓' : '='} {formatEuro(Math.abs(diff))}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
