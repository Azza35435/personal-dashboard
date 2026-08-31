'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Habit } from '@/lib/types'

const ACCENT = '#7c3aed'

function DonutRing({ pct, size = 52 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2
  const cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct, 100) / 100)
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={6} className="stroke-gray-200 dark:stroke-gray-700" />
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={ACCENT} strokeWidth={6}
        strokeDasharray={String(circ)} strokeDashoffset={String(offset)}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 10, fontWeight: 700, fill: ACCENT, fontFamily: 'inherit' }}>
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

const todayStr = () => new Date().toISOString().split('T')[0]

function getMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const days = new Date(y, now.getMonth() + 1, 0).getDate()
  return [`${y}-${m}-01`, `${y}-${m}-${String(days).padStart(2, '0')}`]
}

export default function HabitsWidget() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [todayDone, setTodayDone] = useState<Set<string>>(new Set())
  const [monthPct, setMonthPct] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const today = todayStr()
    const [start, end] = getMonthRange()
    const todayDay = new Date().getDate()

    const [{ data: habitsData }, { data: todayComps }, { data: monthComps }] = await Promise.all([
      supabase.from('habits').select('*').eq('active', true).order('position').order('created_at'),
      supabase.from('habit_completions').select('habit_id').eq('date', today),
      supabase.from('habit_completions').select('date').gte('date', start).lte('date', end),
    ])
    const h = habitsData ?? []
    setHabits(h)
    setTodayDone(new Set(todayComps?.map(c => c.habit_id) ?? []))
    const possible = h.length * todayDay
    const done = (monthComps ?? []).filter(c => {
      const d = parseInt(c.date.split('-')[2], 10)
      return d <= todayDay
    }).length
    setMonthPct(possible > 0 ? Math.round((done / possible) * 100) : 0)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (habitId: string) => {
    const today = todayStr()
    const done = todayDone.has(habitId)
    if (done) {
      await supabase.from('habit_completions').delete().eq('habit_id', habitId).eq('date', today)
    } else {
      await supabase.from('habit_completions').insert({ habit_id: habitId, date: today })
    }
    setTodayDone(prev => { const n = new Set(prev); done ? n.delete(habitId) : n.add(habitId); return n })
  }

  const doneCount = habits.filter(h => todayDone.has(h.id)).length

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Habits</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{doneCount}/{habits.length} today</p>
          </div>
          <div className="flex items-center gap-2">
            <DonutRing pct={monthPct} />
            <Link href="/habits" className="text-xs text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition">
              Full tracker →
            </Link>
          </div>
        </div>
        <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-400 rounded-full transition-all duration-500"
            style={{ width: `${habits.length > 0 ? Math.round((doneCount / habits.length) * 100) : 0}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))
        ) : habits.length === 0 ? (
          <p className="text-xs text-gray-400 text-center pt-4">
            No habits yet.{' '}
            <Link href="/habits" className="text-violet-500 hover:underline">Add some →</Link>
          </p>
        ) : habits.map(habit => {
          const done = todayDone.has(habit.id)
          return (
            <button
              key={habit.id}
              onClick={() => toggle(habit.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-200 ${
                done
                  ? 'bg-violet-50 dark:bg-violet-950/40'
                  : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <div className={`w-4 h-4 rounded-[3px] border-2 flex-shrink-0 flex items-center justify-center transition-all duration-200 ${
                done ? 'bg-violet-500 border-violet-500' : 'border-gray-300 dark:border-gray-600'
              }`}>
                {done && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
