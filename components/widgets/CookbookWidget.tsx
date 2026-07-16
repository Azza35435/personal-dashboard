'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { firstSharedGroup } from '@/lib/groups'
import type { CookbookRecipe, RecipeCategory } from '@/lib/types'

const CATEGORIES: RecipeCategory[] = ['breakfast', 'lunch', 'dinner', 'snack']

const CATEGORY_COLORS: Record<RecipeCategory, string> = {
  breakfast: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  lunch:     'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  dinner:    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  snack:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
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
    // stamp the household group (if one shares the cookbook) so members see it
    const groupId = await firstSharedGroup('cookbook')
    await supabase.from('cookbook_recipes').insert({
      group_id: groupId,
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
    <div className="rounded p-5 flex flex-col gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-amber-400 shadow-sm text-gray-900 dark:text-gray-100 h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Cookbook</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setAdding(p => !p); setExpandedId(null) }}
          className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 transition"
        >
          {adding ? 'Cancel' : '+ Recipe'}
        </button>
      </div>

      {/* Add recipe form */}
      {adding && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-2 flex-shrink-0 border border-gray-200 dark:border-gray-700">
          <input
            autoFocus
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
            placeholder="Recipe name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <div className="flex gap-1">
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => setForm(f => ({ ...f, category: c }))}
                className={`flex-1 text-xs py-1 rounded capitalize transition border ${
                  form.category === c
                    ? 'bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-gray-500 font-semibold'
                    : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <textarea
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none resize-none text-gray-900 dark:text-gray-100"
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
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-xs text-center placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                value={form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              />
            ))}
          </div>
          <textarea
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none resize-none text-gray-900 dark:text-gray-100"
            rows={2}
            placeholder="Notes / method (optional)"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                className="w-3.5 h-3.5"
                checked={form.tried}
                onChange={e => setForm(f => ({ ...f, tried: e.target.checked }))}
              />
              Already tried this
            </label>
            <button
              onClick={addRecipe}
              className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm px-4 py-1.5 rounded transition"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <input
        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 text-sm placeholder-gray-400 outline-none flex-shrink-0 text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
        placeholder="Search recipes…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Filters */}
      <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
        <button
          onClick={() => setCatFilter('all')}
          className={`text-xs px-3 py-1 rounded transition border ${catFilter === 'all' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white font-medium' : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          All
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c}
            onClick={() => setCatFilter(c)}
            className={`text-xs px-3 py-1 rounded capitalize transition border ${catFilter === c ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white font-medium' : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
          >
            {c}
          </button>
        ))}
        <button
          onClick={() => setUntriedOnly(p => !p)}
          className={`text-xs px-3 py-1 rounded transition ml-auto border ${untriedOnly ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white font-medium' : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
        >
          Untried only
        </button>
      </div>

      {/* Recipe list */}
      {loading ? (
        <div className="space-y-2 flex-1">
          {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-12 bg-gray-200 dark:bg-gray-700 rounded" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400">
          {recipes.length === 0 ? 'No recipes yet. Add one above.' : 'No recipes match your filters.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto flex-1 pr-0.5">
          {filtered.map(r => {
            const expanded = expandedId === r.id
            return (
              <div
                key={r.id}
                className="bg-gray-50 dark:bg-gray-800 rounded overflow-hidden group border border-gray-100 dark:border-gray-700"
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
                    className={`w-5 h-5 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition ${
                      r.tried
                        ? 'border-gray-400 bg-gray-200 dark:bg-gray-600 dark:border-gray-500'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {r.tried && <span className="text-gray-600 dark:text-gray-300 text-[10px] font-bold leading-none">✓</span>}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${r.tried ? 'text-gray-400 dark:text-gray-500' : ''}`}>{r.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${CATEGORY_COLORS[r.category]}`}>
                        {r.category}
                      </span>
                      {r.calories > 0 && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{r.calories} kcal</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition">{expanded ? '▲' : '▼'}</span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteRecipe(r.id) }}
                      className="opacity-0 group-hover:opacity-40 hover:!opacity-80 text-gray-500 text-sm transition"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Expanded content */}
                {expanded && (
                  <div className="px-3 pb-3 space-y-2.5 border-t border-gray-200 dark:border-gray-700 pt-2.5">
                    {/* Macros */}
                    {(r.calories > 0 || r.protein > 0 || r.carbs > 0 || r.fat > 0) && (
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { label: 'Cal', value: r.calories, unit: 'kcal' },
                          { label: 'Protein', value: r.protein, unit: 'g' },
                          { label: 'Carbs', value: r.carbs, unit: 'g' },
                          { label: 'Fat', value: r.fat, unit: 'g' },
                        ].map(({ label, value, unit }) => (
                          <div key={label} className="bg-white dark:bg-gray-900 rounded p-2 text-center border border-gray-100 dark:border-gray-700">
                            <p className="text-[10px] text-gray-400 dark:text-gray-500">{label}</p>
                            <p className="text-sm font-semibold">{value}</p>
                            <p className="text-[9px] text-gray-400 dark:text-gray-500">{unit}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ingredients */}
                    {r.ingredients && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Ingredients</p>
                        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">{r.ingredients}</p>
                      </div>
                    )}

                    {/* Notes */}
                    {r.notes && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Notes</p>
                        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">{r.notes}</p>
                      </div>
                    )}

                    {/* Log to today button */}
                    <button
                      onClick={() => logToNutrition(r)}
                      disabled={logging === r.id}
                      className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm py-1.5 rounded hover:opacity-90 disabled:opacity-40 transition"
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
