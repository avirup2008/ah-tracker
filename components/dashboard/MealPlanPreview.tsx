'use client'

import Link from 'next/link'
import { formatEuro } from '@/lib/utils'
import type { MealPlan } from '@/lib/db'

const DAYS = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday']
const DAY_SHORT: Record<string, string> = {
  Saturday: 'Sat', Sunday: 'Sun', Monday: 'Mon',
  Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri',
}

export function MealPlanPreview({ mealPlan }: { mealPlan: MealPlan | null }) {
  if (!mealPlan) {
    return (
      <div className="card p-5 flex flex-col gap-4">
        <div className="card-label">Meal Plan — This Week</div>
        <div
          className="flex items-center gap-3 rounded-[var(--radius-sm)] p-3.5"
          style={{
            background: 'var(--surface2)',
            border: '1.5px dashed var(--border2)',
          }}
        >
          <span style={{ fontSize: 18 }}>🍽️</span>
          <p style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-body)', flex: 1, lineHeight: 1.4 }}>
            No meal plan yet. Let AI suggest budget-friendly Indian &amp; European meals
            with an AH shopping list.
          </p>
          <Link
            href="/meal-planner"
            style={{
              padding: '7px 13px',
              borderRadius: 100,
              fontSize: 11.5,
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              background: 'var(--primary)',
              color: 'var(--bg)',
              whiteSpace: 'nowrap',
              textDecoration: 'none',
            }}
          >
            Plan Week →
          </Link>
        </div>
      </div>
    )
  }

  const { lunches, dinners } = mealPlan.meals_json
  // Show dinners in day order
  const orderedDinners = DAYS.map(day =>
    dinners.find(d => d.day === day)
  ).filter(Boolean)

  const totalCost = mealPlan.estimated_cost ?? 0

  return (
    <div className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="card-label" style={{ marginBottom: 0 }}>Meal Plan — This Week</div>
        <Link
          href="/meal-planner"
          style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}
        >
          Full plan →
        </Link>
      </div>

      {/* CTA if needed */}
      <div
        className="flex items-center gap-3 rounded-[var(--radius-sm)] p-3"
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
      >
        <span style={{ fontSize: 16 }}>🍽️</span>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)', flex: 1, lineHeight: 1.4 }}>
          AI-generated plan · {lunches.length} lunches + {dinners.length} dinners
        </p>
        <Link
          href="/meal-planner"
          style={{
            padding: '6px 12px', borderRadius: 100, fontSize: 11, fontWeight: 600,
            fontFamily: 'var(--font-body)', background: 'var(--primary)',
            color: 'var(--bg)', whiteSpace: 'nowrap', textDecoration: 'none',
          }}
        >
          View list →
        </Link>
      </div>

      {/* Dinners preview */}
      <div className="flex flex-col">
        {orderedDinners.slice(0, 5).map((meal) => meal && (
          <div
            key={meal.day}
            className="flex items-center gap-2.5 py-2"
            style={{ borderBottom: '1px solid var(--border)' }}
          >
            <span className="mono" style={{ width: 28, fontSize: 9.5, fontWeight: 600, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
              {DAY_SHORT[meal.day]}
            </span>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
              {meal.name}
            </span>
            {meal.meal_prep_friendly && (
              <span style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 100, fontWeight: 600,
                background: 'var(--accent-dim)', color: 'var(--accent)',
                border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                fontFamily: 'var(--font-body)',
              }}>
                meal-prep
              </span>
            )}
            <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flexShrink: 0 }}>
              {formatEuro(meal.estimated_cost)}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="flex justify-between pt-1" style={{ borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
          Est. ingredients this week
        </span>
        <span className="mono" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
          {formatEuro(totalCost)}
        </span>
      </div>
    </div>
  )
}
