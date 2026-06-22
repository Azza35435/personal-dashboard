'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Habit, HabitCompletion } from '@/lib/types'

function getStreak(completions: string[]): number {
  if (completions.length === 0) return 0
  const sorted = [...completions].sort((a, b) => b.localeCompare(a))
  let streak = 0
  let current = new Date()
  current.setHours(0, 0, 0, 0)

  for (const dateStr of sorted) {
    const d = new Date(dateStr + 'T00:00:00')
    const diff = Math.round((current.getTime() - d.getTime()) / 86400000)
    if (diff === 0 || diff === 1) {
      streak++
      current = d
    } else {
      break
    }
  }
  return streak
}

export default function HabitWidget() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<HabitCompletion[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newHabit, setNewHabit] = useState('')

  const today = new Date().toISOString().split('T')[0]

  const load = async () => {
    const [{ data: h }, { data: c }] = await Promise.all([
      supabase.from('habits').select('*').eq('active', true).order('created_at'),
      supabase.from('habit_completions').select('*'),
    ])
    setHabits(h ?? [])
    setCompletions(c ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleToday = async (habit: Habit) => {
    const isDone = completions.some((c) => c.habit_id === habit.id && c.date === today)
    if (isDone) {
      await supabase.from('habit_completions').delete().eq('habit_id', habit.id).eq('date', today)
    } else {
      await supabase.from('habit_completions').insert({ habit_id: habit.id, date: today })
    }
    load()
  }

  const addHabit = async () => {
    if (!newHabit.trim()) return
    await supabase.from('habits').insert({ name: newHabit.trim() })
    setAdding(false)
    setNewHabit('')
    load()
  }

  const deleteHabit = async (id: string) => {
    await supabase.from('habits').update({ active: false }).eq('id', id)
    load()
  }

  const totalDoneToday = habits.filter((h) =>
    completions.some((c) => c.habit_id === h.id && c.date === today)
  ).length

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 h-full bg-indigo-600 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Habits</p>
          <p className="text-xs opacity-60">{totalDoneToday}/{habits.length} today</p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition"
        >
          + Add
        </button>
      </div>

      {adding && (
        <div className="flex gap-2">
          <input
            autoFocus
            className="flex-1 bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
            placeholder="New habit"
            value={newHabit}
            onChange={(e) => setNewHabit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addHabit(); if (e.key === 'Escape') setAdding(false) }}
          />
          <button onClick={addHabit} className="bg-white text-indigo-600 font-semibold text-sm px-3 py-1.5 rounded-lg">Add</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="animate-pulse h-8 bg-white/20 rounded-lg" />)}
        </div>
      ) : habits.length === 0 ? (
        <p className="text-sm opacity-60">No habits yet. Add one above.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 overflow-y-auto flex-1">
          {habits.map((habit) => {
            const doneToday = completions.some((c) => c.habit_id === habit.id && c.date === today)
            const habitCompletions = completions
              .filter((c) => c.habit_id === habit.id)
              .map((c) => c.date)
            const streak = getStreak(habitCompletions)

            return (
              <div
                key={habit.id}
                onClick={() => toggleToday(habit)}
                className={`group relative rounded-xl p-3 cursor-pointer transition select-none ${
                  doneToday ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                <div className="flex items-start justify-between">
                  <span className={`text-lg ${doneToday ? '' : 'grayscale opacity-60'}`}>
                    {doneToday ? '✅' : '⬜'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteHabit(habit.id) }}
                    className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-xs transition"
                  >
                    ×
                  </button>
                </div>
                <p className="text-sm font-medium mt-1 leading-tight">{habit.name}</p>
                {streak > 0 && (
                  <p className="text-xs opacity-70 mt-0.5">🔥 {streak} day streak</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
