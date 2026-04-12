import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { Header } from '@/components/layout/Header'

export const metadata: Metadata = {
  title: 'AH Tracker',
  description: 'Albert Heijn grocery spending tracker for Beverhof, Beverwijk',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
            <Header />
            <main className="max-w-[1280px] mx-auto px-6 py-6">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
