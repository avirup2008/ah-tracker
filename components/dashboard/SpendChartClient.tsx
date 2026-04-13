'use client'

import dynamic from 'next/dynamic'
import { CardSkeleton } from '@/components/ui/Skeletons'

// Recharts requires browser APIs — must be client-only
const SpendChartInner = dynamic(
  () => import('@/components/dashboard/SpendChart').then(m => ({ default: m.SpendChart })),
  { ssr: false, loading: () => <CardSkeleton /> }
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SpendChartClient({ data, weekBudget }: { data: any[]; weekBudget: number }) {
  return <SpendChartInner data={data} weekBudget={weekBudget} />
}
