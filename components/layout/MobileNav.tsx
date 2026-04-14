'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/',             icon: '📊', label: 'Dashboard'  },
  { href: '/receipts',     icon: '🧾', label: 'Receipts'   },
  { href: '/analysis',     icon: '📈', label: 'Analysis'   },
  { href: '/meal-planner', icon: '🍽️', label: 'Meals'      },
  { href: '/deals',        icon: '🏷️', label: 'Deals'      },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TABS.map(({ href, icon, label }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all"
            style={{
              color: active ? 'var(--accent)' : 'var(--text-4)',
              fontSize: 10,
              fontFamily: 'var(--font-body)',
              fontWeight: active ? 700 : 500,
              textDecoration: 'none',
              minHeight: 52,
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
            <span>{label}</span>
            {active && (
              <span style={{
                position: 'absolute',
                top: 0,
                width: 24,
                height: 2,
                borderRadius: '0 0 4px 4px',
                background: 'var(--accent)',
              }} />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
