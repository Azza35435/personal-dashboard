'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { GymSession, GymExercise, GymTemplate, GymTemplateExercise, GymSetRow } from '@/lib/types'

const SESSION_COLORS = [
  { name: 'blue',    hex: '#60a5fa' },
  { name: 'violet',  hex: '#a78bfa' },
  { name: 'rose',    hex: '#fb7185' },
  { name: 'orange',  hex: '#fb923c' },
  { name: 'emerald', hex: '#34d399' },
  { name: 'amber',   hex: '#fbbf24' },
  { name: 'teal',    hex: '#2dd4bf' },
  { name: 'slate',   hex: '#94a3b8' },
]

function colorHex(name: string | null | undefined): string {
  return SESSION_COLORS.find(c => c.name === name)?.hex ?? '#94a3b8'
}

const BORDER_OPTIONS = [
  { label: 'Blue',    border: 'border-l-blue-400',    swatch: 'bg-blue-400' },
  { label: 'Violet',  border: 'border-l-violet-400',  swatch: 'bg-violet-400' },
  { label: 'Rose',    border: 'border-l-rose-400',    swatch: 'bg-rose-400' },
  { label: 'Orange',  border: 'border-l-orange-400',  swatch: 'bg-orange-400' },
  { label: 'Emerald', border: 'border-l-emerald-400', swatch: 'bg-emerald-400' },
  { label: 'Slate',   border: 'border-l-slate-400',   swatch: 'bg-slate-400' },
]
const DEFAULT_BORDER = 'border-l-blue-400'
const BORDER_STORAGE_KEY = 'gym_widget_border'
const NUTRITION_TARGETS_KEY = 'nutrition_targets'

type View = 'month' | 'week' | 'all'
type SetFormRow = { reps: string; weight_kg: string }
type ExFormState = { name: string; sets: SetFormRow[] }
type ExListItem =
  | { kind: 'solo'; ex: GymExercise }
  | { kind: 'super'; groupId: string; exs: GymExercise[] }

const todayStr = () => new Date().toISOString().split('T')[0]
const emptySessionForm = (date?: string) => ({ date: date ?? todayStr(), workout_type: '', duration_minutes: '', color: 'blue' })
const emptyExForm = (): ExFormState => ({ name: '', sets: [{ reps: '', weight_kg: '' }] })

function getWeekRange(offset: number) {
  const now = new Date()
  const dow = now.getDay()
  const mondayDiff = dow === 0 ? -6 : 1 - dow
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayDiff + offset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

function getMonthBounds(offset: number) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { first, last, year: first.getFullYear(), month: first.getMonth() }
}

const isoDate = (d: Date) => d.toISOString().split('T')[0]

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const numDays = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= numDays; d++) cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function fmtExSummary(ex: GymExercise): string {
  const sd = ex.sets_data
  if (sd && sd.length > 0) {
    const sameReps = sd.every(s => s.reps === sd[0].reps)
    const sameWeight = sd.every(s => s.weight_kg === sd[0].weight_kg)
    if (sameReps && sameWeight && sd[0].reps != null) {
      const parts = [`${sd.length}×${sd[0].reps}`]
      if (sd[0].weight_kg != null) parts.push(`${sd[0].weight_kg}kg`)
      return parts.join(' @ ')
    }
    return `${sd.length} sets`
  }
  const parts: string[] = []
  if (ex.sets != null && ex.reps != null) parts.push(`${ex.sets}×${ex.reps}`)
  if (ex.weight_kg != null) parts.push(`${ex.weight_kg}kg`)
  return parts.join(' @ ')
}

function hasPerSetData(ex: GymExercise): boolean {
  return !!(ex.sets_data && ex.sets_data.length > 0)
}

function groupExercises(exs: GymExercise[]): ExListItem[] {
  const items: ExListItem[] = []
  const seen = new Set<string>()
  for (const ex of exs) {
    if (!ex.superset_group) {
      items.push({ kind: 'solo', ex })
    } else if (!seen.has(ex.superset_group)) {
      seen.add(ex.superset_group)
      items.push({ kind: 'super', groupId: ex.superset_group, exs: exs.filter(e => e.superset_group === ex.superset_group) })
    }
  }
  return items
}

