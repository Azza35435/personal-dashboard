'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { Habit, HabitGroup } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────
const CELL_W = 30
const ROW_H = 36
const HDR_H = 30
const GRP_H = 26
const ACCENT = '#7c3aed'
const GEN = '__general__' // sentinel for null group in data-* attrs

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MONTHS   = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function monthRange(y: number, m: number): [string, string] {
  const mm = String(m + 1).padStart(2, '0')
  return [`${y}-${mm}-01`, `${y}-${mm}-${String(daysInMonth(y, m)).padStart(2, '0')}`]
}
function offsetYM(bY: number, bM: number, off: number) {
  let m = bM + off, y = bY
  while (m < 0) { m += 12; y-- }
  while (m >= 12) { m -= 12; y++ }
  return { y, m }
}
function getWeeks(y: number, m: number): number[][] {
  const total = daysInMonth(y, m), weeks: number[][] = [[]]
  for (let d = 1; d <= total; d++) {
    if (d > 1 && new Date(y, m, d).getDay() === 1) weeks.push([])
    weeks[weeks.length - 1].push(d)
  }
  return weeks
}
const gAttr   = (id: string | null) => id ?? GEN
const attrToG = (s: string): string | null => s === GEN ? null : s

// ─── Sub-components ───────────────────────────────────────────────────────────
function DonutRing({ pct, size = 88, color = ACCENT }: { pct: number; size?: number; color?: string }) {
  const r = (size - 16) / 2, cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - Math.min(pct, 100) / 100)
  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={8} className="stroke-gray-200 dark:stroke-gray-700" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={String(circ)} strokeDashoffset={String(offset)}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: size < 70 ? 10 : 14, fontWeight: 700, fill: color, fontFamily: 'inherit' }}>
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

