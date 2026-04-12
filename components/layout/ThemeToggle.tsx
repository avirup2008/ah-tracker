'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-[72px] h-[22px]" />

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex items-center gap-1.5 cursor-pointer group"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle light/dark mode"
    >
      <span
        className="text-[13px] leading-none transition-opacity duration-200"
        style={{ opacity: isDark ? 0.35 : 1 }}
      >
        ☀️
      </span>

      {/* Track */}
      <div
        className="relative w-[40px] h-[22px] rounded-full border transition-all duration-300"
        style={{
          background: isDark ? '#1F2438' : '#E4D9C8',
          borderColor: isDark ? 'rgba(255,181,71,0.2)' : '#D4C5AE',
        }}
      >
        {/* Knob */}
        <div
          className="absolute top-[3px] w-[14px] h-[14px] rounded-full transition-all duration-300"
          style={{
            left: isDark ? '23px' : '3px',
            background: isDark ? '#FFB547' : '#132C53',
            boxShadow: isDark ? '0 0 6px rgba(255,181,71,0.4)' : 'none',
          }}
        />
      </div>

      <span
        className="text-[13px] leading-none transition-opacity duration-200"
        style={{ opacity: isDark ? 1 : 0.35 }}
      >
        🌙
      </span>
    </button>
  )
}
