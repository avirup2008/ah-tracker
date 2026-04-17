import { NextResponse } from 'next/server'
import sql from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const now = new Date()
    const yr = now.getFullYear()
    const mo = now.getMonth() + 1
    const today = now.getDate()
    const daysInMonth = new Date(yr, mo, 0).getDate()
    const WEEKLY = 90
    const MONTHLY = Math.round(WEEKLY * 4.33 * 100) / 100
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

    const [thisMonth, lastMonth, allMonths, weekly8, topItems, bonusData] = await Promise.all([
      sql`SELECT COALESCE(SUM(net_grocery_spend),0) AS spend,
                 COALESCE(SUM(bonus_savings),0) AS savings,
                 COUNT(*) AS trips
          FROM receipts WHERE parsed=true AND year=${yr} AND month=${mo}`,
      sql`SELECT COALESCE(SUM(net_grocery_spend),0) AS spend,
                 COALESCE(SUM(bonus_savings),0) AS savings,
                 COUNT(*) AS trips
          FROM receipts WHERE parsed=true
            AND year=${mo===1?yr-1:yr} AND month=${mo===1?12:mo-1}`,
      sql`SELECT year, month,
                 ROUND(SUM(net_grocery_spend)::numeric,2) AS spend,
                 ROUND(SUM(bonus_savings)::numeric,2) AS savings,
                 COUNT(*) AS trips
          FROM receipts WHERE parsed=true
          GROUP BY year, month ORDER BY year, month`,
      sql`SELECT TO_CHAR(week_saturday,'YYYY-MM-DD') AS week,
                 ROUND(SUM(net_grocery_spend)::numeric,2) AS spend,
                 COUNT(*) AS trips
          FROM receipts WHERE parsed=true
          GROUP BY week_saturday ORDER BY week_saturday DESC LIMIT 8`,
      sql`SELECT raw_name, COUNT(DISTINCT receipt_id) AS times,
                 ROUND(AVG(unit_price)::numeric,2) AS avg_price
          FROM receipt_items
          WHERE raw_name NOT IN ('SUBTOTAAL','KOOPZEGELS')
            AND is_statiegeld=false AND is_koopzegel=false
          GROUP BY raw_name HAVING COUNT(DISTINCT receipt_id)>=5
          ORDER BY times DESC LIMIT 8`,
      sql`SELECT COUNT(*) AS count,
                 ROUND(SUM(total_price)::numeric,2) AS total
          FROM receipt_items WHERE is_bonus_item=true`,
    ])

    const spent     = Number(thisMonth[0]?.spend   ?? 0)
    const savings   = Number(thisMonth[0]?.savings  ?? 0)
    const trips     = Number(thisMonth[0]?.trips    ?? 0)
    const lastSpend = Number(lastMonth[0]?.spend    ?? 0)
    const projected = today > 0 ? Math.round((spent/today)*daysInMonth*100)/100 : 0
    const dayRate   = today > 0 ? Math.round((spent/today)*100)/100 : 0
    const bonusTotal= Number(bonusData[0]?.total    ?? 0)

    const history = (allMonths as Record<string,unknown>[]).map(r => ({
      label: `${MONTHS[Number(r.month)-1]} ${r.year}`,
      spend: Number(r.spend),
      savings: Number(r.savings),
      trips: Number(r.trips),
    }))
    const avgMonthly = history.length
      ? Math.round(history.reduce((s,m)=>s+m.spend,0)/history.length*100)/100 : 0
    const highMonths = history.filter(m=>m.spend>MONTHLY).length

    const weeks = (weekly8 as Record<string,unknown>[]).map(w => ({
      week: String(w.week), spend: Number(w.spend), trips: Number(w.trips),
    }))
    const avgWeekly = weeks.length
      ? Math.round(weeks.reduce((s,w)=>s+w.spend,0)/weeks.length*100)/100 : 0

    const topList = (topItems as Record<string,unknown>[])
      .map(i=>`${i.raw_name} (${i.times}x, avg €${Number(i.avg_price).toFixed(2)})`)
      .join(', ')

    const moChange = lastSpend > 0
      ? ((spent - lastSpend) / lastSpend * 100).toFixed(0) : 'N/A'

    const prompt = `You are a personal finance analyst reviewing grocery spending for a household in Beverwijk, Netherlands. Be direct and use exact numbers from the data. No generic advice.

THIS MONTH (${MONTHS[mo-1]} ${yr}, day ${today} of ${daysInMonth}):
- Spent: €${spent.toFixed(2)} | Daily rate: €${dayRate}/day | Projected: €${projected.toFixed(2)}
- Monthly target: €${MONTHLY.toFixed(2)} | Status: ${projected>MONTHLY?`€${(projected-MONTHLY).toFixed(2)} OVER target`:`€${(MONTHLY-projected).toFixed(2)} under target`}
- vs ${MONTHS[mo===1?11:mo-2]}: €${lastSpend.toFixed(2)} (${moChange}% change)
- Bonus savings: €${savings.toFixed(2)} | Trips: ${trips}

RECENT 8 WEEKS (newest first):
${weeks.map(w=>`  ${w.week}: €${w.spend.toFixed(2)} (${w.trips} trips)`).join('\n')}
Target: €${WEEKLY}/week | 8-week avg: €${avgWeekly}

FULL MONTHLY HISTORY:
${history.map(m=>`  ${m.label}: €${m.spend.toFixed(2)} (savings €${m.savings.toFixed(2)}, ${m.trips} trips)`).join('\n')}
Monthly avg: €${avgMonthly} | Months over target: ${highMonths}/${history.length} | Total bonus savings: €${bonusTotal.toFixed(2)}

MOST PURCHASED ITEMS: ${topList}

Write exactly 4 sections. Use bold headers. Be specific with numbers. 2-3 sentences each.

**This Month**
How is this month tracking? On target or not, and by how much? Factor in the projection.

**Recent Weeks**
What does the 8-week pattern look like? Any spikes or consistent over/underspend?

**What Stands Out**
One or two notable patterns from the full history — highest months, seasonal trends, bonus performance.

**Recommendations**
Three numbered, specific actions based on what the data actually shows. Reference real items or months.`

    return NextResponse.json({
      prompt,
      context: { spent, projected, savings, trips, lastSpend, dayRate, avgMonthly, avgWeekly, highMonths, bonusTotal, MONTHLY, WEEKLY, monthName: MONTHS[mo-1], yr }
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