export default function GymWidget() {
  const [view, setView] = useState<View>('month')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)

  const [sessions, setSessions] = useState<GymSession[]>([])
  const [exercises, setExercises] = useState<Record<string, GymExercise[]>>({})
  const [loading, setLoading] = useState(true)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [nutritionByDay, setNutritionByDay] = useState<Record<string, { calories: number; protein: number }>>({})
  const [nutritionTargets, setNutritionTargets] = useState({ calories: 2000, protein: 150 })

  const [addingSession, setAddingSession] = useState(false)
  const [sessionForm, setSessionForm] = useState(emptySessionForm())

  const [addingExerciseTo, setAddingExerciseTo] = useState<string | null>(null)
  const [exerciseForm, setExerciseForm] = useState<ExFormState>(emptyExForm())

  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null)
  const [editingExerciseForm, setEditingExerciseForm] = useState<ExFormState>(emptyExForm())

  const [editingSessionTitleId, setEditingSessionTitleId] = useState<string | null>(null)
  const [editingSessionTitle, setEditingSessionTitle] = useState('')

  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [widgetBorder, setWidgetBorder] = useState(DEFAULT_BORDER)
  const [showSettings, setShowSettings] = useState(false)

  const [templates, setTemplates] = useState<GymTemplate[]>([])
  const [templateExercises, setTemplateExercises] = useState<Record<string, GymTemplateExercise[]>>({})
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')

  // Superset state
  const [addingSupersetTo, setAddingSupersetTo] = useState<string | null>(null)
  const [supersetRows, setSupersetRows] = useState<ExFormState[]>([emptyExForm(), emptyExForm()])
  const [selectMode, setSelectMode] = useState<string | null>(null)
  const [selectedExIds, setSelectedExIds] = useState<Set<string>>(new Set())
  const [addingToSuperset, setAddingToSuperset] = useState<{ sessionId: string; groupId: string } | null>(null)

  useEffect(() => {
    const b = localStorage.getItem(BORDER_STORAGE_KEY)
    if (b) setWidgetBorder(b)
    const t = localStorage.getItem(NUTRITION_TARGETS_KEY)
    if (t) { try { const p = JSON.parse(t); setNutritionTargets({ calories: p.calories ?? 2000, protein: p.protein ?? 150 }) } catch {} }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('gym_sessions').select('*')
    if (view === 'week') {
      const { monday, sunday } = getWeekRange(weekOffset)
      query = query.gte('date', isoDate(monday)).lte('date', isoDate(sunday)).order('date', { ascending: false }) as typeof query
    } else if (view === 'month') {
      const { first, last } = getMonthBounds(monthOffset)
      query = query.gte('date', isoDate(first)).lte('date', isoDate(last)).order('date', { ascending: true }) as typeof query
    } else {
      query = query.order('date', { ascending: false }).limit(50) as typeof query
    }
    const { data: sd } = await query
    const loaded = (sd ?? []) as GymSession[]
    setSessions(loaded)
    if (loaded.length > 0) {
      const { data: ed } = await supabase.from('gym_exercises').select('*').in('session_id', loaded.map(s => s.id)).order('position', { ascending: true })
      const grouped: Record<string, GymExercise[]> = {}
      for (const ex of ed ?? []) {
        if (!grouped[ex.session_id]) grouped[ex.session_id] = []
        grouped[ex.session_id].push(ex)
      }
      setExercises(grouped)
    } else {
      setExercises({})
    }
    setLoading(false)
  }, [view, weekOffset, monthOffset])

  const loadMonthNutrition = useCallback(async () => {
    if (view !== 'month') return
    const { first, last } = getMonthBounds(monthOffset)
    const { data } = await supabase.from('nutrition_logs').select('date, calories, protein').gte('date', isoDate(first)).lte('date', isoDate(last))
    const byDay: Record<string, { calories: number; protein: number }> = {}
    for (const row of data ?? []) {
      if (!byDay[row.date]) byDay[row.date] = { calories: 0, protein: 0 }
      byDay[row.date].calories += row.calories ?? 0
      byDay[row.date].protein += row.protein ?? 0
    }
    setNutritionByDay(byDay)
  }, [view, monthOffset])

  const loadTemplates = useCallback(async () => {
    const { data: td } = await supabase.from('gym_templates').select('*').order('created_at', { ascending: false })
    const list = (td ?? []) as GymTemplate[]
    setTemplates(list)
    if (list.length > 0) {
      const { data: ed } = await supabase.from('gym_template_exercises').select('*').in('template_id', list.map(t => t.id)).order('position', { ascending: true })
      const grouped: Record<string, GymTemplateExercise[]> = {}
      for (const ex of ed ?? []) {
        if (!grouped[ex.template_id]) grouped[ex.template_id] = []
        grouped[ex.template_id].push(ex)
      }
      setTemplateExercises(grouped)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadMonthNutrition() }, [loadMonthNutrition])
  useEffect(() => { loadTemplates() }, [loadTemplates])

  const changeBorder = (b: string) => { setWidgetBorder(b); localStorage.setItem(BORDER_STORAGE_KEY, b) }

  const addSession = async () => {
    if (!sessionForm.workout_type.trim()) return
    const { data: newSess } = await supabase
      .from('gym_sessions')
      .insert({ date: sessionForm.date, workout_type: sessionForm.workout_type.trim(), duration_minutes: parseInt(sessionForm.duration_minutes) || null, color: sessionForm.color })
      .select().single()
    if (newSess && selectedTemplateId) {
      const tmplExs = templateExercises[selectedTemplateId] ?? []
      if (tmplExs.length > 0) {
        // Remap superset group UUIDs to fresh ones for this session
        const groupIdMap: Record<string, string> = {}
        for (const ex of tmplExs) {
          if (ex.superset_group && !groupIdMap[ex.superset_group]) {
            groupIdMap[ex.superset_group] = crypto.randomUUID()
          }
        }
        await supabase.from('gym_exercises').insert(
          tmplExs.map(ex => ({
            session_id: newSess.id,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            weight_kg: ex.weight_kg,
            sets_data: ex.sets_data,
            position: ex.position,
            superset_group: ex.superset_group ? (groupIdMap[ex.superset_group] ?? null) : null,
          }))
        )
      }
    }
    const date = sessionForm.date
    setAddingSession(false)
    setSessionForm(emptySessionForm())
    setSelectedTemplateId(null)
    setShowTemplatePicker(false)
    if (view === 'month') setSelectedDate(date)
    load()
    loadMonthNutrition()
  }

  const deleteSession = async (id: string) => {
    await supabase.from('gym_sessions').delete().eq('id', id)
    if (view === 'month') setSelectedDate(null)
    load()
  }

  const buildSetsData = (sets: SetFormRow[]): GymSetRow[] =>
    sets.map(s => ({ reps: parseInt(s.reps) || null, weight_kg: parseFloat(s.weight_kg) || null }))

  const addExercise = async (sessionId: string) => {
    if (!exerciseForm.name.trim()) return
    const existing = exercises[sessionId] ?? []
    const setsData = buildSetsData(exerciseForm.sets)
    await supabase.from('gym_exercises').insert({
      session_id: sessionId,
      name: exerciseForm.name.trim(),
      sets: setsData.length,
      reps: setsData[0]?.reps ?? null,
      weight_kg: setsData[0]?.weight_kg ?? null,
      sets_data: setsData,
      position: existing.length,
    })
    setAddingExerciseTo(null)
    setExerciseForm(emptyExForm())
    load()
  }

  const addSuperset = async (sessionId: string) => {
    const validRows = supersetRows.filter(r => r.name.trim())
    if (validRows.length < 2) return
    const groupId = crypto.randomUUID()
    const existing = exercises[sessionId] ?? []
    const inserts = validRows.map((row, i) => {
      const setsData = buildSetsData(row.sets)
      return {
        session_id: sessionId,
        name: row.name.trim(),
        sets: setsData.length,
        reps: setsData[0]?.reps ?? null,
        weight_kg: setsData[0]?.weight_kg ?? null,
        sets_data: setsData,
        position: existing.length + i,
        superset_group: groupId,
      }
    })
    await supabase.from('gym_exercises').insert(inserts)
    setAddingSupersetTo(null)
    setSupersetRows([emptyExForm(), emptyExForm()])
    load()
  }

  const addExerciseToSuperset = async (sessionId: string, groupId: string) => {
    if (!exerciseForm.name.trim()) return
    const existing = exercises[sessionId] ?? []
    const setsData = buildSetsData(exerciseForm.sets)
    await supabase.from('gym_exercises').insert({
      session_id: sessionId,
      name: exerciseForm.name.trim(),
      sets: setsData.length,
      reps: setsData[0]?.reps ?? null,
      weight_kg: setsData[0]?.weight_kg ?? null,
      sets_data: setsData,
      position: existing.length,
      superset_group: groupId,
    })
    setAddingToSuperset(null)
    setExerciseForm(emptyExForm())
    load()
  }

  const groupAsSuperset = async (sessionId: string) => {
    const ids = Array.from(selectedExIds)
    if (ids.length < 2) return
    const groupId = crypto.randomUUID()
    await supabase.from('gym_exercises').update({ superset_group: groupId }).in('id', ids)
    setSelectMode(null)
    setSelectedExIds(new Set())
    load()
  }

  const removeFromSuperset = async (exId: string, groupId: string, sessionId: string) => {
    const sessionExs = exercises[sessionId] ?? []
    const groupCount = sessionExs.filter(e => e.superset_group === groupId).length
    if (groupCount <= 2) {
      await supabase.from('gym_exercises').update({ superset_group: null }).eq('superset_group', groupId)
    } else {
      await supabase.from('gym_exercises').update({ superset_group: null }).eq('id', exId)
    }
    setEditingExerciseId(null)
    load()
  }

  const dissolveSuperset = async (groupId: string) => {
    await supabase.from('gym_exercises').update({ superset_group: null }).eq('superset_group', groupId)
    setEditingExerciseId(null)
    load()
  }

  const toggleSelectEx = (exId: string) => {
    setSelectedExIds(prev => {
      const n = new Set(prev)
      n.has(exId) ? n.delete(exId) : n.add(exId)
      return n
    })
  }

  const deleteExercise = async (id: string) => {
    const allExs = Object.values(exercises).flat()
    const ex = allExs.find(e => e.id === id)
    if (ex?.superset_group) {
      const sessionExs = exercises[ex.session_id] ?? []
      const groupCount = sessionExs.filter(e => e.superset_group === ex.superset_group).length
      if (groupCount <= 2) {
        await supabase.from('gym_exercises').update({ superset_group: null }).eq('superset_group', ex.superset_group)
      }
    }
    await supabase.from('gym_exercises').delete().eq('id', id)
    load()
  }

  const startEditExercise = (ex: GymExercise) => {
    setEditingExerciseId(ex.id)
    if (ex.sets_data && ex.sets_data.length > 0) {
      setEditingExerciseForm({
        name: ex.name,
        sets: ex.sets_data.map(s => ({ reps: s.reps != null ? String(s.reps) : '', weight_kg: s.weight_kg != null ? String(s.weight_kg) : '' })),
      })
    } else {
      const count = ex.sets ?? 1
      setEditingExerciseForm({
        name: ex.name,
        sets: Array.from({ length: count }, () => ({
          reps: ex.reps != null ? String(ex.reps) : '',
          weight_kg: ex.weight_kg != null ? String(ex.weight_kg) : '',
        })),
      })
    }
  }

  const saveEditExercise = async (id: string) => {
    if (!editingExerciseForm.name.trim()) return
    const setsData = buildSetsData(editingExerciseForm.sets)
    await supabase.from('gym_exercises').update({
      name: editingExerciseForm.name.trim(),
      sets: setsData.length,
      reps: setsData[0]?.reps ?? null,
      weight_kg: setsData[0]?.weight_kg ?? null,
      sets_data: setsData,
    }).eq('id', id)
    setEditingExerciseId(null)
    load()
  }

  const saveSessionTitle = async (id: string) => {
    if (!editingSessionTitle.trim()) return
    await supabase.from('gym_sessions').update({ workout_type: editingSessionTitle.trim() }).eq('id', id)
    setEditingSessionTitleId(null)
    load()
  }

  const saveAsTemplate = async (session: GymSession) => {
    if (!templateName.trim()) return
    const { data: newTmpl } = await supabase
      .from('gym_templates')
      .insert({ name: templateName.trim(), workout_type: session.workout_type, color: session.color ?? 'blue' })
      .select().single()
    if (newTmpl) {
      const exs = exercises[session.id] ?? []
      if (exs.length > 0) {
        await supabase.from('gym_template_exercises').insert(
          exs.map(ex => ({
            template_id: newTmpl.id,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            weight_kg: ex.weight_kg,
            sets_data: ex.sets_data,
            position: ex.position,
            superset_group: ex.superset_group ?? null,
          }))
        )
      }
    }
    setSavingTemplate(null)
    setTemplateName('')
    loadTemplates()
  }

  const deleteTemplate = async (id: string) => {
    await supabase.from('gym_templates').delete().eq('id', id)
    loadTemplates()
  }

  const applyTemplate = (tmpl: GymTemplate) => {
    setSessionForm(f => ({ ...f, workout_type: tmpl.workout_type, color: tmpl.color ?? 'blue' }))
    setSelectedTemplateId(tmpl.id)
    setShowTemplatePicker(false)
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Render helpers (plain functions, NOT React components — avoids remount/focus-jump bug) ──

  const renderColorPicker = (value: string, onChange: (c: string) => void) => (
    <div className="flex items-center gap-2">
      <p className="text-xs text-gray-400 dark:text-gray-500">Colour:</p>
      <div className="flex gap-1.5 flex-wrap">
        {SESSION_COLORS.map(c => (
          <button
            key={c.name}
            title={c.name}
            onClick={() => onChange(c.name)}
            className={`w-4 h-4 rounded-full border-2 transition ${value === c.name ? 'border-gray-900 dark:border-white scale-125' : 'border-transparent opacity-60 hover:opacity-100'}`}
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>
    </div>
  )

  const renderTemplatePicker = (onBack: () => void) => (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Load template</p>
      {templates.length === 0 ? (
        <p className="text-xs text-gray-400">No templates saved yet.</p>
      ) : templates.map(t => (
        <button
          key={t.id}
          onClick={() => applyTemplate(t)}
          className="w-full flex items-center gap-2 bg-white dark:bg-gray-900 rounded px-2.5 py-1.5 border border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 text-left transition group/tmpl"
        >
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colorHex(t.color) }} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{t.name}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{t.workout_type} · {(templateExercises[t.id] ?? []).length} exercise{(templateExercises[t.id] ?? []).length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={e => { e.stopPropagation(); deleteTemplate(t.id) }} className="opacity-0 group-hover/tmpl:opacity-40 hover:!opacity-80 text-gray-500 text-xs transition">×</button>
        </button>
      ))}
      <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">← Back</button>
    </div>
  )

  const renderSetRows = (sets: SetFormRow[], onChange: (sets: SetFormRow[]) => void, onEnter: () => void) => (
    <div className="space-y-1">
      <div className="grid grid-cols-[28px_1fr_1fr_20px] gap-1 px-0.5">
        <div />
        <p className="text-[10px] text-center text-gray-400 dark:text-gray-500">Reps</p>
        <p className="text-[10px] text-center text-gray-400 dark:text-gray-500">kg</p>
        <div />
      </div>
      {sets.map((set, i) => (
        <div key={i} className="grid grid-cols-[28px_1fr_1fr_20px] gap-1 items-center">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right pr-1">{i + 1}</p>
          <input
            type="number" min="0"
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-center placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
            placeholder="—"
            value={set.reps}
            onChange={e => onChange(sets.map((s, j) => j === i ? { ...s, reps: e.target.value } : s))}
            onKeyDown={e => { if (e.key === 'Enter') onEnter() }}
          />
          <input
            type="number" min="0" step="0.5"
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-center placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
            placeholder="—"
            value={set.weight_kg}
            onChange={e => onChange(sets.map((s, j) => j === i ? { ...s, weight_kg: e.target.value } : s))}
            onKeyDown={e => { if (e.key === 'Enter') onEnter() }}
          />
          <button
            onClick={() => onChange(sets.filter((_, j) => j !== i))}
            disabled={sets.length === 1}
            className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 disabled:opacity-0 transition text-base leading-none"
          >×</button>
        </div>
      ))}
      <button
        onClick={() => {
          const last = sets[sets.length - 1]
          onChange([...sets, { reps: last.reps, weight_kg: last.weight_kg }])
        }}
        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition mt-0.5"
      >+ Add set</button>
    </div>
  )

  const renderExerciseRow = (ex: GymExercise, sessionId: string, groupId?: string | null) => {
    const isEditing = editingExerciseId === ex.id
    const sets = ex.sets_data
    const showPerSet = hasPerSetData(ex)

    if (isEditing) {
      return (
        <div key={ex.id} className="bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-600 p-2 space-y-1.5">
          <input
            autoFocus
            className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
            value={editingExerciseForm.name}
            onChange={e => setEditingExerciseForm(f => ({ ...f, name: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Escape') setEditingExerciseId(null) }}
          />
          {renderSetRows(editingExerciseForm.sets, sets => setEditingExerciseForm(f => ({ ...f, sets })), () => saveEditExercise(ex.id))}
          <div className="flex gap-2 justify-end pt-0.5">
            <button onClick={() => setEditingExerciseId(null)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition px-2">Cancel</button>
            <button onClick={() => saveEditExercise(ex.id)} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-xs px-3 py-1 rounded transition">Save</button>
          </div>
          {groupId && (
            <div className="flex gap-3 border-t border-gray-100 dark:border-gray-700 pt-1.5">
              <button onClick={() => removeFromSuperset(ex.id, groupId, sessionId)} className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">Remove from group</button>
              <button onClick={() => dissolveSuperset(groupId)} className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">Dissolve group</button>
            </div>
          )}
        </div>
      )
    }

    return (
      <div key={ex.id} className="bg-white dark:bg-gray-900 rounded border border-gray-100 dark:border-gray-700 group/ex">
        <div
          className="flex items-center justify-between px-2.5 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition"
          onClick={() => startEditExercise(ex)}
        >
          <p className="text-sm flex-1 truncate">{ex.name}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 ml-2 shrink-0">{fmtExSummary(ex)}</p>
          <button
            onClick={e => { e.stopPropagation(); deleteExercise(ex.id) }}
            className="opacity-0 group-hover/ex:opacity-40 hover:!opacity-80 text-gray-500 text-base leading-none ml-2 transition"
          >×</button>
        </div>
        {showPerSet && sets && sets.length > 0 && (
          <div className="px-2.5 pb-1.5 space-y-0.5 border-t border-gray-100 dark:border-gray-700 pt-1">
            {sets.map((s, i) => (
              <p key={i} className="text-[10px] text-gray-400 dark:text-gray-500">
                Set {i + 1}:{' '}
                {[s.reps != null ? `${s.reps} reps` : null, s.weight_kg != null ? `${s.weight_kg}kg` : null].filter(Boolean).join(' @ ') || '—'}
              </p>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderExerciseList = (sessionId: string, exs: GymExercise[]) => {
    const items = groupExercises(exs)
    return items.map((item) => {
      if (item.kind === 'solo') {
        const ex = item.ex
        if (selectMode === sessionId) {
          const isSelected = selectedExIds.has(ex.id)
          return (
            <div key={ex.id} className="flex items-start gap-1.5">
              <button
                onClick={() => toggleSelectEx(ex.id)}
                className={`mt-2 w-3.5 h-3.5 rounded border-2 flex-shrink-0 transition ${isSelected ? 'bg-gray-800 dark:bg-gray-200 border-gray-800 dark:border-gray-200' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900'}`}
              />
              <div className="flex-1 min-w-0">{renderExerciseRow(ex, sessionId)}</div>
            </div>
          )
        }
        return renderExerciseRow(ex, sessionId)
      } else {
        const { groupId, exs: groupExs } = item
        const isAddingHere = addingToSuperset?.groupId === groupId
        return (
          <div key={groupId} className="relative pl-3">
            <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
            <div className="space-y-1">
              {groupExs.map(ex => renderExerciseRow(ex, sessionId, groupId))}
            </div>
            {isAddingHere ? (
              <div className="mt-1 space-y-1.5 bg-gray-50 dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
                <input
                  autoFocus
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                  placeholder="Exercise name"
                  value={exerciseForm.name}
                  onChange={e => setExerciseForm(f => ({ ...f, name: e.target.value }))}
                />
                {renderSetRows(exerciseForm.sets, sets => setExerciseForm(f => ({ ...f, sets })), () => addExerciseToSuperset(sessionId, groupId))}
                <div className="flex gap-2 justify-end pt-0.5">
                  <button onClick={() => { setAddingToSuperset(null); setExerciseForm(emptyExForm()) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition px-2">Cancel</button>
                  <button onClick={() => addExerciseToSuperset(sessionId, groupId)} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-xs px-3 py-1.5 rounded transition">Add</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setAddingToSuperset({ sessionId, groupId }); setExerciseForm(emptyExForm()); setAddingExerciseTo(null); setAddingSupersetTo(null) }}
                className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition mt-1 pl-0.5"
              >+ Add to group</button>
            )}
          </div>
        )
      }
    })
  }

  const renderExerciseAdd = (sessionId: string) => {
    const isAddingHere = addingExerciseTo === sessionId
    const isAddingSuperset = addingSupersetTo === sessionId
    const isInSelectMode = selectMode === sessionId

    if (isAddingHere) {
      return (
        <div className="space-y-1.5 bg-gray-50 dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
          <input
            autoFocus
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
            placeholder="Exercise name"
            value={exerciseForm.name}
            onChange={e => setExerciseForm(f => ({ ...f, name: e.target.value }))}
          />
          {renderSetRows(exerciseForm.sets, sets => setExerciseForm(f => ({ ...f, sets })), () => addExercise(sessionId))}
          <div className="flex gap-2 justify-end pt-0.5">
            <button onClick={() => { setAddingExerciseTo(null); setExerciseForm(emptyExForm()) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition px-2">Cancel</button>
            <button onClick={() => addExercise(sessionId)} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-xs px-3 py-1.5 rounded transition">Add</button>
          </div>
        </div>
      )
    }

    if (isAddingSuperset) {
      return (
        <div className="space-y-2 bg-gray-50 dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
          {supersetRows.map((row, i) => (
            <div key={i} className={i > 0 ? 'border-t border-gray-200 dark:border-gray-700 pt-2 space-y-1.5' : 'space-y-1.5'}>
              <input
                autoFocus={i === 0}
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                placeholder={`Exercise ${i + 1}`}
                value={row.name}
                onChange={e => setSupersetRows(rows => rows.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
              />
              {renderSetRows(row.sets, sets => setSupersetRows(rows => rows.map((r, j) => j === i ? { ...r, sets } : r)), () => addSuperset(sessionId))}
            </div>
          ))}
          <button
            onClick={() => setSupersetRows(rows => [...rows, emptyExForm()])}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
          >+ Add exercise</button>
          <div className="flex gap-2 justify-end pt-0.5">
            <button onClick={() => { setAddingSupersetTo(null); setSupersetRows([emptyExForm(), emptyExForm()]) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition px-2">Cancel</button>
            <button onClick={() => addSuperset(sessionId)} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-xs px-3 py-1.5 rounded transition">Save superset</button>
          </div>
        </div>
      )
    }

    if (isInSelectMode) {
      return (
        <div className="flex items-center gap-2">
          {selectedExIds.size >= 2 && (
            <button onClick={() => groupAsSuperset(sessionId)} className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium px-2.5 py-1 rounded transition">
              Group ({selectedExIds.size})
            </button>
          )}
          <button onClick={() => { setSelectMode(null); setSelectedExIds(new Set()) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
            Cancel
          </button>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => { setAddingExerciseTo(sessionId); setExerciseForm(emptyExForm()); setAddingSupersetTo(null); setAddingToSuperset(null) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
          + Add exercise
        </button>
        <button onClick={() => { setAddingSupersetTo(sessionId); setSupersetRows([emptyExForm(), emptyExForm()]); setAddingExerciseTo(null); setAddingToSuperset(null) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
          + Add superset
        </button>
        <button onClick={() => { setSelectMode(sessionId); setSelectedExIds(new Set()); setAddingExerciseTo(null); setAddingSupersetTo(null); setAddingToSuperset(null) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
          Select
        </button>
      </div>
    )
  }

  // ── Month helpers ──
  const { first: mFirst, year: mYear, month: mMonth } = getMonthBounds(monthOffset)
  const monthLabel = mFirst.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  const weeks = buildMonthGrid(mYear, mMonth)
  const sessionByDate: Record<string, GymSession> = {}
  for (const s of sessions) sessionByDate[s.date] = s
  const today = todayStr()

  function nutritionTint(d: string): 'green' | 'orange' | null {
    const nd = nutritionByDay[d]
    if (!nd) return null
    if (nd.calories >= nutritionTargets.calories && nd.protein >= nutritionTargets.protein) return 'green'
    return 'orange'
  }

  const selectedSession = selectedDate ? (sessionByDate[selectedDate] ?? null) : null
  const selectedExercises = selectedSession ? (exercises[selectedSession.id] ?? []) : []
  const { monday, sunday } = getWeekRange(weekOffset)
  const weekLabel = `${monday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`

  return (
    <div className={`rounded p-5 flex flex-col gap-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 ${widgetBorder} shadow-sm text-gray-900 dark:text-gray-100`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Gym</p>
          {view === 'week' && (
            <div className="flex items-center gap-0.5 mt-0.5">
              <button onClick={() => setWeekOffset(o => o - 1)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm w-5 text-center leading-none transition">‹</button>
              <p className="text-xs text-gray-400 dark:text-gray-500">{weekLabel}</p>
              <button onClick={() => setWeekOffset(o => o + 1)} disabled={weekOffset >= 0} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-20 disabled:cursor-not-allowed text-sm w-5 text-center leading-none transition">›</button>
            </div>
          )}
          {view === 'month' && (
            <div className="flex items-center gap-0.5 mt-0.5">
              <button onClick={() => { setMonthOffset(o => o - 1); setSelectedDate(null); setAddingSession(false) }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm w-5 text-center leading-none transition">‹</button>
              <p className="text-xs text-gray-400 dark:text-gray-500">{monthLabel}</p>
              <button onClick={() => { setMonthOffset(o => o + 1); setSelectedDate(null); setAddingSession(false) }} disabled={monthOffset >= 0} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-20 disabled:cursor-not-allowed text-sm w-5 text-center leading-none transition">›</button>
            </div>
          )}
          {view === 'all' && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">All sessions</p>}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
            {(['month', 'week', 'all'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => {
                  setView(v); setWeekOffset(0); setSelectedDate(null); setAddingSession(false)
                  setShowTemplatePicker(false); setSelectedTemplateId(null)
                  setAddingSupersetTo(null); setSupersetRows([emptyExForm(), emptyExForm()])
                  setSelectMode(null); setSelectedExIds(new Set()); setAddingToSuperset(null)
                }}
                className={`px-2.5 py-1 capitalize transition ${view === v ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >{v}</button>
            ))}
          </div>
          {view !== 'month' && (
            <button
              onClick={() => { setAddingSession(s => !s); setSelectedTemplateId(null); setShowTemplatePicker(false) }}
              className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 transition"
            >+ Session</button>
          )}
          <button onClick={() => setShowSettings(s => !s)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition text-base w-6 text-center" title="Widget accent colour">⚙</button>
        </div>
      </div>

      {/* Border settings */}
      {showSettings && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Widget accent colour</p>
          <div className="flex gap-2 flex-wrap">
            {BORDER_OPTIONS.map(opt => (
              <button key={opt.border} title={opt.label} onClick={() => changeBorder(opt.border)}
                className={`w-5 h-5 rounded-full border-2 transition ${opt.swatch} ${widgetBorder === opt.border ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── MONTH VIEW ── */}
      {view === 'month' && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-7">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-semibold text-gray-400 dark:text-gray-500 pb-1">{d}</div>
            ))}
          </div>
          <div className="flex flex-col gap-0.5">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-0.5">
                {week.map((dateStr, di) => {
                  if (!dateStr) return <div key={di} style={{ minHeight: 40 }} />
                  const session = sessionByDate[dateStr]
                  const tint = nutritionTint(dateStr)
                  const isToday = dateStr === today
                  const isSelected = dateStr === selectedDate
                  const day = parseInt(dateStr.split('-')[2])
                  return (
                    <button
                      key={dateStr}
                      onClick={() => {
                        if (isSelected) { setSelectedDate(null); setAddingSession(false); setSessionForm(emptySessionForm()); setSelectedTemplateId(null); setShowTemplatePicker(false) }
                        else { setSelectedDate(dateStr); setAddingSession(!session); setSessionForm(emptySessionForm(dateStr)); setSelectedTemplateId(null); setShowTemplatePicker(false) }
                      }}
                      className={`flex flex-col items-center rounded overflow-hidden border transition ${isSelected ? 'border-gray-500 dark:border-gray-400' : isToday ? 'border-gray-400 dark:border-gray-500' : 'border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500'} bg-white dark:bg-gray-900`}
                      style={{ minHeight: 40 }}
                    >
                      <div
                        className={`w-full flex-1 flex items-center justify-center text-[11px] ${isToday ? 'font-bold' : 'font-medium'} text-gray-700 dark:text-gray-300`}
                        style={{ backgroundColor: tint === 'green' ? 'rgba(52,211,153,0.18)' : tint === 'orange' ? 'rgba(251,146,60,0.18)' : undefined }}
                      >{day}</div>
                      <div className="w-full flex-shrink-0" style={{ height: 5, backgroundColor: session ? colorHex(session.color) : 'transparent' }} />
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-0.5">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(52,211,153,0.35)' }} /><span className="text-[10px] text-gray-400 dark:text-gray-500">Targets hit</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(251,146,60,0.35)' }} /><span className="text-[10px] text-gray-400 dark:text-gray-500">Targets missed</span></div>
          </div>

          {/* Slide-in panel */}
          {selectedDate && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
              {selectedSession && !addingSession ? (
                <div className="p-3 space-y-2.5">
                  {/* Session header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: colorHex(selectedSession.color) }} />
                      <div>
                        {editingSessionTitleId === selectedSession.id ? (
                          <input
                            autoFocus
                            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-0.5 text-sm font-medium outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                            value={editingSessionTitle}
                            onChange={e => setEditingSessionTitle(e.target.value)}
                            onBlur={() => saveSessionTitle(selectedSession.id)}
                            onKeyDown={e => { if (e.key === 'Enter') saveSessionTitle(selectedSession.id); if (e.key === 'Escape') setEditingSessionTitleId(null) }}
                          />
                        ) : (
                          <p className="text-sm font-medium cursor-text hover:text-gray-500 dark:hover:text-gray-400 transition" onClick={() => { setEditingSessionTitleId(selectedSession.id); setEditingSessionTitle(selectedSession.workout_type) }}>{selectedSession.workout_type}</p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500">{fmtDate(selectedSession.date)}{selectedSession.duration_minutes ? ` · ${selectedSession.duration_minutes} min` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSavingTemplate(selectedSession.id)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">Save template</button>
                      <button onClick={() => deleteSession(selectedSession.id)} className="text-xs text-red-400 hover:text-red-600 transition">Delete</button>
                    </div>
                  </div>
                  {savingTemplate === selectedSession.id && (
                    <div className="flex gap-2">
                      <input autoFocus className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition" placeholder="Template name" value={templateName} onChange={e => setTemplateName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveAsTemplate(selectedSession) }} />
                      <button onClick={() => saveAsTemplate(selectedSession)} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium px-3 rounded transition">Save</button>
                      <button onClick={() => { setSavingTemplate(null); setTemplateName('') }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition px-1">Cancel</button>
                    </div>
                  )}
                  <div className="space-y-1">
                    {selectedExercises.length === 0 && <p className="text-xs text-gray-400">No exercises logged.</p>}
                    {renderExerciseList(selectedSession.id, selectedExercises)}
                  </div>
                  {renderExerciseAdd(selectedSession.id)}
                </div>
              ) : addingSession && selectedDate ? (
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{fmtDate(selectedDate)}</p>
                    <button onClick={() => { setSelectedDate(null); setAddingSession(false); setSessionForm(emptySessionForm()); setSelectedTemplateId(null); setShowTemplatePicker(false) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">Cancel</button>
                  </div>
                  {templates.length > 0 && !showTemplatePicker && (
                    <button onClick={() => setShowTemplatePicker(true)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">Load template →</button>
                  )}
                  {showTemplatePicker ? renderTemplatePicker(() => setShowTemplatePicker(false)) : (
                    <>
                      <input autoFocus className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition" placeholder="Workout type (e.g. Push, Legs)" value={sessionForm.workout_type} onChange={e => setSessionForm(f => ({ ...f, workout_type: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addSession() }} />
                      <input type="number" min="1" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition" placeholder="Duration in minutes (optional)" value={sessionForm.duration_minutes} onChange={e => setSessionForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                      {renderColorPicker(sessionForm.color, c => setSessionForm(f => ({ ...f, color: c })))}
                      {selectedTemplateId && <p className="text-[10px] text-gray-400 dark:text-gray-500">Template loaded — exercises will be added automatically.</p>}
                      <div className="flex justify-end">
                        <button onClick={addSession} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm px-4 py-1.5 rounded transition">Save</button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ── WEEK / ALL VIEWS ── */}
      {view !== 'month' && (
        <>
          {addingSession && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-2 border border-gray-200 dark:border-gray-700">
              {templates.length > 0 && !showTemplatePicker && (
                <button onClick={() => setShowTemplatePicker(true)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">Load template →</button>
              )}
              {showTemplatePicker ? renderTemplatePicker(() => setShowTemplatePicker(false)) : (
                <>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input type="date" className="col-span-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition" value={sessionForm.date} onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))} />
                    <input autoFocus className="col-span-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition" placeholder="Workout type (e.g. Push, Legs)" value={sessionForm.workout_type} onChange={e => setSessionForm(f => ({ ...f, workout_type: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addSession() }} />
                  </div>
                  <input type="number" min="1" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition" placeholder="Duration in minutes (optional)" value={sessionForm.duration_minutes} onChange={e => setSessionForm(f => ({ ...f, duration_minutes: e.target.value }))} />
                  {renderColorPicker(sessionForm.color, c => setSessionForm(f => ({ ...f, color: c })))}
                  {selectedTemplateId && <p className="text-[10px] text-gray-400 dark:text-gray-500">Template loaded — exercises added automatically.</p>}
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setAddingSession(false); setSessionForm(emptySessionForm()); setSelectedTemplateId(null); setShowTemplatePicker(false) }} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition px-2">Cancel</button>
                    <button onClick={addSession} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm px-4 py-1.5 rounded transition">Save</button>
                  </div>
                </>
              )}
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="animate-pulse h-12 bg-gray-200 dark:bg-gray-700 rounded" />)}
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-400">{view === 'all' ? 'No sessions logged yet.' : 'No sessions this week.'}</p>
          ) : (
            <div className="space-y-2">
              {sessions.map(session => {
                const exs = exercises[session.id] ?? []
                const isExpanded = expanded.has(session.id)
                const hex = colorHex(session.color)
                return (
                  <div key={session.id} className="bg-gray-50 dark:bg-gray-800 rounded overflow-hidden group border border-gray-100 dark:border-gray-700" style={{ borderLeft: `3px solid ${hex}` }}>
                    <div className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleExpand(session.id)}>
                      <div className="flex-1 min-w-0">
                        {editingSessionTitleId === session.id ? (
                          <input autoFocus className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-0.5 text-sm font-medium outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition" value={editingSessionTitle} onChange={e => setEditingSessionTitle(e.target.value)} onBlur={() => saveSessionTitle(session.id)} onKeyDown={e => { if (e.key === 'Enter') saveSessionTitle(session.id); if (e.key === 'Escape') setEditingSessionTitleId(null) }} onClick={e => e.stopPropagation()} />
                        ) : (
                          <p className="text-sm font-medium cursor-text" onClick={e => { e.stopPropagation(); setEditingSessionTitleId(session.id); setEditingSessionTitle(session.workout_type) }}>{session.workout_type}</p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500">{fmtDate(session.date)}{session.duration_minutes ? ` · ${session.duration_minutes} min` : ''}{exs.length > 0 ? ` · ${exs.length} exercise${exs.length !== 1 ? 's' : ''}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setSavingTemplate(session.id); setTemplateName('') }} className="opacity-0 group-hover:opacity-40 hover:!opacity-80 text-gray-500 text-xs transition">template</button>
                        <button onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); deleteSession(session.id) }} className="opacity-0 group-hover:opacity-40 hover:!opacity-80 text-gray-500 text-base leading-none transition">×</button>
                        <span className="text-xs text-gray-400">{isExpanded ? '▴' : '▾'}</span>
                      </div>
                    </div>
                    {savingTemplate === session.id && (
                      <div className="px-3 pb-2 pt-1 flex gap-2 border-t border-gray-200 dark:border-gray-700">
                        <input autoFocus className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition" placeholder="Template name" value={templateName} onChange={e => setTemplateName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveAsTemplate(session) }} />
                        <button onClick={() => saveAsTemplate(session)} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium px-3 rounded transition">Save</button>
                        <button onClick={() => { setSavingTemplate(null); setTemplateName('') }} className="text-xs text-gray-400 hover:text-gray-600 transition px-1">Cancel</button>
                      </div>
                    )}
                    {isExpanded && (
                      <div className="px-3 pb-3 space-y-1.5 border-t border-gray-200 dark:border-gray-700 pt-2">
                        {renderExerciseList(session.id, exs)}
                        {renderExerciseAdd(session.id)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
