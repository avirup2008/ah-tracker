import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'

export const metadata: Metadata = {
  title: 'AH Tracker',
  description: 'Albert Heijn grocery spending tracker for Beverhof, Beverwijk',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div className="app-shell min-h-screen">
            <div className="app-shell__backdrop" />
            <Header />
            {/* pb-20 on mobile clears the bottom nav bar */}
            <main className="page-frame max-w-[1380px] mx-auto px-4 py-5 md:px-6 md:py-8 pb-24 md:pb-8">
              <div className="page-content">
                {children}
              </div>
            </main>
            <MobileNav />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
