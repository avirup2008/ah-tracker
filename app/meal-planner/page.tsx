'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { getCurrentWeekSaturday, formatEuro, formatWeekRange } from '@/lib/utils'
import type { MealPlan, MealPlanData, Meal, ShoppingListItem } from '@/lib/db'

type View = 'plan' | 'shopping'

const DAYS = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday']

export default function MealPlannerPage() {
  const weekSat = format(getCurrentWeekSaturday(), 'yyyy-MM-dd')
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)
  const [userMeals, setUserMeals]   = useState('')
  const [lunchCount, setLunchCount] = useState(7)
  const [dinnerCount, setDinnerCount] = useState(7)
  const [view, setView] = useState<View>('plan')
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null)
  const [mealType, setMealType] = useState<'lunch' | 'dinner'>('dinner')
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch(`/api/meal-plan?week=${weekSat}`)
      .then(r => r.json())
      .then(data => {
        setMealPlan(data)
        if (data?.meals_json) {
          setLunchCount(data.meals_json.lunches?.length ?? 0)
          setDinnerCount(data.meals_json.dinners?.length ?? 0)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [weekSat])

  const generate = async (regenerate = false) => {
    setGenerating(true)
    setStatus('Generating your meal plan with AI...')
    try {
      const res = await fetch('/api/meal-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekSaturday: weekSat,
          userMeals: userMeals || undefined,
          lunchCount,
          dinnerCount,
          regenerate,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      setMealPlan(data)
      setStatus('✅ Meal plan ready!')
    } catch (err) {
      setStatus(err instanceof Error ? `❌ ${err.message}` : '❌ Generation failed — try again')
    } finally {
      setGenerating(false)
    }
  }

  const meals = mealPlan?.meals_json as MealPlanData | undefined
  const shoppingList = mealPlan?.shopping_list as ShoppingListItem[] | undefined

  const orderedMeals = (type: 'lunches' | 'dinners') =>
    DAYS.map(day => meals?.[type]?.find(m => m.day === day)).filter(Boolean) as Meal[]

  return (
    <div className="flex flex-col gap-5">

      {/* Header row */}
      <div className="card p-5 flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
            Meal Planner
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, fontFamily: 'var(--font-body)' }}>
            Week of {formatWeekRange(weekSat)} · Indian &amp; European · Meal-prep Sunday
          </p>
        </div>
        {mealPlan && (
          <div className="flex gap-2">
            <TabBtn active={view === 'plan'}     onClick={() => setView('plan')}>🍽️ Meal Plan</TabBtn>
            <TabBtn active={view === 'shopping'} onClick={() => setView('shopping')}>🛒 Shopping List</TabBtn>
          </div>
        )}
      </div>

      {/* Generate prompt */}
      {!mealPlan && !loading && (
        <div className="card p-6 flex flex-col gap-4">
          <div className="card-label">Generate This Week&apos;s Plan</div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.6 }}>
            AI will create exactly the number of lunches and dinners you request using AH ingredients,
            mixed Indian &amp; European cuisine, optimised for Sunday meal prep.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <CountInput label="Lunches" value={lunchCount} onChange={setLunchCount} />
            <CountInput label="Dinners" value={dinnerCount} onChange={setDinnerCount} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Any specific meals you want this week? (optional)
            </label>
            <textarea
              value={userMeals}
              onChange={e => setUserMeals(e.target.value)}
              placeholder="e.g. 0 lunches, 3 dinners. Chicken tikka masala once, one vegetarian pasta dinner."
              rows={3}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', background: 'var(--surface2)',
                color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 13,
                resize: 'vertical', outline: 'none',
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => generate(false)}
              disabled={generating}
              style={{
                padding: '11px 28px', borderRadius: 100, border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
                background: generating ? 'var(--surface3)' : 'var(--primary)', color: generating ? 'var(--text-4)' : 'var(--bg)',
                fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-body)', transition: 'all 0.2s',
              }}
            >
              {generating ? 'Generating...' : '✨ Generate AI Meal Plan'}
            </button>
            {!generating && (
              <p style={{ fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)' }}>
                Requesting {lunchCount} lunch{lunchCount !== 1 ? 'es' : ''} and {dinnerCount} dinner{dinnerCount !== 1 ? 's' : ''}.
              </p>
            )}
            {status && <p style={{ fontSize: 12.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>{status}</p>}
          </div>
        </div>
      )}

      {loading && <div className="card p-10" style={{ textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>Loading meal plan...</div>}

      {/* ── PLAN VIEW ─────────────────────────────────────────── */}
      {mealPlan && view === 'plan' && meals && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">

          {/* Day-by-day grid */}
          <div className="flex flex-col gap-4">

            {/* Meal type toggle */}
            <div className="flex gap-2">
              <TabBtn active={mealType === 'lunch'}  onClick={() => setMealType('lunch')}>☀️ Lunches</TabBtn>
              <TabBtn active={mealType === 'dinner'} onClick={() => setMealType('dinner')}>🌙 Dinners</TabBtn>
            </div>

            {/* Meal cards */}
            {orderedMeals(mealType === 'lunch' ? 'lunches' : 'dinners').map(meal => (
              <div
                key={meal.day}
                className="card p-4 cursor-pointer"
                style={{ transition: 'border-color 0.15s', borderColor: selectedMeal?.day === meal.day && selectedMeal?.day === meal.day ? 'var(--accent)' : 'var(--border)' }}
                onClick={() => setSelectedMeal(selectedMeal?.day === meal.day ? null : meal)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {meal.day}
                    </span>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)', marginTop: 2 }}>{meal.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {meal.meal_prep_friendly && <Tag>meal-prep</Tag>}
                    <Tag color="neutral">{meal.cuisine}</Tag>
                    <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{formatEuro(meal.estimated_cost)}</span>
                  </div>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  {meal.ingredients?.slice(0, 5).map((ing, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'var(--surface2)', color: 'var(--text-3)', fontFamily: 'var(--font-body)', border: '1px solid var(--border)' }}>
                      {ing.ah_name}
                    </span>
                  ))}
                  {(meal.ingredients?.length ?? 0) > 5 && (
                    <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-body)', padding: '2px 0' }}>+{(meal.ingredients?.length ?? 0) - 5} more</span>
                  )}
                </div>

                {/* Expanded recipe */}
                {selectedMeal?.day === meal.day && (
                  <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="mono" style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ingredients</p>
                        {meal.ingredients?.map((ing, i) => (
                          <div key={i} className="flex justify-between py-1.5" style={{ borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                            <span style={{ color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>
                              {ing.ah_name}
                              <span style={{ color: 'var(--text-4)', marginLeft: 4 }}>({ing.english_name})</span>
                            </span>
                            <span className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                              <span style={{ color: 'var(--text-3)' }}>{ing.quantity}</span>
                              {ing.bonus_deal && <Tag>deal</Tag>}
                              <span className="mono" style={{ fontWeight: 600, color: 'var(--text)' }}>{formatEuro(ing.est_price)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <p className="mono" style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Recipe — {meal.prep_time_min} min</p>
                        {meal.recipe_steps?.map((step, i) => (
                          <div key={i} className="flex gap-3 mb-3">
                            <span className="mono flex-shrink-0" style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', width: 20, paddingTop: 1 }}>{i + 1}</span>
                            <p style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>{step}</p>
                          </div>
                        ))}
                        {meal.tip && (
                          <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-dim)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' }}>
                            <p style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>💡 {meal.tip}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Sidebar — totals + regenerate */}
          <div className="flex flex-col gap-4">
            <div className="card p-5">
              <div className="card-label">Week Summary</div>
              <div className="flex flex-col gap-3 mt-2">
                <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>Total lunches</span>
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{meals.lunches?.length ?? 0}</span>
                </div>
                <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>Total dinners</span>
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{meals.dinners?.length ?? 0}</span>
                </div>
                <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>Meal-prep friendly</span>
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--good)' }}>
                    {[...(meals.lunches ?? []), ...(meals.dinners ?? [])].filter(m => m.meal_prep_friendly).length}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>Est. ingredient cost</span>
                  <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{formatEuro(mealPlan.estimated_cost)}</span>
                </div>
              </div>
            </div>

            {/* Regenerate */}
            <div className="card p-5 flex flex-col gap-3">
              <div className="card-label">Adjust Plan</div>
              <div className="grid grid-cols-2 gap-3">
                <CountInput label="Lunches" value={lunchCount} onChange={setLunchCount} compact />
                <CountInput label="Dinners" value={dinnerCount} onChange={setDinnerCount} compact />
              </div>
              <textarea
                value={userMeals}
                onChange={e => setUserMeals(e.target.value)}
                placeholder="Want specific meals? Describe them here..."
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 12, resize: 'vertical', outline: 'none' }}
              />
              <button
                onClick={() => generate(true)}
                disabled={generating}
                style={{ padding: '9px 0', borderRadius: 100, border: 'none', cursor: 'pointer', background: 'var(--primary)', color: 'var(--bg)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', width: '100%' }}
              >
                {generating ? 'Generating...' : '↻ Regenerate Plan'}
              </button>
              {status && <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>{status}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── SHOPPING LIST VIEW ────────────────────────────────── */}
      {mealPlan && view === 'shopping' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(shoppingList ?? []).map((section) => (
            <div key={section.category} className="card p-5">
              <div className="card-label">{section.category}</div>
              <div className="flex flex-col">
                {section.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>
                        {item.ah_name}
                        <span style={{ color: 'var(--text-4)', fontSize: 11, marginLeft: 5 }}>({item.english_name})</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1, fontFamily: 'var(--font-body)' }}>{item.quantity}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.bonus_deal && <Tag>Bonus</Tag>}
                      <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{formatEuro(item.est_price)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Total */}
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
            <div>
              <div className="card-label" style={{ marginBottom: 4 }}>Shopping List Total</div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>
                Estimated cost for all meal ingredients · Check AH Deals tab for active Bonuskaart offers
              </p>
            </div>
            <div className="mono" style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent)' }}>
              {formatEuro(mealPlan.estimated_cost)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TabBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px', borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
        fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
        background: active ? 'var(--primary-light)' : 'var(--surface2)',
        color: active ? 'var(--primary)' : 'var(--text-3)',
      }}
    >
      {children}
    </button>
  )
}

function CountInput({
  label,
  value,
  onChange,
  compact = false,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  compact?: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{
        fontSize: compact ? 10 : 11,
        color: 'var(--text-3)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
      <input
        type="number"
        min={0}
        max={7}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(7, Number(e.target.value) || 0)))}
        style={{
          width: '100%',
          padding: compact ? '9px 10px' : '11px 12px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background: 'var(--surface2)',
          color: 'var(--text)',
          fontFamily: 'var(--font-body)',
          fontSize: compact ? 12 : 13,
          outline: 'none',
        }}
      />
    </label>
  )
}

function Tag({ children, color = 'accent' }: { children: React.ReactNode; color?: 'accent' | 'neutral' }) {
  return (
    <span style={{
      fontSize: 9.5, padding: '2px 8px', borderRadius: 100, fontWeight: 600, fontFamily: 'var(--font-body)',
      background: color === 'accent' ? 'var(--accent-dim)' : 'var(--surface3)',
      color: color === 'accent' ? 'var(--accent)' : 'var(--text-3)',
      border: `1px solid ${color === 'accent' ? 'color-mix(in srgb, var(--accent) 20%, transparent)' : 'var(--border)'}`,
    }}>
      {children}
    </span>
  )
}