function Check() {
  return (
    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ─── Drag state types ─────────────────────────────────────────────────────────
interface HabitDrag {
  habitId: string
  fromGroupId: string | null
  fromIndex: number
  overGroupId: string | null
  overIndex: number
}
interface GroupDrag { groupId: string; fromIndex: number; overIndex: number }

// ─── Popover state ────────────────────────────────────────────────────────────
interface PopoverState {
  type: 'habit' | 'group'
  id: string
  top: number
  left: number
}
interface DeleteConfirm {
  groupId: string
  moveToId: string | null
  deleteAll: boolean
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function HabitTracker() {
  const now = new Date()
  const todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate()

  // ── state ──
  const [monthOffset, setMonthOffset] = useState(0)
  const [groups, setGroups]           = useState<HabitGroup[]>([])
  const [habits, setHabits]           = useState<Habit[]>([])
  const [completions, setCompletions] = useState<Set<string>>(new Set())
  const [trendData, setTrendData]     = useState<{ month: string; pct: number }[]>([])
  const [loading, setLoading]         = useState(true)
  const [habitDrag, setHabitDrag]     = useState<HabitDrag | null>(null)
  const [groupDrag, setGroupDrag]     = useState<GroupDrag | null>(null)
  const habitDragRef = useRef<HabitDrag | null>(null)
  const groupDragRef = useRef<GroupDrag | null>(null)
  const groupsRef    = useRef<HabitGroup[]>([])
  const habitsRef    = useRef<Habit[]>([])
  const [popover, setPopover]           = useState<PopoverState | null>(null)
  const [popGrpName, setPopGrpName]     = useState('')
  const [delConfirm, setDelConfirm]     = useState<DeleteConfirm | null>(null)
  const [addingIn, setAddingIn]         = useState<string | null>(null) // gAttr value
  const [newHabitName, setNewHabitName] = useState('')
  const [addingGrp, setAddingGrp]       = useState(false)
  const [newGrpName, setNewGrpName]     = useState('')
  const popRef = useRef<HTMLDivElement>(null)

  // ── month ──
  const { y: yr, m: mo } = offsetYM(todayY, todayM, monthOffset)
  const isCurrentMonth = yr === todayY && mo === todayM
  const totalDays = daysInMonth(yr, mo)
  const days = Array.from({ length: totalDays }, (_, i) => i + 1)
  const [startDate, endDate] = monthRange(yr, mo)
  const lastElapsed = isCurrentMonth ? todayD : totalDays

  // ── load ──
  const load = useCallback(async () => {
    const [{ data: gData }, { data: hData }, { data: cData }] = await Promise.all([
      supabase.from('habit_groups').select('*').order('position'),
      supabase.from('habits').select('*').eq('active', true).order('position').order('created_at'),
      supabase.from('habit_completions').select('habit_id, date').gte('date', startDate).lte('date', endDate),
    ])
    const g = gData ?? [], h = hData ?? []
    setGroups(g); setHabits(h)
    groupsRef.current = g; habitsRef.current = h
    const s = new Set<string>()
    for (const c of cData ?? []) s.add(`${c.habit_id}:${parseInt(c.date.split('-')[2], 10)}`)
    setCompletions(s)
    setLoading(false)
  }, [startDate, endDate])

  const loadTrend = useCallback(async () => {
    const months = Array.from({ length: 12 }, (_, i) => offsetYM(todayY, todayM, -(11 - i)))
    const [tStart] = monthRange(months[0].y, months[0].m)
    const [, tEnd]  = monthRange(months[11].y, months[11].m)
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

  // ── habit drag effect ──
  useEffect(() => {
    if (!habitDrag) return
    const onMove = (e: PointerEvent) => {
      const els = document.elementsFromPoint(e.clientX, e.clientY)
      let overGroupId = habitDragRef.current!.overGroupId
      let overIndex   = habitDragRef.current!.overIndex
      for (const el of els) {
        const gid = (el as HTMLElement).dataset?.hdropGid
        const idx = (el as HTMLElement).dataset?.hdropIdx
        if (gid !== undefined) {
          overGroupId = attrToG(gid)
          overIndex = idx !== undefined ? parseInt(idx, 10) : 0
          break
        }
      }
      const next = { ...habitDragRef.current!, overGroupId, overIndex }
      setHabitDrag(next); habitDragRef.current = next
    }
    const onUp = async () => {
      const d = habitDragRef.current
      if (!d) return
      // Build per-group sorted arrays
      const byGroup = (gid: string | null) =>
        [...habitsRef.current].filter(h => h.group_id === gid).sort((a, b) => a.position - b.position)

      const movedHabit = byGroup(d.fromGroupId)[d.fromIndex]
      if (!movedHabit) { setHabitDrag(null); habitDragRef.current = null; return }

      // Remove from source group
      const srcArr = byGroup(d.fromGroupId).filter(h => h.id !== movedHabit.id).map((h, i) => ({ ...h, position: i }))
      // Insert into dest group
      const dstArr = (d.overGroupId === d.fromGroupId ? srcArr : byGroup(d.overGroupId))
        .filter(h => h.id !== movedHabit.id)
      const insertAt = Math.min(d.overIndex, dstArr.length)
      dstArr.splice(insertAt, 0, { ...movedHabit, group_id: d.overGroupId })
      const dstFinal = dstArr.map((h, i) => ({ ...h, position: i }))

      // Merge back
      const updated = habitsRef.current.map(h => {
        const inDst = dstFinal.find(x => x.id === h.id)
        if (inDst) return inDst
        if (d.overGroupId !== d.fromGroupId) {
          const inSrc = srcArr.find(x => x.id === h.id)
          if (inSrc) return inSrc
        }
        return h
      })
      setHabits(updated); habitsRef.current = updated
      setHabitDrag(null); habitDragRef.current = null

      // Persist
      for (const h of dstFinal) await supabase.from('habits').update({ position: h.position, group_id: h.group_id }).eq('id', h.id)
      if (d.overGroupId !== d.fromGroupId) {
        for (const h of srcArr) await supabase.from('habits').update({ position: h.position }).eq('id', h.id)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [!!habitDrag]) // eslint-disable-line

  // ── group drag effect ──
  useEffect(() => {
    if (!groupDrag) return
    const onMove = (e: PointerEvent) => {
      const els = document.elementsFromPoint(e.clientX, e.clientY)
      let overIndex = groupDragRef.current!.overIndex
      for (const el of els) {
        const idx = (el as HTMLElement).dataset?.gdropIdx
        if (idx !== undefined) { overIndex = parseInt(idx, 10); break }
      }
      const next = { ...groupDragRef.current!, overIndex }
      setGroupDrag(next); groupDragRef.current = next
    }
    const onUp = async () => {
      const d = groupDragRef.current
      if (!d) return
      const arr = [...groupsRef.current]
      const [moved] = arr.splice(d.fromIndex, 1)
      arr.splice(d.overIndex, 0, moved)
      const updated = arr.map((g, i) => ({ ...g, position: i }))
      setGroups(updated); groupsRef.current = updated
      setGroupDrag(null); groupDragRef.current = null
      await Promise.all(updated.map(g => supabase.from('habit_groups').update({ position: g.position }).eq('id', g.id)))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
  }, [!!groupDrag]) // eslint-disable-line

  // ── close popover on outside click ──
  useEffect(() => {
    if (!popover) return
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setPopover(null); setDelConfirm(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [!!popover]) // eslint-disable-line

  // ── mutations ──
  const toggle = async (habitId: string, day: number) => {
    const key = `${habitId}:${day}`
    const mm = String(mo + 1).padStart(2, '0')
    const date = `${yr}-${mm}-${String(day).padStart(2, '0')}`
    const done = completions.has(key)
    if (done) await supabase.from('habit_completions').delete().eq('habit_id', habitId).eq('date', date)
    else       await supabase.from('habit_completions').insert({ habit_id: habitId, date })
    setCompletions(prev => { const n = new Set(prev); done ? n.delete(key) : n.add(key); return n })
  }

  const addHabit = async (groupId: string | null) => {
    const name = newHabitName.trim()
    if (!name) return
    const inGrp = habits.filter(h => h.group_id === groupId)
    const maxPos = inGrp.length ? Math.max(...inGrp.map(h => h.position)) : -1
    await supabase.from('habits').insert({ name, active: true, position: maxPos + 1, group_id: groupId })
    setAddingIn(null); setNewHabitName(''); load()
  }

  const deleteHabit = async (id: string) => {
    await supabase.from('habits').update({ active: false }).eq('id', id)
    setPopover(null); load()
  }

  const moveHabitGroup = async (habitId: string, newGroupId: string | null) => {
    const inTarget = habits.filter(h => h.group_id === newGroupId)
    const maxPos = inTarget.length ? Math.max(...inTarget.map(h => h.position)) : -1
    await supabase.from('habits').update({ group_id: newGroupId, position: maxPos + 1 }).eq('id', habitId)
    setPopover(null); load()
  }

  const addGroup = async () => {
    const name = newGrpName.trim()
    if (!name) return
    const maxPos = groups.length ? Math.max(...groups.map(g => g.position)) : -1
    await supabase.from('habit_groups').insert({ name, position: maxPos + 1 })
    setAddingGrp(false); setNewGrpName(''); load()
  }

  const renameGroup = async (id: string, name: string) => {
    if (!name.trim()) return
    await supabase.from('habit_groups').update({ name: name.trim() }).eq('id', id)
    setPopover(null); load()
  }

  const startDeleteGroup = (groupId: string) => {
    const count = habits.filter(h => h.group_id === groupId).length
    if (count === 0) {
      supabase.from('habit_groups').delete().eq('id', groupId).then(() => { setPopover(null); load() })
    } else {
      setDelConfirm({ groupId, moveToId: null, deleteAll: false })
    }
  }

  const confirmDeleteGroup = async () => {
    if (!delConfirm) return
    const { groupId, moveToId, deleteAll } = delConfirm
    const inGrp = habits.filter(h => h.group_id === groupId)
    if (deleteAll) {
      if (inGrp.length) await supabase.from('habits').update({ active: false }).in('id', inGrp.map(h => h.id))
    } else {
      const inTarget = habits.filter(h => h.group_id === moveToId)
      const startPos = inTarget.length ? Math.max(...inTarget.map(h => h.position)) + 1 : 0
      for (let i = 0; i < inGrp.length; i++) {
        await supabase.from('habits').update({ group_id: moveToId, position: startPos + i }).eq('id', inGrp[i].id)
      }
    }
    await supabase.from('habit_groups').delete().eq('id', groupId)
    setPopover(null); setDelConfirm(null); load()
  }

  // ── computed values ──
  const totalPossible = habits.length * lastElapsed
  const totalDone = [...completions].filter(k => parseInt(k.split(':')[1], 10) <= lastElapsed).length
  const monthlyPct = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0

  const dailyCounts = days.map(day => {
    const future = isCurrentMonth && day > todayD
    const count = future ? 0 : habits.filter(h => completions.has(`${h.id}:${day}`)).length
    return { day, count, pct: !future && habits.length > 0 ? Math.round((count / habits.length) * 100) : 0, future }
  })

  const dailyLineData = days.filter(d => !isCurrentMonth || d <= todayD).map(day => {
    const count = habits.filter(h => completions.has(`${h.id}:${day}`)).length
    return { day: String(day), pct: habits.length > 0 ? Math.round((count / habits.length) * 100) : 0 }
  })

  const habitPcts = new Map(habits.map(h => {
    const done = days.filter(d => d <= lastElapsed && completions.has(`${h.id}:${d}`)).length
    return [h.id, lastElapsed > 0 ? Math.round((done / lastElapsed) * 100) : 0]
  }))

  const weeks = getWeeks(yr, mo)
  const weeklyData = weeks.map((wDays, i) => {
    const elapsed = wDays.filter(d => !isCurrentMonth || d <= todayD)
    const possible = elapsed.length * habits.length
    const done = elapsed.flatMap(d => habits.filter(h => completions.has(`${h.id}:${d}`))).length
    return { label: `Week ${i + 1}`, sub: `${MONTHS_S[mo]} ${wDays[0]}–${wDays[wDays.length - 1]}`, pct: possible > 0 ? Math.round((done / possible) * 100) : 0 }
  })
  const maxBar = Math.max(1, habits.length)

  // ── ordered groups (with visual drag reorder) ──
  const orderedGroups: HabitGroup[] = (() => {
    const gs = [...groups]
    if (groupDrag) { const [m] = gs.splice(groupDrag.fromIndex, 1); gs.splice(groupDrag.overIndex, 0, m) }
    return gs
  })()

  // ── habits per group ──
  const byGroup = new Map<string | null, Habit[]>()
  byGroup.set(null, [])
  for (const g of groups) byGroup.set(g.id, [])
  for (const h of habits) {
    const key = byGroup.has(h.group_id) ? h.group_id : null
    byGroup.get(key)!.push(h)
  }
  for (const arr of byGroup.values()) arr.sort((a, b) => a.position - b.position)

  // sections: ordered named groups + General at end
  const sections = [
    ...orderedGroups.map((g, i) => ({ id: g.id as string | null, name: g.name, isGeneral: false, gIdx: i })),
    { id: null as string | null, name: 'General', isGeneral: true, gIdx: -1 },
  ]

  // ── drag gap helpers ──
  const habitGapAt  = (gid: string | null, idx: number) =>
    habitDrag !== null && habitDrag.overGroupId === gid && habitDrag.overIndex === idx
  const habitGapEnd = (gid: string | null) => {
    const arr = byGroup.get(gid) ?? []
    return habitDrag !== null && habitDrag.overGroupId === gid && habitDrag.overIndex >= arr.length
  }
  const groupGapAt = (gIdx: number) =>
    groupDrag !== null && groupDrag.overIndex === gIdx &&
    groupsRef.current[groupDrag.fromIndex]?.id !== orderedGroups[gIdx]?.id

  // ── popover targets ──
  const popHabit = popover?.type === 'habit' ? habits.find(h => h.id === popover.id) : null
  const popGroup = popover?.type === 'group' ? groups.find(g => g.id === popover.id) : null

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 p-5 overflow-auto min-h-0">

      {/* ── ROW 1: Stats ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 2fr 1fr' }}>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm p-4 flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-3 w-full justify-center">
            <button onClick={() => setMonthOffset(o => o - 1)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 text-xl leading-none transition">‹</button>
            <div className="text-center">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{MONTHS[mo]}</p>
              <p className="text-xs text-gray-400">{yr}</p>
            </div>
            <button onClick={() => setMonthOffset(o => o + 1)} disabled={monthOffset >= 0} className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 text-xl leading-none transition disabled:opacity-25">›</button>
          </div>
          <p className="text-xs text-gray-400">{habits.length} habit{habits.length !== 1 ? 's' : ''} · {lastElapsed}d elapsed</p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm p-4">
          <div className="flex gap-4 h-full">
            <div className="flex-1 flex flex-col min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">This month</p>
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={dailyLineData}>
                  <Line type="monotone" dataKey="pct" stroke={ACCENT} strokeWidth={2} dot={false} />
                  <XAxis dataKey="day" hide /><YAxis domain={[0, 100]} hide />
                  <Tooltip contentStyle={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4 }} formatter={(v) => [`${v}%`, 'done']} labelFormatter={(l) => `Day ${l}`} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="w-px bg-gray-100 dark:bg-gray-800 self-stretch flex-shrink-0" />
            <div className="flex-1 flex flex-col min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">12-month trend</p>
              <ResponsiveContainer width="100%" height={80}>
                <LineChart data={trendData}>
                  <Line type="monotone" dataKey="pct" stroke={ACCENT} strokeWidth={2} dot={false} />
                  <XAxis dataKey="month" hide /><YAxis domain={[0, 100]} hide />
                  <Tooltip contentStyle={{ fontSize: 11, padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: 4 }} formatter={(v) => [`${v}%`, 'avg']} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm p-4 flex flex-col items-center justify-center gap-1">
          <DonutRing pct={monthlyPct} size={88} />
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Monthly</p>
          <p className="text-xs text-gray-400 tabular-nums">{totalDone} / {totalPossible}</p>
        </div>
      </div>

      {/* ── ROW 2: Tracker ── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm overflow-hidden">
        <div className="flex">

          {/* ── COL 1: Habit list ── */}
          <div className="flex-shrink-0 border-r border-gray-100 dark:border-gray-800" style={{ width: 200 }}>
            <div style={{ height: HDR_H }} className="flex items-center px-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Habits</span>
            </div>

            {loading ? [1,2,3].map(i => (
              <div key={i} style={{ height: ROW_H }} className="flex items-center px-3">
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-full animate-pulse" />
              </div>
            )) : sections.map(sec => (
              <Fragment key={String(sec.id)}>
                {/* group drag gap */}
                {!sec.isGeneral && groupGapAt(sec.gIdx) && (
                  <div style={{ height: GRP_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                )}
                {/* group header */}
                <div
                  data-gdrop-idx={sec.isGeneral ? undefined : String(sec.gIdx)}
                  data-hdrop-gid={gAttr(sec.id)}
                  style={{ height: GRP_H, opacity: groupDrag?.groupId === sec.id ? 0.3 : 1 }}
                  className="flex items-center px-2 gap-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 select-none"
                >
                  {!sec.isGeneral && (
                    <span
                      onPointerDown={e => {
                        e.preventDefault()
                        const idx = orderedGroups.findIndex(g => g.id === sec.id)
                        const d: GroupDrag = { groupId: sec.id!, fromIndex: idx, overIndex: idx }
                        setGroupDrag(d); groupDragRef.current = d
                      }}
                      className="text-gray-300 dark:text-gray-600 cursor-grab text-sm touch-none"
                    >⠿</span>
                  )}
                  <span className={`text-[10px] font-bold uppercase tracking-widest flex-1 truncate ${
                    sec.isGeneral ? 'text-gray-300 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'
                  }`}>{sec.name}</span>
                  {!sec.isGeneral && (
                    <button
                      onClick={e => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setPopover({ type: 'group', id: sec.id!, top: r.bottom + 4, left: r.left - 120 })
                        setPopGrpName(sec.name); setDelConfirm(null)
                      }}
                      className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-[11px] leading-none transition px-0.5"
                    >···</button>
                  )}
                </div>
                {/* phantom add-habit row */}
                {addingIn === gAttr(sec.id) && (
                  <div style={{ height: ROW_H }} className="flex items-center gap-1.5 px-2 border-b border-gray-50 dark:border-gray-800/50 bg-violet-50/40 dark:bg-violet-950/10">
                    <input autoFocus
                      className="flex-1 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 placeholder-gray-400 outline-none focus:border-violet-400 text-gray-900 dark:text-gray-100"
                      placeholder="Habit name" value={newHabitName}
                      onChange={e => setNewHabitName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addHabit(sec.id); if (e.key === 'Escape') { setAddingIn(null); setNewHabitName('') } }}
                    />
                    <button onClick={() => addHabit(sec.id)} className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-2 py-1 rounded">Add</button>
                  </div>
                )}
                {/* habits */}
                {(byGroup.get(sec.id) ?? []).map((h, hIdx) => (
                  <Fragment key={h.id}>
                    {habitGapAt(sec.id, hIdx) && (
                      <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                    )}
                    <div
                      data-hdrop-gid={gAttr(sec.id)} data-hdrop-idx={String(hIdx)}
                      style={{ height: ROW_H, opacity: habitDrag?.habitId === h.id ? 0.3 : 1 }}
                      className="flex items-center gap-1.5 px-2 group border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                    >
                      <span
                        onPointerDown={e => {
                          e.preventDefault()
                          const d: HabitDrag = { habitId: h.id, fromGroupId: sec.id, fromIndex: hIdx, overGroupId: sec.id, overIndex: hIdx }
                          setHabitDrag(d); habitDragRef.current = d
                        }}
                        className="text-gray-300 dark:text-gray-600 cursor-grab text-sm select-none px-0.5 touch-none"
                      >⠿</span>
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1 min-w-0">{h.name}</span>
                      <button
                        onClick={e => {
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                          setPopover({ type: 'habit', id: h.id, top: r.bottom + 4, left: r.left - 120 })
                          setDelConfirm(null)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-[11px] transition"
                      >···</button>
                    </div>
                    {hIdx === (byGroup.get(sec.id) ?? []).length - 1 && habitGapEnd(sec.id) && (
                      <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                    )}
                  </Fragment>
                ))}
                {/* add-habit button for this section */}
                {addingIn !== gAttr(sec.id) && (
                  <div style={{ height: GRP_H }} className="flex items-center px-3 border-b border-gray-50 dark:border-gray-800/30">
                    <button onClick={() => { setAddingIn(gAttr(sec.id)); setNewHabitName('') }}
                      className="text-[11px] text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition">
                      + Add habit
                    </button>
                  </div>
                )}
              </Fragment>
            ))}

            {/* add group */}
            <div className="px-3 py-2">
              {addingGrp ? (
                <div className="flex gap-1.5">
                  <input autoFocus
                    className="flex-1 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 placeholder-gray-400 outline-none focus:border-violet-400 text-gray-900 dark:text-gray-100"
                    placeholder="Group name" value={newGrpName}
                    onChange={e => setNewGrpName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addGroup(); if (e.key === 'Escape') setAddingGrp(false) }}
                  />
                  <button onClick={addGroup} className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-2 py-1 rounded">Add</button>
                </div>
              ) : (
                <button onClick={() => setAddingGrp(true)} className="text-xs text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition">
                  + Add group
                </button>
              )}
            </div>
          </div>

          {/* ── COL 2: Grid ── */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div style={{ minWidth: CELL_W * totalDays }}>
              {/* day headers */}
              <div style={{ height: HDR_H }} className="flex bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                {days.map(day => (
                  <div key={day} style={{ width: CELL_W, flexShrink: 0 }}
                    className={`flex items-center justify-center text-xs ${isCurrentMonth && day === todayD ? 'font-bold text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-gray-500'}`}>
                    {day}
                  </div>
                ))}
              </div>

              {loading ? [1,2,3].map(i => (
                <div key={i} className="flex" style={{ height: ROW_H }}>
                  {days.map(d => (
                    <div key={d} style={{ width: CELL_W, flexShrink: 0 }} className="flex items-center justify-center">
                      <div className="w-4 h-4 rounded-sm border border-gray-100 dark:border-gray-800 animate-pulse bg-gray-50 dark:bg-gray-800" />
                    </div>
                  ))}
                </div>
              )) : sections.map(sec => (
                <Fragment key={String(sec.id)}>
                  {!sec.isGeneral && groupGapAt(sec.gIdx) && (
                    <div style={{ height: GRP_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                  )}
                  {/* group header row in col 2 */}
                  <div
                    data-hdrop-gid={gAttr(sec.id)}
                    style={{ height: GRP_H, opacity: groupDrag?.groupId === sec.id ? 0.3 : 1 }}
                    className="flex items-center border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60"
                  >
                    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 ${
                      sec.isGeneral ? 'text-gray-300 dark:text-gray-700' : 'text-gray-400 dark:text-gray-600'
                    }`}>{sec.name}</span>
                  </div>
                  {/* phantom add row */}
                  {addingIn === gAttr(sec.id) && (
                    <div style={{ height: ROW_H }} className="border-b border-gray-50 dark:border-gray-800/50 bg-violet-50/20 dark:bg-violet-950/10 flex items-center justify-center">
                      <span className="text-[9px] text-violet-400 italic">new habit…</span>
                    </div>
                  )}
                  {/* checkboxes */}
                  {(byGroup.get(sec.id) ?? []).map((h, hIdx) => (
                    <Fragment key={h.id}>
                      {habitGapAt(sec.id, hIdx) && (
                        <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                      )}
                      <div
                        data-hdrop-gid={gAttr(sec.id)} data-hdrop-idx={String(hIdx)}
                        className="flex border-b border-gray-50 dark:border-gray-800/50"
                        style={{ height: ROW_H, opacity: habitDrag?.habitId === h.id ? 0.3 : 1 }}
                      >
                        {days.map(day => {
                          const future = isCurrentMonth && day > todayD
                          const done = completions.has(`${h.id}:${day}`)
                          const isToday = isCurrentMonth && day === todayD
                          return (
                            <div key={day} style={{ width: CELL_W, flexShrink: 0 }}
                              className={`flex items-center justify-center ${isToday ? 'bg-violet-50/50 dark:bg-violet-950/10' : ''}`}>
                              <button
                                onClick={() => !future && toggle(h.id, day)} disabled={future}
                                className={`w-[18px] h-[18px] rounded-[3px] border flex items-center justify-center transition-all duration-150 ${
                                  done ? 'bg-violet-500 border-violet-500' :
                                  future ? 'border-gray-100 dark:border-gray-800 cursor-default' :
                                  'border-gray-300 dark:border-gray-600 hover:border-violet-400 dark:hover:border-violet-500'
                                }`}
                              >{done && <Check />}</button>
                            </div>
                          )
                        })}
                      </div>
                      {hIdx === (byGroup.get(sec.id) ?? []).length - 1 && habitGapEnd(sec.id) && (
                        <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                      )}
                    </Fragment>
                  ))}
                  {/* spacer matching add-habit button row */}
                  {addingIn !== gAttr(sec.id) && (
                    <div style={{ height: GRP_H }} className="border-b border-gray-50 dark:border-gray-800/30" />
                  )}
                </Fragment>
              ))}

              {/* daily bar chart + % strip */}
              {!loading && habits.length > 0 && (
                <div className="border-t-2 border-dashed border-gray-100 dark:border-gray-700">
                  <div className="flex items-end" style={{ height: 72, paddingTop: 8 }}>
                    {dailyCounts.map(({ day, count, future }) => {
                      const barH = future ? 0 : Math.round((count / maxBar) * 56)
                      return (
                        <div key={day} style={{ width: CELL_W, flexShrink: 0 }} className="flex justify-center items-end h-full">
                          <div style={{ width: CELL_W - 6, height: barH }}
                            className={`rounded-t transition-all duration-300 ${
                              !future && count === habits.length && count > 0 ? 'bg-violet-500 dark:bg-violet-600' :
                              !future && count > 0 ? 'bg-violet-300 dark:bg-violet-800' :
                              !future ? 'bg-gray-100 dark:bg-gray-800' : ''
                            }`} />
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex" style={{ height: 28 }}>
                    {dailyCounts.map(({ day, pct, future }) => (
                      <div key={day} style={{ width: CELL_W, flexShrink: 0 }} className="flex flex-col items-center justify-center gap-0.5 px-0.5">
                        {!future ? (
                          <>
                            <div className="w-full h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div style={{ width: `${pct}%` }} className="h-full bg-violet-400 dark:bg-violet-600 rounded-full transition-all" />
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

          {/* ── COL 3: Per-habit bars ── */}
          <div className="flex-shrink-0 border-l border-gray-100 dark:border-gray-800" style={{ width: 184 }}>
            <div style={{ height: HDR_H }} className="flex items-center px-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">% this month</span>
            </div>

            {loading ? [1,2,3].map(i => (
              <div key={i} style={{ height: ROW_H }} className="flex items-center px-3">
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full w-full animate-pulse" />
              </div>
            )) : sections.map(sec => {
              const grpHabits = byGroup.get(sec.id) ?? []
              const grpAvg = grpHabits.length
                ? Math.round(grpHabits.reduce((s, h) => s + (habitPcts.get(h.id) ?? 0), 0) / grpHabits.length)
                : 0
              return (
                <Fragment key={String(sec.id)}>
                  {!sec.isGeneral && groupGapAt(sec.gIdx) && (
                    <div style={{ height: GRP_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                  )}
                  {/* group header row in col 3 */}
                  <div style={{ height: GRP_H, opacity: groupDrag?.groupId === sec.id ? 0.3 : 1 }}
                    className="flex items-center justify-end px-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60">
                    {!sec.isGeneral && grpHabits.length > 0 && (
                      <span className="text-[9px] text-gray-400 dark:text-gray-600 tabular-nums">avg {grpAvg}%</span>
                    )}
                  </div>
                  {/* phantom add row */}
                  {addingIn === gAttr(sec.id) && (
                    <div style={{ height: ROW_H }} className="border-b border-gray-50 dark:border-gray-800/50 bg-violet-50/20 dark:bg-violet-950/10" />
                  )}
                  {/* habit bars */}
                  {grpHabits.map((h, hIdx) => {
                    const pct = habitPcts.get(h.id) ?? 0
                    return (
                      <Fragment key={h.id}>
                        {habitGapAt(sec.id, hIdx) && (
                          <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                        )}
                        <div style={{ height: ROW_H, opacity: habitDrag?.habitId === h.id ? 0.3 : 1 }}
                          className="flex items-center gap-2 px-3 border-b border-gray-50 dark:border-gray-800/50">
                          <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div style={{ width: `${pct}%` }} className="h-full bg-violet-400 dark:bg-violet-600 rounded-full transition-all duration-500" />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right tabular-nums flex-shrink-0">{pct}%</span>
                        </div>
                        {hIdx === grpHabits.length - 1 && habitGapEnd(sec.id) && (
                          <div style={{ height: ROW_H }} className="bg-violet-50 dark:bg-violet-950/30 border-t-2 border-violet-400" />
                        )}
                      </Fragment>
                    )
                  })}
                  {/* spacer matching add-habit button row */}
                  {addingIn !== gAttr(sec.id) && (
                    <div style={{ height: GRP_H }} className="border-b border-gray-50 dark:border-gray-800/30" />
                  )}
                </Fragment>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── ROW 3: Weekly donuts ── */}
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

      {/* ── Popover ── */}
      {popover && (
        <div ref={popRef} style={{ position: 'fixed', top: popover.top, left: popover.left, zIndex: 50 }}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 min-w-[180px]">

          {/* habit popover */}
          {popover.type === 'habit' && popHabit && !delConfirm && (
            <div className="flex flex-col gap-2.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Move to group</p>
                <select
                  className="w-full text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-gray-700 dark:text-gray-300 outline-none focus:border-violet-400"
                  value={popHabit.group_id ?? GEN}
                  onChange={e => moveHabitGroup(popHabit.id, attrToG(e.target.value))}
                >
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  <option value={GEN}>General (ungrouped)</option>
                </select>
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 pt-2">
                <button onClick={() => deleteHabit(popHabit.id)} className="text-xs text-red-500 hover:text-red-600 transition w-full text-left">
                  Delete habit
                </button>
              </div>
            </div>
          )}

          {/* group popover — rename + delete */}
          {popover.type === 'group' && popGroup && !delConfirm && (
            <div className="flex flex-col gap-2.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Rename</p>
                <div className="flex gap-1.5">
                  <input
                    className="flex-1 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 outline-none focus:border-violet-400 text-gray-900 dark:text-gray-100"
                    value={popGrpName} onChange={e => setPopGrpName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renameGroup(popGroup.id, popGrpName) }}
                  />
                  <button onClick={() => renameGroup(popGroup.id, popGrpName)} className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-2 py-1 rounded">Save</button>
                </div>
              </div>
              <div className="border-t border-gray-100 dark:border-gray-800 pt-2">
                <button onClick={() => startDeleteGroup(popGroup.id)} className="text-xs text-red-500 hover:text-red-600 transition w-full text-left">
                  Delete group
                </button>
              </div>
            </div>
          )}

          {/* delete group confirmation */}
          {popover.type === 'group' && popGroup && delConfirm && (
            <div className="flex flex-col gap-2.5">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                <span className="font-medium">{habits.filter(h => h.group_id === delConfirm.groupId).length} habit{habits.filter(h => h.group_id === delConfirm.groupId).length !== 1 ? 's' : ''}</span> in this group.
              </p>
              <div className={delConfirm.deleteAll ? 'opacity-40 pointer-events-none' : ''}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Move habits to</p>
                <select
                  className="w-full text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-gray-700 dark:text-gray-300 outline-none focus:border-violet-400"
                  value={delConfirm.moveToId ?? GEN}
                  onChange={e => setDelConfirm(p => p ? { ...p, moveToId: attrToG(e.target.value) } : p)}
                >
                  {groups.filter(g => g.id !== delConfirm.groupId).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  <option value={GEN}>General (ungrouped)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                <input type="checkbox" checked={delConfirm.deleteAll}
                  onChange={e => setDelConfirm(p => p ? { ...p, deleteAll: e.target.checked } : p)}
                  className="rounded border-gray-300"
                />
                Also delete all habits
              </label>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setDelConfirm(null)} className="flex-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 dark:border-gray-700 rounded py-1 transition">Cancel</button>
                <button onClick={confirmDeleteGroup} className="flex-1 text-xs text-white bg-red-500 hover:bg-red-600 rounded py-1 transition font-medium">Confirm</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
