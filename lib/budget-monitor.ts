import sql from './db'
import { MONTHLY_TARGET, WEEKLY_BUDGET } from './budget-constants'
import { getBudgetPeriod } from './budget-period'

export interface BudgetSnapshot {
  week_saturday: string | null
  week_spend: number
  week_receipts: number
  week_savings: number
  weekly_budget: number
  weekly_pct_used: number
  weekly_over_amount: number
  monthly_spend: number
  monthly_target: number
  projected_month_end: number
  projected_delta: number
  on_track: boolean
  remaining_days: number
  daily_budget_remaining: number
  recent_week_average: number
  recent_over_budget_weeks: number
  budget_period_start: string
  budget_period_end: string
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export async function getBudgetSnapshot(now = new Date()): Promise<BudgetSnapshot> {
  const period = getBudgetPeriod(now)

  const [currentWeekRows, monthRows, recentWeeks] = await Promise.all([
    sql`
      SELECT
        TO_CHAR(week_saturday, 'YYYY-MM-DD') AS week_saturday,
        COUNT(*) AS receipt_count,
        COALESCE(SUM(net_grocery_spend), 0) AS total_spend,
        COALESCE(SUM(bonus_savings), 0) AS total_savings
      FROM receipts
      WHERE parsed = true
        AND week_saturday = (
          SELECT week_saturday
          FROM receipts
          WHERE parsed = true
          ORDER BY receipt_date DESC
          LIMIT 1
        )
      GROUP BY week_saturday
    `,
    sql`
      SELECT COALESCE(SUM(net_grocery_spend), 0) AS total_spend
      FROM receipts
      WHERE parsed = true
        AND receipt_date >= ${period.startDate}::date
        AND receipt_date < ${period.endDate}::date
    `,
    sql`
      SELECT
        TO_CHAR(week_saturday, 'YYYY-MM-DD') AS week_saturday,
        ROUND(SUM(net_grocery_spend)::numeric, 2) AS total_spend
      FROM receipts
      WHERE parsed = true
      GROUP BY week_saturday
      ORDER BY week_saturday DESC
      LIMIT 8
    `,
  ])

  const currentWeek = currentWeekRows[0] as Record<string, unknown> | undefined
  const weekSpend = Number(currentWeek?.total_spend ?? 0)
  const weekSavings = Number(currentWeek?.total_savings ?? 0)
  const weekReceipts = Number(currentWeek?.receipt_count ?? 0)
  const monthSpend = Number(monthRows[0]?.total_spend ?? 0)
  const projectedMonthEnd = period.elapsedDays > 0 ? roundMoney((monthSpend / period.elapsedDays) * period.totalDays) : 0
  const weeklyPctUsed = Math.round((weekSpend / WEEKLY_BUDGET) * 100)
  const weeklyOverAmount = Math.max(0, roundMoney(weekSpend - WEEKLY_BUDGET))
  const remainingDays = period.remainingDays
  const dailyBudgetRemaining = remainingDays > 0
    ? Math.max(0, roundMoney((MONTHLY_TARGET - monthSpend) / remainingDays))
    : 0

  const recentWeekSpends = recentWeeks.map((row: Record<string, unknown>) => Number(row.total_spend ?? 0))
  const recentWeekAverage = recentWeekSpends.length > 0
    ? roundMoney(recentWeekSpends.reduce((sum, spend) => sum + spend, 0) / recentWeekSpends.length)
    : 0
  const recentOverBudgetWeeks = recentWeekSpends.filter((spend) => spend > WEEKLY_BUDGET).length

  return {
    week_saturday: currentWeek?.week_saturday ? String(currentWeek.week_saturday) : null,
    week_spend: weekSpend,
    week_receipts: weekReceipts,
    week_savings: weekSavings,
    weekly_budget: WEEKLY_BUDGET,
    weekly_pct_used: weeklyPctUsed,
    weekly_over_amount: weeklyOverAmount,
    monthly_spend: monthSpend,
    monthly_target: MONTHLY_TARGET,
    projected_month_end: projectedMonthEnd,
    projected_delta: roundMoney(projectedMonthEnd - MONTHLY_TARGET),
    on_track: projectedMonthEnd <= MONTHLY_TARGET,
    remaining_days: remainingDays,
    daily_budget_remaining: dailyBudgetRemaining,
    recent_week_average: recentWeekAverage,
    recent_over_budget_weeks: recentOverBudgetWeeks,
    budget_period_start: period.startDate,
    budget_period_end: period.endDate,
  }
}
