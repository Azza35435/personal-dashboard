'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { NutritionLog } from '@/lib/types'

const TARGETS_KEY = 'nutrition_targets'

interface Targets {
  calories: number
  protein: number
  carbs: number
  fat: number
}

const DEFAULT_TARGETS: Targets = { calories: 2000, protein: 150, carbs: 250, fat: 65 }

function getDateStr(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

function dateLabel(offset: number) {
  if (offset === 0) return 'Today'
  if (offset === -1) return 'Yesterday'
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

const EMPTY_FORM = { meal_name: '', calories: '', protein: '', carbs: '', fat: '' }

export default function NutritionWidget() {
  const [logs, setLogs] = useState<NutritionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [dateOffset, setDateOffset] = useState(0)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [targets, setTargets] = useState<Targets>(DEFAULT_TARGETS)
  const [editingTargets, setEditingTargets] = useState(false)
  const [targetForm, setTargetForm] = useState<Record<string, string>>({})

  useEffect(() => {
    const stored = localStorage.getItem(TARGETS_KEY)
    if (stored) {
      try { setTargets(JSON.parse(stored)) } catch { /* ignore */ }
    }
  }, [])

  const load = useCallback(() =>
    supabase
      .from('nutrition_logs')
      .select('*')
      .eq('date', getDateStr(dateOffset))
      .order('logged_at', { ascending: true })
      .then(({ data }) => {
        setLogs(data ?? [])
        setLoading(false)
      }),
    [dateOffset]
  )

  useEffect(() => { setLoading(true); load() }, [load])

  const addLog = async () => {
    if (!form.meal_name.trim()) return
    await supabase.from('nutrition_logs').insert({
      meal_name: form.meal_name.trim(),
      calories: parseInt(form.calories) || 0,
      protein: parseFloat(form.protein) || 0,
      carbs: parseFloat(form.carbs) || 0,
      fat: parseFloat(form.fat) || 0,
      date: getDateStr(dateOffset),
    })
    setAdding(false)
    setForm(EMPTY_FORM)
    load()
  }

  const deleteLog = async (id: string) => {
    await supabase.from('nutrition_logs').delete().eq('id', id)
    load()
  }

  const saveTargets = () => {
    const updated: Targets = {
      calories: parseInt(targetForm.calories) || targets.calories,
      protein: parseInt(targetForm.protein) || targets.protein,
      carbs: parseInt(targetForm.carbs) || targets.carbs,
      fat: parseInt(targetForm.fat) || targets.fat,
    }
    setTargets(updated)
    localStorage.setItem(TARGETS_KEY, JSON.stringify(updated))
    setEditingTargets(false)
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

  const macros = [
    { key: 'calories' as const, label: 'Calories', unit: 'kcal' },
    { key: 'protein' as const, label: 'Protein', unit: 'g' },
    { key: 'carbs' as const, label: 'Carbs', unit: 'g' },
    { key: 'fat' as const, label: 'Fat', unit: 'g' },
  ]

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4 bg-green-600 text-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Nutrition</p>
          <div className="flex items-center gap-0.5 mt-0.5">
            <button
              onClick={() => setDateOffset(o => o - 1)}
              className="opacity-60 hover:opacity-100 text-sm w-5 text-center leading-none"
            >
              ‹
            </button>
            <p className="text-xs opacity-60">{dateLabel(dateOffset)}</p>
            <button
              onClick={() => setDateOffset(o => o + 1)}
              disabled={dateOffset >= 0}
              className="opacity-60 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed text-sm w-5 text-center leading-none"
            >
              ›
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              setTargetForm({
                calories: String(targets.calories),
                protein: String(targets.protein),
                carbs: String(targets.carbs),
                fat: String(targets.fat),
              })
              setEditingTargets(t => !t)
            }}
            className="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full transition"
          >
            Targets
          </button>
          <button
            onClick={() => setAdding(!adding)}
            className="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full transition"
          >
            + Meal
          </button>
        </div>
      </div>

      {/* Targets edit form */}
      {editingTargets && (
        <div className="bg-white/10 rounded-xl p-3 space-y-2">
          <p className="text-xs opacity-70">Daily targets</p>
          <div className="grid grid-cols-4 gap-1.5">
            {macros.map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <p className="text-[10px] opacity-60 text-center">{label}</p>
                <input
                  type="number"
                  min="0"
                  className="bg-white/20 rounded-lg px-2 py-1.5 text-sm text-center placeholder-white/50 outline-none"
                  value={targetForm[key] ?? ''}
                  onChange={e => setTargetForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setEditingTargets(false)}
              className="text-xs opacity-60 hover:opacity-100 transition px-2"
            >
              Cancel
            </button>
            <button
              onClick={saveTargets}
              className="bg-white text-green-600 font-semibold text-sm px-4 py-1.5 rounded-lg"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Daily totals with progress */}
      <div className="grid grid-cols-4 gap-2">
        {macros.map(({ key, label, unit }) => {
          const value = Math.round(totals[key])
          const target = targets[key]
          const pct = Math.min(100, target > 0 ? (value / target) * 100 : 0)
          const over = value > target
          return (
            <div key={label} className="bg-white/10 rounded-xl p-2.5 text-center">
              <p className="text-xs opacity-70">{label}</p>
              <p className="font-bold text-sm mt-0.5">{value}</p>
              <p className="text-[10px] opacity-50">{unit}</p>
              <div className="mt-1.5 h-1 bg-white/20 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${over ? 'bg-red-300' : 'bg-white/70'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[9px] opacity-40 mt-0.5">/ {target}</p>
            </div>
          )
        })}
      </div>

      {/* Add meal form */}
      {adding && (
        <div className="bg-white/10 rounded-xl p-3 space-y-2">
          <input
            autoFocus
            className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
            placeholder="Meal name (e.g. Oats with banana)"
            value={form.meal_name}
            onChange={e => setForm(f => ({ ...f, meal_name: e.target.value }))}
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
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
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
        <p className="text-sm opacity-60">No meals logged {dateOffset === 0 ? 'today' : 'this day'}.</p>
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
