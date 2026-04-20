'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { getCurrentWeekSaturday, formatEuro, formatWeekRange } from '@/lib/utils'
import type { MealPlan, MealPlanData, Meal, PantryItem, ShoppingListItem } from '@/lib/db'

type View = 'plan' | 'shopping'
type MealPrepPreference = 'high' | 'balanced' | 'minimal'
type CuisineMode = 'mixed' | 'indian' | 'european'

interface ProductInsight {
  name: string
  category: string | null
  purchase_count: number
  total_spend: number
  last_bought: string | null
}

interface PantryDraft {
  name: string
  quantity_note: string
  category: string
}

interface PlannerDefaultsPayload {
  lunch_count: number
  dinner_count: number
  servings: number
  max_prep_time: number
  vegetarian_days: number
  meal_prep_preference: MealPrepPreference
  cuisine_mode: CuisineMode
}

interface MealPlanReconciliation {
  week_saturday: string
  planned_items: number
  matched_items: number
  missing_items: number
  adherence_pct: number
  planned_estimated_cost: number
  matched_actual_spend: number
  impulse_spend: number
  matched: Array<{
    planned_name: string
    matched_name: string | null
    quantity?: string
    actual_spend?: number | null
  }>
  missing: Array<{
    planned_name: string
    quantity?: string
    est_price?: number | null
  }>
  unplanned: Array<{
    name: string
    category: string | null
    spend: number
    purchase_count: number
  }>
}

const DAYS = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday']

