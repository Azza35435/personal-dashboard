'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { GymSession, GymExercise } from '@/lib/types'

const COLOR_OPTIONS = [
  { label: 'Blue', bg: 'bg-blue-600' },
  { label: 'Violet', bg: 'bg-violet-600' },
  { label: 'Rose', bg: 'bg-rose-600' },
  { label: 'Orange', bg: 'bg-orange-500' },
  { label: 'Emerald', bg: 'bg-emerald-600' },
  { label: 'Slate', bg: 'bg-slate-700' },
]
const DEFAULT_COLOR = 'bg-blue-600'
const COLOR_STORAGE_KEY = 'gym_widget_color'

function getWeekRange(offset: number) {
  const now = new Date()
  const day = now.getDay()
  const mondayDiff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayDiff + offset * 7)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { monday, sunday }
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

const todayStr = () => new Date().toISOString().split('T')[0]
const emptySessionForm = () => ({ date: todayStr(), workout_type: '', duration_minutes: '' })
const EMPTY_EXERCISE = { name: '', sets: '', reps: '', weight_kg: '' }

export default function GymWidget() {
  const [sessions, setSessions] = useState<GymSession[]>([])
  const [exercises, setExercises] = useState<Record<string, GymExercise[]>>({})
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [viewAll, setViewAll] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [addingSession, setAddingSession] = useState(false)
  const [sessionForm, setSessionForm] = useState(emptySessionForm)
  const [addingExerciseTo, setAddingExerciseTo] = useState<string | null>(null)
  const [exerciseForm, setExerciseForm] = useState(EMPTY_EXERCISE)
  const [widgetColor, setWidgetColor] = useState(DEFAULT_COLOR)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(COLOR_STORAGE_KEY)
    if (stored) setWidgetColor(stored)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('gym_sessions').select('*')
    if (viewAll) {
      query = query.order('date', { ascending: false }).limit(50) as typeof query
    } else {
      const { monday, sunday } = getWeekRange(weekOffset)
      query = query
        .gte('date', monday.toISOString().split('T')[0])
        .lte('date', sunday.toISOString().split('T')[0])
        .order('date', { ascending: false }) as typeof query
    }
    const { data: sessionData } = await query
    const loaded = sessionData ?? []
    setSessions(loaded)

    if (loaded.length > 0) {
      const { data: exData } = await supabase
        .from('gym_exercises')
        .select('*')
        .in('session_id', loaded.map(s => s.id))
        .order('position', { ascending: true })
      const grouped: Record<string, GymExercise[]> = {}
      for (const ex of exData ?? []) {
        if (!grouped[ex.session_id]) grouped[ex.session_id] = []
        grouped[ex.session_id].push(ex)
      }
      setExercises(grouped)
    } else {
      setExercises({})
    }
    setLoading(false)
  }, [viewAll, weekOffset])

  useEffect(() => { load() }, [load])

  const changeColor = (bg: string) => {
    setWidgetColor(bg)
    localStorage.setItem(COLOR_STORAGE_KEY, bg)
  }

  const addSession = async () => {
    if (!sessionForm.workout_type.trim()) return
    await supabase.from('gym_sessions').insert({
      date: sessionForm.date,
      workout_type: sessionForm.workout_type.trim(),
      duration_minutes: parseInt(sessionForm.duration_minutes) || null,
    })
    setAddingSession(false)
    setSessionForm(emptySessionForm())
    load()
  }

  const deleteSession = async (id: string) => {
    await supabase.from('gym_sessions').delete().eq('id', id)
    load()
  }

  const addExercise = async (sessionId: string) => {
    if (!exerciseForm.name.trim()) return
    const existing = exercises[sessionId] ?? []
    await supabase.from('gym_exercises').insert({
      session_id: sessionId,
      name: exerciseForm.name.trim(),
      sets: parseInt(exerciseForm.sets) || null,
      reps: parseInt(exerciseForm.reps) || null,
      weight_kg: parseFloat(exerciseForm.weight_kg) || null,
      position: existing.length,
    })
    setAddingExerciseTo(null)
    setExerciseForm(EMPTY_EXERCISE)
    load()
  }

  const deleteExercise = async (id: string) => {
    await supabase.from('gym_exercises').delete().eq('id', id)
    load()
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const { monday, sunday } = getWeekRange(weekOffset)
  const weekLabel = `${monday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${sunday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`

  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-4 ${widgetColor} text-white`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Gym</p>
          {!viewAll ? (
            <div className="flex items-center gap-0.5 mt-0.5">
              <button
                onClick={() => setWeekOffset(o => o - 1)}
                className="opacity-60 hover:opacity-100 text-sm w-5 text-center leading-none"
              >
                ‹
              </button>
              <p className="text-xs opacity-60">{weekLabel}</p>
              <button
                onClick={() => setWeekOffset(o => o + 1)}
                disabled={weekOffset >= 0}
                className="opacity-60 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed text-sm w-5 text-center leading-none"
              >
                ›
              </button>
            </div>
          ) : (
            <p className="text-xs opacity-60 mt-0.5">All sessions</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => { setViewAll(v => !v); setWeekOffset(0) }}
            className="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full transition"
          >
            {viewAll ? 'Week' : 'All'}
          </button>
          <button
            onClick={() => { setAddingSession(s => !s) }}
            className="text-xs bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full transition"
          >
            + Session
          </button>
          <button
            onClick={() => setShowSettings(s => !s)}
            className="opacity-60 hover:opacity-100 transition text-base w-6 text-center"
            title="Widget settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Color picker */}
      {showSettings && (
        <div className="bg-white/10 rounded-xl p-3">
          <p className="text-xs opacity-70 mb-2">Widget colour</p>
          <div className="flex gap-2 flex-wrap">
            {COLOR_OPTIONS.map(opt => (
              <button
                key={opt.bg}
                title={opt.label}
                onClick={() => changeColor(opt.bg)}
                className={`w-6 h-6 rounded-full border-2 transition ${opt.bg} ${widgetColor === opt.bg ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add session form */}
      {addingSession && (
        <div className="bg-white/10 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            <input
              type="date"
              className="col-span-1 bg-white/20 rounded-lg px-2 py-1.5 text-sm outline-none"
              value={sessionForm.date}
              onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))}
            />
            <input
              autoFocus
              className="col-span-2 bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
              placeholder="Workout type (e.g. Push, Legs)"
              value={sessionForm.workout_type}
              onChange={e => setSessionForm(f => ({ ...f, workout_type: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') addSession() }}
            />
          </div>
          <input
            type="number"
            min="1"
            className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
            placeholder="Duration in minutes (optional)"
            value={sessionForm.duration_minutes}
            onChange={e => setSessionForm(f => ({ ...f, duration_minutes: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') addSession() }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setAddingSession(false); setSessionForm(emptySessionForm()) }}
              className="text-xs opacity-60 hover:opacity-100 transition px-2"
            >
              Cancel
            </button>
            <button
              onClick={addSession}
              className="bg-white/90 text-gray-800 font-semibold text-sm px-4 py-1.5 rounded-lg"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Sessions list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="animate-pulse h-12 bg-white/20 rounded-xl" />)}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm opacity-60">
          {viewAll ? 'No sessions logged yet.' : 'No sessions this week.'}
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => {
            const exs = exercises[session.id] ?? []
            const isExpanded = expanded.has(session.id)
            return (
              <div key={session.id} className="bg-white/10 rounded-xl overflow-hidden group">
                <div
                  className="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none"
                  onClick={() => toggleExpand(session.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{session.workout_type}</p>
                    <p className="text-xs opacity-60">
                      {fmtDate(session.date)}
                      {session.duration_minutes ? ` · ${session.duration_minutes} min` : ''}
                      {exs.length > 0 ? ` · ${exs.length} exercise${exs.length !== 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); deleteSession(session.id) }}
                      className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-base leading-none transition"
                    >
                      ×
                    </button>
                    <span className="text-xs opacity-50">{isExpanded ? '▴' : '▾'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-1.5 border-t border-white/10 pt-2">
                    {exs.map(ex => (
                      <div key={ex.id} className="flex items-center justify-between bg-white/10 rounded-lg px-2.5 py-1.5 group/ex">
                        <p className="text-sm flex-1 truncate">{ex.name}</p>
                        <p className="text-xs opacity-60 ml-2 shrink-0">
                          {[
                            ex.sets != null && ex.reps != null ? `${ex.sets}×${ex.reps}` : null,
                            ex.weight_kg != null ? `${ex.weight_kg}kg` : null,
                          ].filter(Boolean).join(' @ ')}
                        </p>
                        <button
                          onClick={() => deleteExercise(ex.id)}
                          className="opacity-0 group-hover/ex:opacity-50 hover:!opacity-100 text-base leading-none ml-2 transition"
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    {addingExerciseTo === session.id ? (
                      <div className="space-y-1.5 mt-1">
                        <input
                          autoFocus
                          className="w-full bg-white/20 rounded-lg px-2.5 py-1.5 text-sm placeholder-white/50 outline-none"
                          placeholder="Exercise name"
                          value={exerciseForm.name}
                          onChange={e => setExerciseForm(f => ({ ...f, name: e.target.value }))}
                        />
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { field: 'sets' as const, placeholder: 'Sets' },
                            { field: 'reps' as const, placeholder: 'Reps' },
                            { field: 'weight_kg' as const, placeholder: 'kg' },
                          ].map(({ field, placeholder }) => (
                            <input
                              key={field}
                              type="number"
                              min="0"
                              step={field === 'weight_kg' ? '0.5' : '1'}
                              className="bg-white/20 rounded-lg px-2 py-1.5 text-sm text-center placeholder-white/50 outline-none"
                              placeholder={placeholder}
                              value={exerciseForm[field]}
                              onChange={e => setExerciseForm(f => ({ ...f, [field]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') addExercise(session.id) }}
                            />
                          ))}
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => { setAddingExerciseTo(null); setExerciseForm(EMPTY_EXERCISE) }}
                            className="text-xs opacity-60 hover:opacity-100 transition px-2"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => addExercise(session.id)}
                            className="bg-white/90 text-gray-800 font-semibold text-xs px-3 py-1.5 rounded-lg"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingExerciseTo(session.id); setExerciseForm(EMPTY_EXERCISE) }}
                        className="text-xs opacity-60 hover:opacity-100 transition mt-0.5"
                      >
                        + Add exercise
                      </button>
                    )}
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
