'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChartColumn, ChefHat, LayoutGrid, ReceiptText, Tags } from 'lucide-react'

const TABS = [
  { href: '/', icon: LayoutGrid, label: 'Home' },
  { href: '/receipts', icon: ReceiptText, label: 'Receipts' },
  { href: '/analysis', icon: ChartColumn, label: 'Analysis' },
  { href: '/meal-planner', icon: ChefHat, label: 'Meals' },
  { href: '/deals', icon: Tags, label: 'Deals' },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="mobile-dock md:hidden">
      <div className="mobile-dock__inner">
        {TABS.map(({ href, icon: Icon, label }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`mobile-dock__link ${active ? 'active' : ''}`}
            >
              <Icon size={18} strokeWidth={2.1} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
