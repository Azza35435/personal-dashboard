'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { Habit } from '@/lib/types'

// ─── Layout constants ─────────────────────────────────────────────────────────
const CELL_W = 30
const ROW_H = 36
const HDR_H = 30
const ACCENT = '#7c3aed'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }

function monthRange(y: number, m: number): [string, string] {
  const mm = String(m + 1).padStart(2, '0')
  return [`${y}-${mm}-01`, `${y}-${mm}-${String(daysInMonth(y, m)).padStart(2, '0')}`]
}

function offsetYM(baseY: number, baseM: number, offset: number) {
  let m = baseM + offset, y = baseY
  while (m < 0) { m += 12; y-- }
  while (m >= 12) { m -= 12; y++ }
  return { y, m }
}

function getWeeks(y: number, m: number): number[][] {
  const total = daysInMonth(y, m)
  const weeks: number[][] = [[]]
  for (let d = 1; d <= total; d++) {
    if (d > 1 && new Date(y, m, d).getDay() === 1) weeks.push([])
    weeks[weeks.length - 1].push(d)
  }
  return weeks
}

// ─── Donut ring ───────────────────────────────────────────────────────────────
function DonutRing({ pct, size = 88, color = ACCENT }: { pct: number; size?: number; color?: string }) {
  const r = (size - 16) / 2
  const cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct, 100) / 100)
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={8} className="stroke-gray-200 dark:stroke-gray-700" />
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={String(circ)} strokeDashoffset={String(offset)}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: size < 70 ? 10 : 14, fontWeight: 700, fill: color, fontFamily: 'inherit' }}>
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

