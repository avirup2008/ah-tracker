'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/',             label: 'Dashboard'    },
  { href: '/receipts',     label: 'Receipts'     },
  { href: '/analysis',     label: 'Analysis'     },
  { href: '/meal-planner', label: 'Meal Planner' },
  { href: '/deals',        label: 'Deals'        },
]

export function Header() {
  const pathname = usePathname()

  return (
    <header
      className="sticky top-0 z-50 flex items-center h-[62px] px-6 border-b"
      style={{
        background: 'var(--header-bg)',
        borderColor: 'var(--header-border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 min-w-[190px]">
        <div
          className="w-[33px] h-[33px] rounded-[9px] flex items-center justify-center text-[15px] border flex-shrink-0"
          style={{
            background: 'var(--logo-icon-bg, rgba(255,255,255,0.1))',
            borderColor: 'var(--logo-icon-border, rgba(255,255,255,0.15))',
          }}
        >
          🛒
        </div>
        <div>
          <div
            className="text-[15.5px] font-bold leading-[1.15] tracking-tight"
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--logo-color, #FAF7F1)',
            }}
          >
            AH Tracker
          </div>
          <div
            className="text-[9.5px] uppercase tracking-[0.09em] leading-none mt-0.5"
            style={{
              fontFamily: 'var(--font-mono)',
              color: 'var(--logo-sub, rgba(250,247,241,0.45))',
            }}
          >
            Beverhof · Beverwijk
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex justify-center gap-0.5">
        {NAV.map(({ href, label }) => {
          const active = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'px-3 py-[7px] rounded-[var(--radius-sm)] text-[12.5px] font-semibold transition-all duration-150',
                active
                  ? 'nav-active'
                  : 'nav-inactive hover:opacity-70'
              )}
              style={active ? {
                background: 'var(--nav-active-bg, rgba(255,255,255,0.12))',
                color: 'var(--nav-active-text, #FAF7F1)',
              } : {
                color: 'var(--nav-text, rgba(255,255,255,0.42))',
              }}
            >
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Right side */}
      <div className="flex items-center justify-end gap-3 min-w-[190px]">
        <WeekChip />
        <ThemeToggle />
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
    <div
      className="px-2.5 py-1 rounded-full text-[10.5px] font-semibold border"
      style={{
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.05em',
        background: 'var(--week-chip-bg, rgba(255,255,255,0.1))',
        color: 'var(--week-chip-text, rgba(255,255,255,0.7))',
        borderColor: 'var(--logo-icon-border, rgba(255,255,255,0.15))',
      }}
    >
      W{weekNum} · {month} {year}
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
