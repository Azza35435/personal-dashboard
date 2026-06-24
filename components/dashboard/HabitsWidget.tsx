'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Habit } from '@/lib/types'

const todayStr = () => new Date().toISOString().split('T')[0]

export default function HabitsWidget() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const today = todayStr()
    const [{ data: habitsData }, { data: completions }] = await Promise.all([
      supabase.from('habits').select('*').eq('active', true).order('created_at'),
      supabase.from('habit_completions').select('habit_id').eq('date', today),
    ])
    setHabits(habitsData ?? [])
    setCompletedIds(new Set(completions?.map(c => c.habit_id) ?? []))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (habitId: string) => {
    const today = todayStr()
    const done = completedIds.has(habitId)
    if (done) {
      await supabase.from('habit_completions').delete().eq('habit_id', habitId).eq('date', today)
    } else {
      await supabase.from('habit_completions').insert({ habit_id: habitId, date: today })
    }
    setCompletedIds(prev => {
      const n = new Set(prev)
      done ? n.delete(habitId) : n.add(habitId)
      return n
    })
  }

  const doneCount = habits.filter(h => completedIds.has(h.id)).length
  const pct = habits.length > 0 ? Math.round((doneCount / habits.length) * 100) : 0

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Habits</p>
          <span className="text-xs font-medium text-emerald-500">{doneCount}/{habits.length}</span>
        </div>
        {/* progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))
        ) : habits.length === 0 ? (
          <p className="text-xs text-gray-400 text-center pt-4">No active habits. Add some on the Habits page.</p>
        ) : habits.map(habit => {
          const done = completedIds.has(habit.id)
          return (
            <button
              key={habit.id}
              onClick={() => toggle(habit.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all duration-200 ${
                done
                  ? 'bg-emerald-50 dark:bg-emerald-950/40'
                  : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
                done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 dark:border-gray-600'
              }`}>
                {done && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <span className={`text-sm transition-all duration-200 ${done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                {habit.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
