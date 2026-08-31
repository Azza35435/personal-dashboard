'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Habit } from '@/lib/types'
import { ROTATING_PERIODS, PERIOD_INFO, getCurrentPeriod, habitVisibleInPeriod, type RotatingPeriod } from '@/lib/habits'

function DonutRing({ pct, size = 48 }: { pct: number; size?: number }) {
  const r = (size - 10) / 2
  const cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct, 100) / 100)
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={5} style={{ stroke: 'var(--rule)' }} />
      <circle cx={cx} cy={cy} r={r} fill="none"
        strokeWidth={5}
        strokeDasharray={String(circ)} strokeDashoffset={String(offset)}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        style={{ stroke: 'var(--oxblood)' }}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 9, fontWeight: 700, fill: 'var(--oxblood)', fontFamily: 'inherit' }}>
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
  const [monthComps, setMonthComps] = useState<{ habit_id: string; date: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [viewPeriod, setViewPeriod] = useState<RotatingPeriod>(() => getCurrentPeriod())
  const currentPeriod = useMemo(() => getCurrentPeriod(), [])

  const load = useCallback(async () => {
    const today = todayStr()
    const [start, end] = getMonthRange()

    const [{ data: habitsData }, { data: todayComps }, { data: monthCompsData }] = await Promise.all([
      supabase.from('habits').select('*').eq('active', true).order('position').order('created_at'),
      supabase.from('habit_completions').select('habit_id').eq('date', today),
      supabase.from('habit_completions').select('habit_id, date').gte('date', start).lte('date', end),
    ])
    setHabits(habitsData ?? [])
    setTodayDone(new Set(todayComps?.map(c => c.habit_id) ?? []))
    setMonthComps(monthCompsData ?? [])
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

  const periodHabits = habits.filter(h => habitVisibleInPeriod(h, viewPeriod))
  const doneCount = periodHabits.filter(h => todayDone.has(h.id)).length

  const todayDay = new Date().getDate()
  const periodIds = new Set(periodHabits.map(h => h.id))
  const possible = periodHabits.length * todayDay
  const doneThisMonth = monthComps.filter(c => periodIds.has(c.habit_id) && parseInt(c.date.split('-')[2], 10) <= todayDay).length
  const monthPct = possible > 0 ? (doneThisMonth / possible) * 100 : 0

  return (
    <div className="h-full flex flex-col border hairline overflow-hidden" style={{ background: 'var(--paper-raised)', borderColor: 'var(--rule)' }}>
      <div className="px-6 pt-6 pb-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="eyebrow">Habits</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ink-faint)' }}>{doneCount}/{periodHabits.length}</p>
          </div>
          <div className="flex items-center gap-2">
            <DonutRing pct={monthPct} />
            <Link href="/habits" className="text-xs transition" style={{ color: 'var(--ink-faint)' }}>
              Full tracker →
            </Link>
          </div>
        </div>
        <div className="flex gap-4">
          {ROTATING_PERIODS.map(p => {
            const active = p === viewPeriod
            const isNow = p === currentPeriod
            return (
              <button
                key={p}
                onClick={() => setViewPeriod(p)}
                className="flex flex-col gap-0.5 pb-1.5 text-left"
                style={{ borderBottom: `1px solid ${active ? 'var(--oxblood)' : 'transparent'}` }}
              >
                <span
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: active ? 'var(--ink)' : 'var(--ink-faint)' }}
                >
                  {PERIOD_INFO[p].label}{isNow ? ' •' : ''}
                </span>
                <span className="text-[10px] opacity-70" style={{ color: 'var(--ink-faint)' }}>{PERIOD_INFO[p].range}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-5">
        {loading ? (
          <div className="space-y-2 pt-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 rounded animate-pulse" style={{ background: 'var(--rule)' }} />
            ))}
          </div>
        ) : periodHabits.length === 0 ? (
          <p className="text-xs text-center pt-4" style={{ color: 'var(--ink-faint)' }}>
            No {PERIOD_INFO[viewPeriod].label.toLowerCase()} habits yet.{' '}
            <Link href="/habits" className="hover:underline" style={{ color: 'var(--oxblood)' }}>Add some →</Link>
          </p>
        ) : periodHabits.map((habit, idx) => {
          const done = todayDone.has(habit.id)
          return (
            <button
              key={habit.id}
              onClick={() => toggle(habit.id)}
              className="w-full flex items-center gap-3 py-2 text-left"
              style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--rule)' }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{
                  border: `1.5px solid ${done ? 'var(--sage)' : 'var(--ink-faint)'}`,
                  background: done ? 'var(--sage)' : 'transparent',
                }}
              />
              <span
                className="text-sm"
                style={done
                  ? { color: 'var(--ink-faint)', textDecoration: 'line-through', textDecorationColor: 'var(--rule-strong)' }
                  : { color: 'var(--ink)' }}
              >
                {habit.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
