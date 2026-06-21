'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { CookbookRecipe, RecipeCategory } from '@/lib/types'

const CATEGORIES: RecipeCategory[] = ['breakfast', 'lunch', 'dinner', 'snack']

const CATEGORY_COLORS: Record<RecipeCategory, string> = {
  breakfast: 'bg-yellow-400/30 text-yellow-100',
  lunch:     'bg-sky-400/30 text-sky-100',
  dinner:    'bg-indigo-400/30 text-indigo-100',
  snack:     'bg-orange-400/30 text-orange-100',
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

const EMPTY_FORM = {
  name: '',
  category: 'dinner' as RecipeCategory,
  tried: false,
  ingredients: '',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  notes: '',
}

export default function CookbookWidget() {
  const [recipes, setRecipes] = useState<CookbookRecipe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<RecipeCategory | 'all'>('all')
  const [untriedOnly, setUntriedOnly] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [logging, setLogging] = useState<string | null>(null) // recipe id currently being logged

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('cookbook_recipes')
      .select('*')
      .order('created_at', { ascending: false })
    setRecipes((data ?? []) as CookbookRecipe[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addRecipe = async () => {
    if (!form.name.trim()) return
    await supabase.from('cookbook_recipes').insert({
      name: form.name.trim(),
      category: form.category,
      tried: form.tried,
      ingredients: form.ingredients.trim() || null,
      calories: parseInt(form.calories) || 0,
      protein: parseFloat(form.protein) || 0,
      carbs: parseFloat(form.carbs) || 0,
      fat: parseFloat(form.fat) || 0,
      notes: form.notes.trim() || null,
    })
    setAdding(false)
    setForm(EMPTY_FORM)
    load()
  }

  const toggleTried = async (r: CookbookRecipe) => {
    await supabase.from('cookbook_recipes').update({ tried: !r.tried }).eq('id', r.id)
    setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, tried: !x.tried } : x))
  }

  const deleteRecipe = async (id: string) => {
    await supabase.from('cookbook_recipes').delete().eq('id', id)
    if (expandedId === id) setExpandedId(null)
    load()
  }

  const logToNutrition = async (r: CookbookRecipe) => {
    setLogging(r.id)
    await supabase.from('nutrition_logs').insert({
      meal_name: r.name,
      calories: r.calories,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      date: getTodayStr(),
    })
    setLogging(null)
  }

  const filtered = recipes.filter(r => {
    if (untriedOnly && r.tried) return false
    if (catFilter !== 'all' && r.category !== catFilter) return false
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 bg-amber-600 text-white h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Cookbook</p>
          <p className="text-xs opacity-60">{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setAdding(p => !p); setExpandedId(null) }}
          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition"
        >
          {adding ? 'Cancel' : '+ Recipe'}
        </button>
      </div>

      {/* Add recipe form */}
      {adding && (
        <div className="bg-white/10 rounded-xl p-3 space-y-2 flex-shrink-0">
          <input
            autoFocus
            className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
            placeholder="Recipe name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <div className="flex gap-1">
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setForm(f => ({ ...f, category: c }))}
                className={`flex-1 text-xs py-1 rounded-lg capitalize transition
                  ${form.category === c ? 'bg-white/30 font-semibold' : 'bg-white/10 hover:bg-white/20'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <textarea
            className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none resize-none"
            rows={3}
            placeholder="Ingredients (one per line or freetext)"
            value={form.ingredients}
            onChange={e => setForm(f => ({ ...f, ingredients: e.target.value }))}
          />
          <div className="grid grid-cols-4 gap-1.5">
            {(['calories', 'protein', 'carbs', 'fat'] as const).map(field => (
              <input
                key={field}
                type="number"
                min="0"
                className="bg-white/20 rounded-lg px-2 py-1.5 text-xs text-center placeholder-white/50 outline-none"
                placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                value={form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              />
            ))}
          </div>
          <textarea
            className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none resize-none"
            rows={2}
            placeholder="Notes / method (optional)"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-white"
                checked={form.tried}
                onChange={e => setForm(f => ({ ...f, tried: e.target.checked }))}
              />
              Already tried this
            </label>
            <button
              onClick={addRecipe}
              className="bg-white text-amber-700 font-semibold text-sm px-4 py-1.5 rounded-lg hover:bg-white/90 transition"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <input
        className="w-full bg-white/15 rounded-xl px-3 py-2 text-sm placeholder-white/50 outline-none flex-shrink-0"
        placeholder="Search recipes…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Filters */}
      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
        <button
          onClick={() => setCatFilter('all')}
          className={`text-xs px-3 py-1 rounded-full transition ${catFilter === 'all' ? 'bg-white text-amber-700 font-semibold' : 'bg-white/20 hover:bg-white/30'}`}
        >
          All
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCatFilter(c)}
            className={`text-xs px-3 py-1 rounded-full capitalize transition ${catFilter === c ? 'bg-white text-amber-700 font-semibold' : 'bg-white/20 hover:bg-white/30'}`}
          >
            {c}
          </button>
        ))}
        <button
          onClick={() => setUntriedOnly(p => !p)}
          className={`text-xs px-3 py-1 rounded-full transition ml-auto ${untriedOnly ? 'bg-white text-amber-700 font-semibold' : 'bg-white/15 hover:bg-white/25'}`}
        >
          Untried only
        </button>
      </div>

      {/* Recipe list */}
      {loading ? (
        <div className="space-y-2 flex-1">
          {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-12 bg-white/20 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm opacity-60">
          {recipes.length === 0 ? 'No recipes yet. Add one above.' : 'No recipes match your filters.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-0.5">
          {filtered.map(r => {
            const expanded = expandedId === r.id
            return (
              <div
                key={r.id}
                className="bg-white/10 rounded-xl overflow-hidden group"
              >
                {/* Card header */}
                <div
                  className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer"
                  onClick={() => setExpandedId(expanded ? null : r.id)}
                >
                  {/* Tried toggle */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleTried(r) }}
                    title={r.tried ? 'Mark as untried' : 'Mark as tried'}
                    className={`w-5 h-5 rounded-full flex-shrink-0 border-2 border-white/50 flex items-center justify-center transition
                      ${r.tried ? 'bg-white/40' : 'hover:bg-white/20'}`}
                  >
                    {r.tried && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${r.tried ? 'opacity-60' : ''}`}>{r.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${CATEGORY_COLORS[r.category]}`}>
                        {r.category}
                      </span>
                      {r.calories > 0 && (
                        <span className="text-[10px] opacity-50">{r.calories} kcal</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs opacity-40 group-hover:opacity-70 transition">{expanded ? '▲' : '▼'}</span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteRecipe(r.id) }}
                      className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-sm transition"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Expanded content */}
                {expanded && (
                  <div className="px-3 pb-3 space-y-2.5 border-t border-white/10 pt-2.5">
                    {/* Macros */}
                    {(r.calories > 0 || r.protein > 0 || r.carbs > 0 || r.fat > 0) && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { label: 'Cal', value: r.calories, unit: 'kcal' },
                          { label: 'Protein', value: r.protein, unit: 'g' },
                          { label: 'Carbs', value: r.carbs, unit: 'g' },
                          { label: 'Fat', value: r.fat, unit: 'g' },
                        ].map(({ label, value, unit }) => (
                          <div key={label} className="bg-white/10 rounded-lg p-2 text-center">
                            <p className="text-[10px] opacity-60">{label}</p>
                            <p className="text-sm font-semibold">{value}</p>
                            <p className="text-[9px] opacity-40">{unit}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ingredients */}
                    {r.ingredients && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60 mb-1">Ingredients</p>
                        <p className="text-xs opacity-80 whitespace-pre-line leading-relaxed">{r.ingredients}</p>
                      </div>
                    )}

                    {/* Notes */}
                    {r.notes && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60 mb-1">Notes</p>
                        <p className="text-xs opacity-80 whitespace-pre-line leading-relaxed">{r.notes}</p>
                      </div>
                    )}

                    {/* Log to today button */}
                    <button
                      onClick={() => logToNutrition(r)}
                      disabled={logging === r.id}
                      className="w-full bg-white text-amber-700 font-semibold text-sm py-1.5 rounded-lg hover:bg-white/90 disabled:opacity-60 transition"
                    >
                      {logging === r.id ? 'Logging…' : 'Log to today'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