export default function MealPlannerPage() {
  const weekSat = format(getCurrentWeekSaturday(), 'yyyy-MM-dd')
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null)
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)
  const [userMeals, setUserMeals]   = useState('')
  const [lunchCount, setLunchCount] = useState(7)
  const [dinnerCount, setDinnerCount] = useState(7)
  const [servings, setServings] = useState(2)
  const [maxPrepTime, setMaxPrepTime] = useState(30)
  const [vegetarianDays, setVegetarianDays] = useState(1)
  const [mealPrepPreference, setMealPrepPreference] = useState<MealPrepPreference>('balanced')
  const [cuisineMode, setCuisineMode] = useState<CuisineMode>('mixed')
  const [view, setView] = useState<View>('plan')
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null)
  const [mealType, setMealType] = useState<'lunch' | 'dinner'>('dinner')
  const [status, setStatus] = useState('')
  const [products, setProducts] = useState<ProductInsight[]>([])
  const [reconciliation, setReconciliation] = useState<MealPlanReconciliation | null>(null)
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([])
  const [pantryDraft, setPantryDraft] = useState<PantryDraft>({ name: '', quantity_note: '', category: '' })
  const [pantrySaving, setPantrySaving] = useState(false)
  const [pantryMsg, setPantryMsg] = useState('')
  const [defaultsSaving, setDefaultsSaving] = useState(false)

  const applyPlannerDefaults = (defaults: PlannerDefaultsPayload) => {
    setLunchCount(defaults.lunch_count)
    setDinnerCount(defaults.dinner_count)
    setServings(defaults.servings)
    setMaxPrepTime(defaults.max_prep_time)
    setVegetarianDays(defaults.vegetarian_days)
    setMealPrepPreference(defaults.meal_prep_preference)
    setCuisineMode(defaults.cuisine_mode)
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/meal-plan?week=${weekSat}`).then(r => r.json()),
      fetch('/api/meal-plan/defaults').then(r => r.json()).catch(() => null),
    ])
      .then(([mealPlanData, defaults]) => {
        if (defaults && !defaults.error) {
          applyPlannerDefaults(defaults as PlannerDefaultsPayload)
        }

        setMealPlan(mealPlanData)
        if (mealPlanData?.meals_json) {
          setLunchCount(mealPlanData.meals_json.lunches?.length ?? 0)
          setDinnerCount(mealPlanData.meals_json.dinners?.length ?? 0)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [weekSat])

  useEffect(() => {
    if (!mealPlan) {
      setReconciliation(null)
      return
    }

    fetch(`/api/meal-plan/reconciliation?week=${weekSat}`)
      .then(r => r.json())
      .then(data => setReconciliation(data))
      .catch(() => setReconciliation(null))
  }, [mealPlan, weekSat])

  useEffect(() => {
    fetch('/api/product-intelligence?limit=8')
      .then(r => r.json())
      .then(data => setProducts(data.products ?? []))
      .catch(() => setProducts([]))
  }, [])

  const fetchPantry = async () => {
    const res = await fetch('/api/pantry')
    const data = await res.json()
    setPantryItems(data.items ?? [])
  }

  useEffect(() => {
    fetchPantry().catch(() => setPantryItems([]))
  }, [])

  useEffect(() => {
    setVegetarianDays((current) => Math.min(current, dinnerCount))
  }, [dinnerCount])

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
          servings,
          maxPrepTime,
          vegetarianDays,
          mealPrepPreference,
          cuisineMode,
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

  const saveWeeklyDefaults = async () => {
    setDefaultsSaving(true)
    setStatus('Saving weekly planner defaults...')
    try {
      const res = await fetch('/api/meal-plan/defaults', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lunch_count: lunchCount,
          dinner_count: dinnerCount,
          servings,
          max_prep_time: maxPrepTime,
          vegetarian_days: vegetarianDays,
          meal_prep_preference: mealPrepPreference,
          cuisine_mode: cuisineMode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save defaults')
      applyPlannerDefaults(data as PlannerDefaultsPayload)
      setStatus('✅ Weekly planner defaults saved for automations.')
    } catch (err) {
      setStatus(err instanceof Error ? `❌ ${err.message}` : '❌ Failed to save defaults')
    } finally {
      setDefaultsSaving(false)
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
            your saved pantry items, your frequent staples, and the structured constraints below.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <CountInput label="Lunches" value={lunchCount} onChange={setLunchCount} />
            <CountInput label="Dinners" value={dinnerCount} onChange={setDinnerCount} />
            <CountInput label="Servings" value={servings} onChange={setServings} max={8} />
            <CountInput label="Veg Dinners" value={vegetarianDays} onChange={setVegetarianDays} max={dinnerCount} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <CountInput label="Max Prep Min" value={maxPrepTime} onChange={setMaxPrepTime} min={10} max={90} />
            <SelectInput
              label="Cuisine"
              value={cuisineMode}
              onChange={(value) => setCuisineMode(value as CuisineMode)}
              options={[
                { value: 'mixed', label: 'Mixed' },
                { value: 'indian', label: 'Indian-leaning' },
                { value: 'european', label: 'European-leaning' },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <SelectInput
              label="Meal Prep"
              value={mealPrepPreference}
              onChange={(value) => setMealPrepPreference(value as MealPrepPreference)}
              options={[
                { value: 'balanced', label: 'Balanced' },
                { value: 'high', label: 'Batch-cook heavy' },
                { value: 'minimal', label: 'Fresh daily' },
              ]}
            />
          </div>
          <PantryPanel
            items={pantryItems}
            draft={pantryDraft}
            onDraftChange={setPantryDraft}
            onRefresh={() => fetchPantry()}
            saving={pantrySaving}
            message={pantryMsg}
            setSaving={setPantrySaving}
            setMessage={setPantryMsg}
          />
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
            <button
              onClick={saveWeeklyDefaults}
              disabled={defaultsSaving || generating}
              style={{
                padding: '11px 18px', borderRadius: 100, border: '1px solid var(--border)', cursor: defaultsSaving || generating ? 'not-allowed' : 'pointer',
                background: 'var(--surface2)', color: 'var(--text-2)',
                fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'all 0.2s',
              }}
            >
              {defaultsSaving ? 'Saving...' : 'Save as Weekly Default'}
            </button>
            {!generating && (
              <p style={{ fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)' }}>
                Requesting {lunchCount} lunch{lunchCount !== 1 ? 'es' : ''}, {dinnerCount} dinner{dinnerCount !== 1 ? 's' : ''}, {servings} serving{servings !== 1 ? 's' : ''}, and max {maxPrepTime} min prep.
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
            {reconciliation && reconciliation.planned_items > 0 && (
              <div className="card p-5">
                <div className="card-label">Plan Reconciliation</div>
                <p style={{ fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.5 }}>
                  Compared against purchases made in the same Saturday-to-Friday week.
                </p>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <MetricCard label="Adherence" value={`${reconciliation.adherence_pct}%`} tone={reconciliation.adherence_pct >= 60 ? 'good' : 'accent'} />
                  <MetricCard label="Matched" value={`${reconciliation.matched_items}/${reconciliation.planned_items}`} tone="neutral" />
                  <MetricCard label="Impulse Spend" value={formatEuro(reconciliation.impulse_spend)} tone={reconciliation.impulse_spend > 0 ? 'accent' : 'good'} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Missing planned items</div>
                    {reconciliation.missing.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--good)', fontFamily: 'var(--font-body)' }}>Everything planned was bought.</p>
                    ) : (
                      reconciliation.missing.slice(0, 6).map((item, index) => (
                        <div key={`${item.planned_name}-${index}`} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{item.planned_name}</span>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--text-4)' }}>{item.quantity ?? 'planned'}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Unplanned purchases</div>
                    {reconciliation.unplanned.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--good)', fontFamily: 'var(--font-body)' }}>No impulse purchases detected.</p>
                    ) : (
                      reconciliation.unplanned.slice(0, 6).map((item, index) => (
                        <div key={`${item.name}-${index}`} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{item.name}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)' }}>{item.category ?? 'Uncategorised'} · {item.purchase_count} trip{item.purchase_count !== 1 ? 's' : ''}</div>
                          </div>
                          <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)' }}>{formatEuro(item.spend)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

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
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>Servings target</span>
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{servings}</span>
                </div>
                <div className="flex justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'var(--font-body)' }}>Max prep time</span>
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{maxPrepTime} min</span>
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
                <CountInput label="Servings" value={servings} onChange={setServings} max={8} compact />
                <CountInput label="Veg Dinners" value={vegetarianDays} onChange={setVegetarianDays} max={dinnerCount} compact />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CountInput label="Max Prep Min" value={maxPrepTime} onChange={setMaxPrepTime} min={10} max={90} compact />
                <SelectInput
                  label="Cuisine"
                  value={cuisineMode}
                  onChange={(value) => setCuisineMode(value as CuisineMode)}
                  options={[
                    { value: 'mixed', label: 'Mixed' },
                    { value: 'indian', label: 'Indian' },
                    { value: 'european', label: 'European' },
                  ]}
                  compact
                />
              </div>
              <SelectInput
                label="Meal Prep"
                value={mealPrepPreference}
                onChange={(value) => setMealPrepPreference(value as MealPrepPreference)}
                options={[
                  { value: 'balanced', label: 'Balanced' },
                  { value: 'high', label: 'Batch-heavy' },
                  { value: 'minimal', label: 'Fresh' },
                ]}
                compact
              />
              <PantryPanel
                items={pantryItems}
                draft={pantryDraft}
                onDraftChange={setPantryDraft}
                onRefresh={() => fetchPantry()}
                saving={pantrySaving}
                message={pantryMsg}
                setSaving={setPantrySaving}
                setMessage={setPantryMsg}
                compact
              />
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
              <button
                onClick={saveWeeklyDefaults}
                disabled={defaultsSaving || generating}
                style={{
                  padding: '9px 0',
                  borderRadius: 100,
                  border: '1px solid var(--border)',
                  cursor: defaultsSaving || generating ? 'not-allowed' : 'pointer',
                  background: 'var(--surface2)',
                  color: 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                  width: '100%',
                }}
              >
                {defaultsSaving ? 'Saving...' : 'Save as Weekly Default'}
              </button>
              {status && <p style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-body)' }}>{status}</p>}
            </div>

            {products.length > 0 && (
              <div className="card p-5">
                <div className="card-label">Your Frequent Staples</div>
                <p style={{ fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)', marginTop: 4, lineHeight: 1.5 }}>
                  Meal generation now uses these as likely staples and reuse candidates.
                </p>
                <div className="flex flex-col gap-2 mt-3">
                  {products.slice(0, 6).map((product) => (
                    <div key={product.name} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 12.5, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{product.name}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)' }}>
                          {product.category ?? 'Uncategorised'} · {product.purchase_count} trips
                        </div>
                      </div>
                      <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>{formatEuro(product.total_spend)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
  min = 0,
  max = 7,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  compact?: boolean
  min?: number
  max?: number
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
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
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

function SelectInput({
  label,
  value,
  onChange,
  options,
  compact = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
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
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
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

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'good' | 'accent' | 'neutral'
}) {
  const color = tone === 'good' ? 'var(--good)' : tone === 'accent' ? 'var(--accent)' : 'var(--text)'
  return (
    <div className="card p-3" style={{ background: 'var(--surface2)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color, marginTop: 6 }}>{value}</div>
    </div>
  )
}

function PantryPanel({
  items,
  draft,
  onDraftChange,
  onRefresh,
  saving,
  message,
  setSaving,
  setMessage,
  compact = false,
}: {
  items: PantryItem[]
  draft: PantryDraft
  onDraftChange: (draft: PantryDraft) => void
  onRefresh: () => Promise<void> | void
  saving: boolean
  message: string
  setSaving: (value: boolean) => void
  setMessage: (value: string) => void
  compact?: boolean
}) {
  const saveItem = async () => {
    if (!draft.name.trim()) {
      setMessage('Pantry item name is required')
      return
    }

    setSaving(true)
    setMessage('Saving pantry item…')
    try {
      const res = await fetch('/api/pantry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save pantry item')
      onDraftChange({ name: '', quantity_note: '', category: '' })
      setMessage('✅ Pantry updated')
      await onRefresh()
    } catch (err) {
      setMessage(err instanceof Error ? `❌ ${err.message}` : '❌ Failed to save pantry item')
    } finally {
      setSaving(false)
    }
  }

  const removeItem = async (id: number) => {
    setSaving(true)
    setMessage('Removing pantry item…')
    try {
      const res = await fetch(`/api/pantry/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to remove pantry item')
      setMessage('✅ Pantry updated')
      await onRefresh()
    } catch (err) {
      setMessage(err instanceof Error ? `❌ ${err.message}` : '❌ Failed to remove pantry item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-4" style={compact ? { background: 'var(--surface2)' } : undefined}>
      <div className="card-label" style={{ marginBottom: 8 }}>Saved Pantry</div>
      <p style={{ fontSize: compact ? 11 : 11.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)', lineHeight: 1.45, marginBottom: 10 }}>
        Persist staples and leftovers here so planning can reuse what you already have.
      </p>
      <div className="grid grid-cols-1 gap-2">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
          placeholder="e.g. Basmati rice"
          style={{ width: '100%', padding: compact ? '9px 10px' : '11px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: compact ? 12 : 13, outline: 'none' }}
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={draft.quantity_note}
            onChange={(e) => onDraftChange({ ...draft, quantity_note: e.target.value })}
            placeholder="Quantity note"
            style={{ width: '100%', padding: compact ? '9px 10px' : '11px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: compact ? 12 : 13, outline: 'none' }}
          />
          <input
            type="text"
            value={draft.category}
            onChange={(e) => onDraftChange({ ...draft, category: e.target.value })}
            placeholder="Category"
            style={{ width: '100%', padding: compact ? '9px 10px' : '11px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: compact ? 12 : 13, outline: 'none' }}
          />
        </div>
        <button
          onClick={saveItem}
          disabled={saving}
          style={{ padding: compact ? '9px 0' : '10px 0', borderRadius: 100, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: 'var(--primary)', color: 'var(--bg)', fontSize: compact ? 12 : 13, fontWeight: 600, fontFamily: 'var(--font-body)' }}
        >
          {saving ? 'Saving…' : 'Add Pantry Item'}
        </button>
      </div>

      {message && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-body)', marginTop: 10 }}>{message}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {items.length === 0 ? (
          <p style={{ fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)' }}>No saved pantry items yet.</p>
        ) : (
          items.slice(0, compact ? 6 : 12).map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-[var(--radius-sm)] border p-2.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div>
                <div style={{ fontSize: compact ? 11.5 : 12.5, color: 'var(--text)', fontFamily: 'var(--font-body)' }}>{item.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-body)' }}>
                  {[item.quantity_note, item.category].filter(Boolean).join(' · ') || 'No extra details'}
                </div>
              </div>
              <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => removeItem(item.id)}>Remove</button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
