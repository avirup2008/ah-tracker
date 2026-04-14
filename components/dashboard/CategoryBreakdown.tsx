'use client'

import { CATEGORY_ICONS, formatEuro, catLabel } from '@/lib/utils'

interface CategoryRow {
  category: string
  total: number
  item_count: number
}

export function CategoryBreakdown({ categories }: { categories: CategoryRow[] }) {
  const maxSpend = categories.length > 0 ? Math.max(...categories.map(c => Number(c.total))) : 1

  const WARN_CATEGORIES = ['Snacks & Zoetwaren', 'Bier & Wijn', 'Maaltijden kant-en-klaar']

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="card-label">Category Breakdown — This Month</div>

      {categories.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-4)', textAlign: 'center', padding: '20px 0' }}>
          No data yet
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {categories.map((cat) => {
            const pct = Math.round((Number(cat.total) / maxSpend) * 100)
            const isWarn = WARN_CATEGORIES.includes(cat.category)
            const barColor = isWarn ? 'var(--warn)' : 'var(--accent)'
            const icon = CATEGORY_ICONS[cat.category] ?? '📦'

            return (
              <div key={cat.category}>
                <div className="flex justify-between items-baseline mb-1">
                  <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
                    {icon} {catLabel(cat.category)}
                  </span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                    {formatEuro(Number(cat.total))}
                  </span>
                </div>
                <div
                  style={{
                    height: 5,
                    background: 'var(--surface3)',
                    borderRadius: 100,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: barColor,
                      borderRadius: 100,
                      transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
