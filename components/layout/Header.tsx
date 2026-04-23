'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChartColumn, ChefHat, LayoutGrid, ReceiptText, Tags } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutGrid },
  { href: '/receipts', label: 'Receipts', icon: ReceiptText },
  { href: '/analysis', label: 'Analysis', icon: ChartColumn },
  { href: '/meal-planner', label: 'Meal Planner', icon: ChefHat },
  { href: '/deals', label: 'Deals', icon: Tags },
]

export function Header() {
  const pathname = usePathname()

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link href="/" className="app-brand" style={{ textDecoration: 'none' }}>
          <div className="app-brand__mark">
            <span className="app-brand__mark-top">AH</span>
            <span className="app-brand__mark-bottom">TRACKER</span>
          </div>
          <div className="app-brand__copy">
            <div className="app-brand__title">AH Tracker</div>
            <div className="app-brand__subtitle">Household Grocery Intelligence</div>
          </div>
        </Link>

        <nav className="app-nav hidden md:flex">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`app-nav__link ${active ? 'active' : ''}`}
              >
                <Icon size={15} strokeWidth={2} />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="app-header__meta">
          <WeekChip />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

function WeekChip() {
  const now = new Date()
  const weekNum = getISOWeek(now)
  const month = now.toLocaleString('en', { month: 'short' })
  const year = now.getFullYear()

  return (
    <div className="app-week-chip hidden sm:flex">
      <span className="app-week-chip__label">Current Week</span>
      <span className="mono">W{weekNum} · {month} {year}</span>
    </div>
  )
}

function getISOWeek(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}
