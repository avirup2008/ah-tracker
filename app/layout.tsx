import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'

export const metadata: Metadata = {
  title: 'AH Tracker',
  description: 'Albert Heijn grocery spending tracker for Beverhof, Beverwijk',
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
            <Header />
            {/* pb-20 on mobile clears the bottom nav bar */}
            <main className="max-w-[1280px] mx-auto px-4 py-4 md:px-6 md:py-6 pb-20 md:pb-6">
              {children}
            </main>
            <MobileNav />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
