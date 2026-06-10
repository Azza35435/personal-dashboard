'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { NutritionLog } from '@/lib/types'

const TODAY = new Date().toISOString().split('T')[0]

const EMPTY_FORM = { meal_name: '', calories: '', protein: '', carbs: '', fat: '' }

export default function NutritionWidget() {
  const [logs, setLogs] = useState<NutritionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = () =>
    supabase
      .from('nutrition_logs')
      .select('*')
      .eq('date', TODAY)
      .order('logged_at', { ascending: true })
      .then(({ data }) => {
        setLogs(data ?? [])
        setLoading(false)
      })

  useEffect(() => { load() }, [])

  const addLog = async () => {
    if (!form.meal_name.trim()) return
    await supabase.from('nutrition_logs').insert({
      meal_name: form.meal_name.trim(),
      calories: parseInt(form.calories) || 0,
      protein: parseFloat(form.protein) || 0,
      carbs: parseFloat(form.carbs) || 0,
      fat: parseFloat(form.fat) || 0,
      date: TODAY,
    })
    setAdding(false)
    setForm(EMPTY_FORM)
    load()
  }

  const deleteLog = async (id: string) => {
    await supabase.from('nutrition_logs').delete().eq('id', id)
    load()
  }

  const totals = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fat: acc.fat + l.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 bg-green-600 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Nutrition</p>
          <p className="text-xs opacity-60">
            {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition"
        >
          + Log meal
        </button>
      </div>

      {/* Daily totals */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Calories', value: totals.calories, unit: 'kcal' },
          { label: 'Protein', value: totals.protein, unit: 'g' },
          { label: 'Carbs', value: totals.carbs, unit: 'g' },
          { label: 'Fat', value: totals.fat, unit: 'g' },
        ].map(({ label, value, unit }) => (
          <div key={label} className="bg-white/10 rounded-xl p-2.5 text-center">
            <p className="text-xs opacity-70">{label}</p>
            <p className="font-bold text-sm mt-0.5">{Math.round(value)}</p>
            <p className="text-[10px] opacity-50">{unit}</p>
          </div>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <div className="bg-white/10 rounded-xl p-3 space-y-2">
          <input
            autoFocus
            className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
            placeholder="Meal name (e.g. Oats with banana)"
            value={form.meal_name}
            onChange={e => setForm({ ...form, meal_name: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') addLog() }}
          />
          <div className="grid grid-cols-4 gap-1.5">
            {(['calories', 'protein', 'carbs', 'fat'] as const).map(field => (
              <input
                key={field}
                type="number"
                min="0"
                className="bg-white/20 rounded-lg px-2 py-1.5 text-sm text-center placeholder-white/50 outline-none"
                placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                value={form[field]}
                onChange={e => setForm({ ...form, [field]: e.target.value })}
              />
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setAdding(false); setForm(EMPTY_FORM) }}
              className="text-xs opacity-60 hover:opacity-100 transition px-2"
            >
              Cancel
            </button>
            <button
              onClick={addLog}
              className="bg-white text-green-600 font-semibold text-sm px-4 py-1.5 rounded-lg"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Meal list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="animate-pulse h-10 bg-white/20 rounded-lg" />)}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm opacity-60">No meals logged today.</p>
      ) : (
        <div className="space-y-1.5">
          {logs.map(log => (
            <div key={log.id} className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2 group">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{log.meal_name}</p>
                <p className="text-xs opacity-60">
                  {log.calories} kcal · {log.protein}g P · {log.carbs}g C · {log.fat}g F
                </p>
              </div>
              <button
                onClick={() => deleteLog(log.id)}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-sm ml-2 transition"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