// ─── Check icon ───────────────────────────────────────────────────────────────
function Check() {
  return (
    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Drag state ───────────────────────────────────────────────────────────────
interface DragState { id: string; fromIndex: number; overIndex: number }

// ─── Main component ───────────────────────────────────────────────────────────
export default function HabitTracker() {
  const now = new Date()
  const todayY = now.getFullYear()
  const todayM = now.getMonth()
  const todayD = now.getDate()

  const [monthOffset, setMonthOffset] = useState(0)
  const [habits, setHabits] = useState<Habit[]>([])
  const [completions, setCompletions] = useState<Set<string>>(new Set()) // `${habit_id}:${day}`
  const [trendData, setTrendData] = useState<{ month: string; pct: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [dragging, setDragging] = useState<DragState | null>(null)
  const draggingRef = useRef<DragState | null>(null)
  const habitsRef = useRef<Habit[]>([])

  const { y: yr, m: mo } = offsetYM(todayY, todayM, monthOffset)
  const isCurrentMonth = yr === todayY && mo === todayM
  const totalDays = daysInMonth(yr, mo)
  const days = Array.from({ length: totalDays }, (_, i) => i + 1)
  const [startDate, endDate] = monthRange(yr, mo)
  const lastElapsed = isCurrentMonth ? todayD : totalDays

  // ─── Data loading ─────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const [{ data: hData }, { data: cData }] = await Promise.all([
      supabase.from('habits').select('*').eq('active', true).order('position').order('created_at'),
      supabase.from('habit_completions').select('habit_id, date').gte('date', startDate).lte('date', endDate),
    ])
    const h = hData ?? []
    setHabits(h)
    habitsRef.current = h
    const s = new Set<string>()
    for (const c of cData ?? []) {
      s.add(`${c.habit_id}:${parseInt(c.date.split('-')[2], 10)}`)
    }
    setCompletions(s)
    setLoading(false)
  }, [startDate, endDate])

  const loadTrend = useCallback(async () => {
    const months = Array.from({ length: 12 }, (_, i) => offsetYM(todayY, todayM, -(11 - i)))
    const [tStart] = monthRange(months[0].y, months[0].m)
    const [, tEnd] = monthRange(months[11].y, months[11].m)
    const [{ data: comps }, { data: hData }] = await Promise.all([
      supabase.from('habit_completions').select('date').gte('date', tStart).lte('date', tEnd),
      supabase.from('habits').select('id').eq('active', true),
    ])
    const hCount = (hData ?? []).length
    if (!hCount) return
    setTrendData(months.map(({ y, m }) => {
      const [ms, me] = monthRange(y, m)
      const nd = daysInMonth(y, m)
      const count = (comps ?? []).filter(c => c.date >= ms && c.date <= me).length
      return { month: MONTHS_S[m], pct: Math.round((count / (nd * hCount)) * 100) }
    }))
  }, [todayY, todayM])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadTrend() }, [loadTrend])

  // ─── Drag to reorder ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: PointerEvent) => {
      const els = document.elementsFromPoint(e.clientX, e.clientY)
      let overIndex = draggingRef.current?.overIndex ?? 0
      for (const el of els) {
        const idx = (el as HTMLElement).dataset?.habitIndex
        if (idx !== undefined) { overIndex = parseInt(idx, 10); break }
      }
      const next = { ...draggingRef.current!, overIndex }
      setDragging(next)
      draggingRef.current = next
    }
    const onUp = async () => {
      const d = draggingRef.current
      if (!d) return
      const arr = [...habitsRef.current]
      const [moved] = arr.splice(d.fromIndex, 1)
      arr.splice(d.overIndex, 0, moved)
      const updated = arr.map((h, i) => ({ ...h, position: i }))
      setHabits(updated)
      habitsRef.current = updated
      setDragging(null)
      draggingRef.current = null
      await Promise.all(updated.map(h =>
        supabase.from('habits').update({ position: h.position }).eq('id', h.id)
      ))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [!!dragging]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Mutations ────────────────────────────────────────────────────────────
  const toggle = async (habitId: string, day: number) => {
    const key = `${habitId}:${day}`
    const mm = String(mo + 1).padStart(2, '0')
    const date = `${yr}-${mm}-${String(day).padStart(2, '0')}`
    const done = completions.has(key)
    if (done) {
      await supabase.from('habit_completions').delete().eq('habit_id', habitId).eq('date', date)
    } else {
      await supabase.from('habit_completions').insert({ habit_id: habitId, date })
    }
    setCompletions(prev => { const n = new Set(prev); done ? n.delete(key) : n.add(key); return n })
  }

  const addHabit = async () => {
    const name = newName.trim()
    if (!name) return
    const maxPos = habits.length ? Math.max(...habits.map(h => h.position)) : -1
    await supabase.from('habits').insert({ name, active: true, position: maxPos + 1 })
    setAdding(false)
    setNewName('')
    load()
  }

  const deleteHabit = async (id: string) => {
    await supabase.from('habits').update({ active: false }).eq('id', id)
    load()
  }

  // ─── Derived values ───────────────────────────────────────────────────────
  const totalPossible = habits.length * lastElapsed
  const totalDone = [...completions].filter(k => parseInt(k.split(':')[1], 10) <= lastElapsed).length
  const monthlyPct = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0

  const dailyCounts = days.map(day => {
    const future = isCurrentMonth && day > todayD
    const count = future ? 0 : habits.filter(h => completions.has(`${h.id}:${day}`)).length
    const pct = !future && habits.length > 0 ? Math.round((count / habits.length) * 100) : 0
    return { day, count, pct, future }
  })

  const dailyLineData = days
    .filter(d => !isCurrentMonth || d <= todayD)
    .map(day => {
      const count = habits.filter(h => completions.has(`${h.id}:${day}`)).length
      return { day: String(day), pct: habits.length > 0 ? Math.round((count / habits.length) * 100) : 0 }
    })

  const habitPcts = habits.map(h => {
    const done = days.filter(d => d <= lastElapsed && completions.has(`${h.id}:${d}`)).length
    return { id: h.id, pct: lastElapsed > 0 ? Math.round((done / lastElapsed) * 100) : 0 }
  })

  const weeks = getWeeks(yr, mo)
  const weeklyData = weeks.map((wDays, i) => {
    const elapsed = wDays.filter(d => !isCurrentMonth || d <= todayD)
    const possible = elapsed.length * habits.length
    const done = elapsed.flatMap(d => habits.filter(h => completions.has(`${h.id}:${d}`))).length
    return {
      label: `Week ${i + 1}`,
      sub: `${MONTHS_S[mo]} ${wDays[0]}–${wDays[wDays.length - 1]}`,
      pct: possible > 0 ? Math.round((done / possible) * 100) : 0,
    }
  })

  const maxBar = Math.max(1, habits.length)

  // ─── Drag row rendering helper ────────────────────────────────────────────
  function withGap(key: string, idx: number, node: React.ReactNode) {
    const showGap = dragging && dragging.id !== habits[idx]?.id && dragging.overIndex === idx
    const isEnd = idx === habits.length - 1 && dragging && dragging.overIndex >= habits.length
    return (
      <Fragment key={key}>
        {showGap && <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400 mx-2 rounded" />}
        <div style={{ opacity: dragging?.id === habits[idx]?.id ? 0.3 : 1 }}>{node}</div>
        {isEnd && <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400 mx-2 rounded" />}
      </Fragment>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-5 overflow-auto min-h-0">

      {/* ─── ROW 1: Stats ─────────────────────────────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 2fr 1fr' }}>

        {/* Month nav */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm p-4 flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-3 w-full justify-center">
            <button
              onClick={() => setMonthOffset(o => o - 1)}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xl leading-none transition"
            >‹</button>
            <div className="text-center">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{MONTHS[mo]}</p>
              <p className="text-xs text-gray-400">{yr}</p>
            </div>
            <button
              onClick={() => setMonthOffset(o => o + 1)}
              disabled={monthOffset >= 0}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xl leading-none transition disabled:opacity-25"
            >›</button>
          </div>
          <p className="text-xs text-gray-400 text-center">{habits.length} habit{habits.length !== 1 ? 's' : ''} tracked</p>
          <p className="text-xs text-gray-400 text-center">{lastElapsed} day{lastElapsed !== 1 ? 's' : ''} elapsed</p>
        </div>

        {/* Progress charts */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm p-4">
          <div className="flex gap-4 h-full">
            <div className="flex-1 flex flex-col min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">This month</p>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={80}>
                  <LineChart data={dailyLineData}>
                    <Line type="monotone" dataKey="pct" stroke={ACCENT} strokeWidth={2} dot={false} />
                    <XAxis dataKey="day" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip
                      contentStyle={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4 }}
                      formatter={(v) => [`${v}%`, 'done']}
                      labelFormatter={(l) => `Day ${l}`}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="w-px bg-gray-100 dark:bg-gray-800 self-stretch flex-shrink-0" />
            <div className="flex-1 flex flex-col min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">12-month trend</p>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height={80}>
                  <LineChart data={trendData}>
                    <Line type="monotone" dataKey="pct" stroke={ACCENT} strokeWidth={2} dot={false} />
                    <XAxis dataKey="month" hide />
                    <YAxis domain={[0, 100]} hide />
                    <Tooltip
                      contentStyle={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4 }}
                      formatter={(v) => [`${v}%`, 'avg']}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly % donut */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm p-4 flex flex-col items-center justify-center gap-1">
          <DonutRing pct={monthlyPct} size={88} />
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Monthly</p>
          <p className="text-xs text-gray-400 tabular-nums">{totalDone} / {totalPossible}</p>
        </div>
      </div>

      {/* ─── ROW 2: Tracker ───────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm overflow-hidden">
        <div className="flex">

          {/* Col 1: Habit list */}
          <div className="flex-shrink-0 border-r border-gray-100 dark:border-gray-800" style={{ width: 200 }}>
            <div
              className="flex items-center px-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800"
              style={{ height: HDR_H }}
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Habits</span>
            </div>
            {loading ? (
              [1,2,3].map(i => (
                <div key={i} style={{ height: ROW_H }} className="flex items-center px-3">
                  <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-full animate-pulse" />
                </div>
              ))
            ) : habits.map((h, idx) => withGap(h.id, idx, (
              <div
                key={h.id}
                data-habit-index={idx}
                style={{ height: ROW_H }}
                className="flex items-center gap-1.5 px-2 group border-b border-gray-50 dark:border-gray-800/50"
              >
                <span
                  onPointerDown={e => {
                    e.preventDefault()
                    const d: DragState = { id: h.id, fromIndex: idx, overIndex: idx }
                    setDragging(d)
                    draggingRef.current = d
                  }}
                  className="text-gray-300 dark:text-gray-600 cursor-grab text-sm select-none px-0.5 touch-none"
                >⠿</span>
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1 min-w-0">{h.name}</span>
                <button
                  onClick={() => deleteHabit(h.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 dark:text-gray-600 dark:hover:text-red-400 text-lg leading-none transition"
                >×</button>
              </div>
            )))}
            <div className="px-3 py-2.5">
              {adding ? (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    className="flex-1 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 placeholder-gray-400 outline-none focus:border-violet-400 text-gray-900 dark:text-gray-100"
                    placeholder="New habit"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addHabit(); if (e.key === 'Escape') setAdding(false) }}
                  />
                  <button onClick={addHabit} className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-2 py-1 rounded">Add</button>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="text-xs text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition"
                >+ Add habit</button>
              )}
            </div>
          </div>

          {/* Col 2: Grid + bar chart */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div style={{ minWidth: CELL_W * totalDays }}>

              {/* Day headers */}
              <div
                className="flex bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800"
                style={{ height: HDR_H }}
              >
                {days.map(day => {
                  const isToday = isCurrentMonth && day === todayD
                  return (
                    <div
                      key={day}
                      style={{ width: CELL_W, flexShrink: 0 }}
                      className={`flex items-center justify-center text-xs ${
                        isToday ? 'font-bold text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >{day}</div>
                  )
                })}
              </div>

              {/* Checkbox rows */}
              {loading ? (
                [1,2,3].map(i => (
                  <div key={i} className="flex" style={{ height: ROW_H }}>
                    {days.map(d => (
                      <div key={d} style={{ width: CELL_W, flexShrink: 0 }} className="flex items-center justify-center">
                        <div className="w-4 h-4 rounded-sm border border-gray-100 dark:border-gray-800 animate-pulse bg-gray-50 dark:bg-gray-800" />
                      </div>
                    ))}
                  </div>
                ))
              ) : habits.map((h, hIdx) => {
                const isDragging = dragging?.id === h.id
                const showGap = dragging && dragging.id !== h.id && dragging.overIndex === hIdx
                const isEnd = hIdx === habits.length - 1 && dragging && dragging.overIndex >= habits.length
                return (
                  <Fragment key={h.id}>
                    {showGap && (
                      <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                    )}
                    <div
                      className="flex border-b border-gray-50 dark:border-gray-800/50"
                      style={{ height: ROW_H, opacity: isDragging ? 0.3 : 1 }}
                    >
                      {days.map(day => {
                        const future = isCurrentMonth && day > todayD
                        const done = completions.has(`${h.id}:${day}`)
                        const isToday = isCurrentMonth && day === todayD
                        return (
                          <div
                            key={day}
                            style={{ width: CELL_W, flexShrink: 0 }}
                            className={`flex items-center justify-center ${isToday ? 'bg-violet-50/50 dark:bg-violet-950/10' : ''}`}
                          >
                            <button
                              onClick={() => !future && toggle(h.id, day)}
                              disabled={future}
                              className={`w-[18px] h-[18px] rounded-[3px] border flex items-center justify-center transition-all duration-150 ${
                                done
                                  ? 'bg-violet-500 border-violet-500'
                                  : future
                                    ? 'border-gray-100 dark:border-gray-800 cursor-default'
                                    : 'border-gray-300 dark:border-gray-600 hover:border-violet-400 dark:hover:border-violet-500'
                              }`}
                            >
                              {done && <Check />}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    {isEnd && (
                      <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                    )}
                  </Fragment>
                )
              })}

              {/* Daily bar chart + % strip */}
              {!loading && habits.length > 0 && (
                <div className="border-t-2 border-dashed border-gray-100 dark:border-gray-700">
                  {/* Bars */}
                  <div className="flex items-end" style={{ height: 72, paddingTop: 8 }}>
                    {dailyCounts.map(({ day, count, future }) => {
                      const barH = future ? 0 : Math.round((count / maxBar) * 56)
                      const full = !future && count > 0 && count === habits.length
                      const partial = !future && count > 0 && count < habits.length
                      return (
                        <div key={day} style={{ width: CELL_W, flexShrink: 0 }} className="flex justify-center items-end h-full">
                          <div
                            style={{ width: CELL_W - 6, height: barH }}
                            className={`rounded-t transition-all duration-300 ${
                              full ? 'bg-violet-500 dark:bg-violet-600' :
                              partial ? 'bg-violet-300 dark:bg-violet-800' :
                              future ? '' : 'bg-gray-100 dark:bg-gray-800'
                            }`}
                          />
                        </div>
                      )
                    })}
                  </div>
                  {/* % strip */}
                  <div className="flex" style={{ height: 28 }}>
                    {dailyCounts.map(({ day, pct, future }) => (
                      <div key={day} style={{ width: CELL_W, flexShrink: 0 }} className="flex flex-col items-center justify-center gap-0.5 px-0.5">
                        {!future ? (
                          <>
                            <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${pct}%` }}
                                className="h-full bg-violet-400 dark:bg-violet-600 rounded-full transition-all"
                              />
                            </div>
                            <span className="text-[8px] leading-tight text-gray-400 dark:text-gray-500 tabular-nums">{pct}%</span>
                          </>
                        ) : (
                          <div className="w-full h-1 bg-gray-50 dark:bg-gray-800/50 rounded-full" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Col 3: Per-habit completion bars */}
          <div className="flex-shrink-0 border-l border-gray-100 dark:border-gray-800" style={{ width: 184 }}>
            <div
              className="flex items-center px-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800"
              style={{ height: HDR_H }}
            >
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">% this month</span>
            </div>
            {loading ? (
              [1,2,3].map(i => (
                <div key={i} style={{ height: ROW_H }} className="flex items-center px-3">
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full w-full animate-pulse" />
                </div>
              ))
            ) : habits.map((h, i) => {
              const isDragging = dragging?.id === h.id
              const showGap = dragging && dragging.id !== h.id && dragging.overIndex === i
              const isEnd = i === habits.length - 1 && dragging && dragging.overIndex >= habits.length
              const pct = habitPcts[i]?.pct ?? 0
              return (
                <Fragment key={h.id}>
                  {showGap && (
                    <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                  )}
                  <div
                    style={{ height: ROW_H, opacity: isDragging ? 0.3 : 1 }}
                    className="flex items-center gap-2 px-3 border-b border-gray-50 dark:border-gray-800/50"
                  >
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className="h-full bg-violet-400 dark:bg-violet-600 rounded-full transition-all duration-500"
                      />
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right tabular-nums flex-shrink-0">{pct}%</span>
                  </div>
                  {isEnd && (
                    <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                  )}
                </Fragment>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── ROW 3: Weekly donuts ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Weekly completion</p>
        <div className="flex gap-6 flex-wrap justify-around">
          {weeklyData.map((w, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <DonutRing pct={w.pct} size={70} />
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{w.label}</p>
              <p className="text-[10px] text-gray-400">{w.sub}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
