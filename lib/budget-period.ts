const MS_PER_DAY = 24 * 60 * 60 * 1000

export type BudgetPeriod = {
  start: Date
  end: Date
  startDate: string
  endDate: string
  previousStartDate: string
  previousEndDate: string
  totalDays: number
  elapsedDays: number
  remainingDays: number
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function diffDays(end: Date, start: Date) {
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
}

export function getBudgetPeriod(now = new Date()): BudgetPeriod {
  const today = startOfLocalDay(now)
  const startsThisCalendarMonth = today.getDate() >= 25
  const start = startsThisCalendarMonth
    ? new Date(today.getFullYear(), today.getMonth(), 25)
    : new Date(today.getFullYear(), today.getMonth() - 1, 25)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25)
  const previousStart = new Date(start.getFullYear(), start.getMonth() - 1, 25)

  const totalDays = diffDays(end, start)
  const elapsedDays = Math.min(totalDays, Math.max(1, diffDays(today, start) + 1))

  return {
    start,
    end,
    startDate: formatDateKey(start),
    endDate: formatDateKey(end),
    previousStartDate: formatDateKey(previousStart),
    previousEndDate: formatDateKey(start),
    totalDays,
    elapsedDays,
    remainingDays: Math.max(0, totalDays - elapsedDays),
  }
}
