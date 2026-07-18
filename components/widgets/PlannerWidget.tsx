'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DayTimeline from '@/components/planner/DayTimeline'
import WeekGrid from '@/components/planner/WeekGrid'
import TodoTray from '@/components/planner/TodoTray'
import RoutinesPanel from '@/components/planner/RoutinesPanel'
import {
  COLOR_KEYS,
  PLANNER_COLORS,
  localDateStr,
  minToTimeInput,
  mondayIndex,
  timeInputToMin,
  type DayItem,
} from '@/lib/planner'
import { useIsMobile } from '@/lib/useIsMobile'
import type { PlannerBlock, PlannerRoutine, Todo } from '@/lib/types'

const ROLLOVER_KEY = 'planner_rollover_dismissed'

interface EditorState {
  mode: 'edit' | 'new'
  item?: DayItem // edit mode
  date: string
  anchor: { x: number; y: number } | null
  // form fields
  title: string
  start: string // HH:MM
  end: string
  color: string
  note: string
}

function weekDays(anchor: Date): Date[] {
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - mondayIndex(anchor))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

export default function PlannerWidget() {
  const isMobile = useIsMobile()
  const [viewState, setViewState] = useState<'day' | 'week'>('day')
  const view = isMobile ? 'day' : viewState // phones are Day-only
  const setView = setViewState
  const [current, setCurrent] = useState<Date>(new Date())
  const [blocks, setBlocks] = useState<PlannerBlock[]>([])
  const [routines, setRoutines] = useState<PlannerRoutine[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [todoDone, setTodoDone] = useState<Map<string, boolean>>(new Map())
  const [scheduledTodoIds, setScheduledTodoIds] = useState<Set<string>>(new Set())
  const [gcalByDate, setGcalByDate] = useState<Map<string, DayItem[]>>(new Map())
  const [calConnected, setCalConnected] = useState(true)
  const [showRoutines, setShowRoutines] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [pickedTodo, setPickedTodo] = useState<Todo | null>(null)
  const [rollover, setRollover] = useState<PlannerBlock[]>([])

  const days = useMemo(() => (view === 'day' ? [current] : weekDays(current)), [view, current])
  const dateStrs = useMemo(() => days.map(localDateStr), [days])
  const todayStr = localDateStr(new Date())
  const rangeKey = dateStrs.join(',')

  // ── data loading ──
  const load = useCallback(async () => {
    const [{ data: blockRows }, { data: routineRows }, { data: todoRows }, { data: schedRows }] = await Promise.all([
      supabase.from('planner_blocks').select('*').in('date', dateStrs),
      supabase.from('planner_routines').select('*').order('start_min'),
      supabase.from('todos').select('*').eq('completed', false).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('planner_blocks').select('todo_id').not('todo_id', 'is', null).gte('date', todayStr),
    ])
    const bs = (blockRows ?? []) as PlannerBlock[]
    setBlocks(bs)
    setRoutines((routineRows ?? []) as PlannerRoutine[])
    setTodos((todoRows ?? []) as Todo[])
    setScheduledTodoIds(new Set((schedRows ?? []).map(r => r.todo_id as string)))

    // completion state of todos linked from visible blocks (for done derivation)
    const linkedIds = [...new Set(bs.map(b => b.todo_id).filter((x): x is string => !!x))]
    if (linkedIds.length > 0) {
      const { data: linked } = await supabase.from('todos').select('id, completed').in('id', linkedIds)
      setTodoDone(new Map((linked ?? []).map(t => [t.id, t.completed])))
    } else {
      setTodoDone(new Map())
    }
  }, [rangeKey, todayStr]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
  }, [load])

  // Google Calendar overlay (read-only)
  useEffect(() => {
    const start = new Date(days[0])
    start.setHours(0, 0, 0, 0)
    const end = new Date(days[days.length - 1])
    end.setHours(23, 59, 59, 999)
    fetch(`/api/calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`)
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) {
          setCalConnected(!(data?.notConnected === true))
          setGcalByDate(new Map())
          return
        }
        setCalConnected(true)
        const map = new Map<string, DayItem[]>()
        for (const e of data) {
          if (!e.start?.dateTime || !e.end?.dateTime) continue // skip all-day
          const s = new Date(e.start.dateTime)
          const en = new Date(e.end.dateTime)
          const ds = localDateStr(s)
          const item: DayItem = {
            key: `gcal:${e.id}:${ds}`,
            kind: 'gcal',
            title: e.summary ?? '(untitled)',
            start: s.getHours() * 60 + s.getMinutes(),
            end: localDateStr(en) === ds ? en.getHours() * 60 + en.getMinutes() : 24 * 60,
            color: 'slate',
          }
          if (item.end <= item.start) continue
          if (!map.has(ds)) map.set(ds, [])
          map.get(ds)!.push(item)
        }
        setGcalByDate(map)
      })
      .catch(() => setGcalByDate(new Map()))
  }, [rangeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Roll-over: yesterday's unfinished blocks (fetched once; rendering is
  // gated to the today/day view below)
  useEffect(() => {
    if (view !== 'day' || localDateStr(current) !== todayStr) return
    if (localStorage.getItem(ROLLOVER_KEY) === todayStr) return
    const y = new Date()
    y.setDate(y.getDate() - 1)
    supabase
      .from('planner_blocks')
      .select('*')
      .eq('date', localDateStr(y))
      .eq('done', false)
      .eq('hidden', false)
      .is('routine_id', null)
      .then(({ data }) => setRollover((data ?? []) as PlannerBlock[]))
  }, [view, current, todayStr])

  // ── derive render items per date ──
  const itemsByDate = useMemo(() => {
    const map = new Map<string, DayItem[]>()
    for (const ds of dateStrs) {
      const items: DayItem[] = []
      const dayBlocks = blocks.filter(b => b.date === ds)
      for (const b of dayBlocks) {
        if (b.hidden) continue
        items.push({
          key: b.id,
          kind: 'block',
          blockId: b.id,
          routineId: b.routine_id ?? undefined,
          todoId: b.todo_id,
          title: b.title,
          start: b.start_min,
          end: b.end_min,
          color: b.color,
          note: b.note,
          done: b.done || (b.todo_id != null && todoDone.get(b.todo_id) === true),
        })
      }
      const d = new Date(ds + 'T00:00:00')
      const wd = mondayIndex(d)
      for (const r of routines) {
        if (!r.active || !r.days.includes(wd)) continue
        if (dayBlocks.some(b => b.routine_id === r.id)) continue // override exists
        items.push({
          key: `routine:${r.id}:${ds}`,
          kind: 'routine',
          routineId: r.id,
          title: r.title,
          start: r.start_min,
          end: r.start_min + r.duration_min,
          color: r.color,
          done: false,
        })
      }
      items.push(...(gcalByDate.get(ds) ?? []))
      map.set(ds, items)
    }
    return map
  }, [dateStrs, blocks, routines, gcalByDate, todoDone])

  // ── mutations ──
  const materializeRoutine = async (item: DayItem, date: string, overrides: Partial<PlannerBlock>) => {
    const r = routines.find(x => x.id === item.routineId)
    if (!r) return
    await supabase.from('planner_blocks').insert({
      date,
      start_min: item.start,
      end_min: item.end,
      title: r.title,
      color: r.color,
      routine_id: r.id,
      ...overrides,
    })
    load()
  }

  const currentDateStr = localDateStr(current)

  const openEditorFor = (item: DayItem, rect: DOMRect) => {
    setEditor({
      mode: 'edit',
      item,
      date: currentDateStr,
      anchor: { x: rect.left, y: rect.bottom },
      title: item.title,
      start: minToTimeInput(item.start),
      end: minToTimeInput(item.end),
      color: item.color,
      note: item.note ?? '',
    })
  }

  const createByDrag = async (startMin: number, endMin: number, anchor: DOMRect) => {
    const { data } = await supabase
      .from('planner_blocks')
      .insert({ date: currentDateStr, start_min: startMin, end_min: endMin, title: 'New block' })
      .select()
      .single()
    await load()
    if (data) {
      const b = data as PlannerBlock
      openEditorFor(
        {
          key: b.id, kind: 'block', blockId: b.id, todoId: b.todo_id,
          title: b.title, start: b.start_min, end: b.end_min, color: b.color, note: b.note, done: b.done,
        },
        anchor
      )
    }
  }

  const moveResize = async (item: DayItem, startMin: number, endMin: number) => {
    if (item.kind === 'block') {
      setBlocks(prev => prev.map(b => (b.id === item.blockId ? { ...b, start_min: startMin, end_min: endMin } : b)))
      await supabase.from('planner_blocks').update({ start_min: startMin, end_min: endMin }).eq('id', item.blockId!)
      load()
    } else if (item.kind === 'routine') {
      await materializeRoutine({ ...item, start: startMin, end: endMin }, currentDateStr, {})
    }
  }

  const toggleDone = async (item: DayItem) => {
    if (item.kind === 'routine') {
      await materializeRoutine(item, currentDateStr, { done: true })
      return
    }
    if (item.kind !== 'block') return
    const newDone = !item.done
    setBlocks(prev => prev.map(b => (b.id === item.blockId ? { ...b, done: newDone } : b)))
    await supabase.from('planner_blocks').update({ done: newDone }).eq('id', item.blockId!)
    if (item.todoId) {
      await supabase.from('todos').update({ completed: newDone }).eq('id', item.todoId)
    }
    load()
  }

  const saveEditor = async () => {
    if (!editor || !editor.title.trim()) return
    const fields = {
      title: editor.title.trim(),
      start_min: timeInputToMin(editor.start),
      end_min: Math.max(timeInputToMin(editor.start) + 15, timeInputToMin(editor.end)),
      color: editor.color,
      note: editor.note.trim() || null,
    }
    if (editor.mode === 'new') {
      await supabase.from('planner_blocks').insert({ date: editor.date, ...fields })
    } else if (editor.item!.kind === 'block') {
      await supabase.from('planner_blocks').update(fields).eq('id', editor.item!.blockId!)
    } else if (editor.item!.kind === 'routine') {
      await supabase.from('planner_blocks').insert({ date: editor.date, routine_id: editor.item!.routineId, ...fields })
    }
    setEditor(null)
    load()
  }

  const deleteFromEditor = async () => {
    if (!editor || editor.mode === 'new') {
      setEditor(null)
      return
    }
    const item = editor.item!
    if (item.kind === 'block') {
      await supabase.from('planner_blocks').delete().eq('id', item.blockId!)
    } else if (item.kind === 'routine') {
      // skip just this day
      await supabase.from('planner_blocks').insert({
        date: editor.date, routine_id: item.routineId, start_min: item.start, end_min: item.end,
        title: item.title, hidden: true,
      })
    }
    setEditor(null)
    load()
  }

  const placeTodo = async (todo: Todo, startMin: number) => {
    setPickedTodo(null)
    await supabase.from('planner_blocks').insert({
      date: currentDateStr,
      start_min: startMin,
      end_min: startMin + 30,
      title: todo.title,
      color: 'slate',
      todo_id: todo.id,
    })
    load()
  }

  const reschedule = async () => {
    await supabase.from('planner_blocks').insert(
      rollover.map(b => ({
        date: todayStr, start_min: b.start_min, end_min: b.end_min, title: b.title,
        color: b.color, note: b.note, todo_id: b.todo_id,
      }))
    )
    localStorage.setItem(ROLLOVER_KEY, todayStr)
    setRollover([])
    load()
  }

  const dismissRollover = () => {
    localStorage.setItem(ROLLOVER_KEY, todayStr)
    setRollover([])
  }

  // routines CRUD
  const addRoutine = async (r: { title: string; start_min: number; duration_min: number; days: number[]; color: string }) => {
    await supabase.from('planner_routines').insert(r)
    load()
  }
  const toggleRoutine = async (r: PlannerRoutine) => {
    await supabase.from('planner_routines').update({ active: !r.active }).eq('id', r.id)
    load()
  }
  const deleteRoutine = async (r: PlannerRoutine) => {
    await supabase.from('planner_routines').delete().eq('id', r.id)
    load()
  }

  // nav
  const shift = (dir: -1 | 1) => {
    const d = new Date(current)
    d.setDate(d.getDate() + dir * (view === 'day' ? 1 : 7))
    setCurrent(d)
  }

  const headerLabel =
    view === 'day'
      ? current.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
      : (() => {
          const ds = weekDays(current)
          return `${ds[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${ds[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
        })()

  const isViewingToday = currentDateStr === todayStr

  const inputCls =
    'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder-gray-400 px-2 py-1.5 text-sm outline-none'

  return (
    <div className="flex-1 overflow-hidden h-full flex flex-col p-3 sm:p-6 pb-14 md:pb-6 text-gray-900 dark:text-gray-100">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2 mb-4 flex-shrink-0">
        <h1 className="text-xl font-semibold mr-2">Planner</h1>
        <div className="hidden md:flex rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
          {(['day', 'week'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-sm capitalize transition-colors ${
                view === v
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 text-sm">‹</button>
          <span className="text-sm font-medium min-w-[180px] text-center">{headerLabel}</span>
          <button onClick={() => shift(1)} className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 text-sm">›</button>
          {!isViewingToday && (
            <button
              onClick={() => setCurrent(new Date())}
              className="text-xs px-2.5 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 ml-1"
            >
              Today
            </button>
          )}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowRoutines(s => !s)}
          className={`text-sm px-3 py-1.5 rounded border transition-colors ${
            showRoutines
              ? 'border-gray-900 dark:border-white text-gray-900 dark:text-gray-100'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          🔁 Routines
        </button>
        <button
          onClick={() =>
            setEditor({
              mode: 'new', date: currentDateStr, anchor: null,
              title: '', start: '09:00', end: '09:30', color: 'blue', note: '',
            })
          }
          className="text-sm bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-3 py-1.5 font-medium hover:opacity-90 transition-opacity"
        >
          + Block
        </button>
      </div>

      {showRoutines && (
        <RoutinesPanel routines={routines} onAdd={addRoutine} onToggleActive={toggleRoutine} onDelete={deleteRoutine} />
      )}

      {!calConnected && (
        <div className="mb-3 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded px-3 py-2 flex-shrink-0">
          Google Calendar isn&apos;t connected, so existing events can&apos;t be shown —{' '}
          <Link href="/settings" className="underline underline-offset-2">connect it in Settings</Link>.
        </div>
      )}

      {rollover.length > 0 && view === 'day' && isViewingToday && (
        <div className="mb-3 flex items-center gap-3 text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded px-3 py-2 flex-shrink-0">
          <span className="flex-1 text-amber-800 dark:text-amber-300">
            {rollover.length} unfinished block{rollover.length === 1 ? '' : 's'} from yesterday
          </span>
          <button onClick={reschedule} className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-2.5 py-1 font-medium">
            Reschedule to today
          </button>
          <button onClick={dismissRollover} className="text-xs text-gray-500 dark:text-gray-400">Dismiss</button>
        </div>
      )}

      {pickedTodo && (
        <div className="mb-3 flex items-center gap-3 text-sm bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900 rounded px-3 py-2 flex-shrink-0">
          <span className="flex-1 text-violet-800 dark:text-violet-300">
            Placing &ldquo;{pickedTodo.title}&rdquo; — click a time on the planner
          </span>
          <button onClick={() => setPickedTodo(null)} className="text-xs text-gray-500 dark:text-gray-400">Cancel</button>
        </div>
      )}

      {/* body */}
      <div className="flex-1 min-h-0 flex gap-4">
        {view === 'day' ? (
          <DayTimeline
            items={itemsByDate.get(currentDateStr) ?? []}
            isToday={isViewingToday}
            tapFirst={isMobile}
            placeMode={!!pickedTodo}
            onOpenEditor={openEditorFor}
            onCreateByDrag={createByDrag}
            onMoveResize={moveResize}
            onToggleDone={toggleDone}
            onPlace={min => pickedTodo && placeTodo(pickedTodo, min)}
          />
        ) : (
          <WeekGrid
            days={days}
            itemsByDate={itemsByDate}
            onSelectDay={d => {
              setCurrent(d)
              setView('day')
            }}
          />
        )}
        <TodoTray
          todos={todos}
          scheduledTodoIds={scheduledTodoIds}
          pickedTodoId={pickedTodo?.id ?? null}
          onPick={setPickedTodo}
          onDropOnTimeline={(todo, min) => {
            if (view === 'day') placeTodo(todo, min)
          }}
        />
      </div>

      {/* editor popover */}
      {editor && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setEditor(null)} />
          <div
            className="fixed z-50 w-80 max-w-[calc(100vw-24px)] rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-4 flex flex-col gap-2.5"
            style={
              isMobile
                ? { left: '50%', bottom: 16, transform: 'translateX(-50%)' }
                : editor.anchor
                  ? {
                      left: Math.min(editor.anchor.x, window.innerWidth - 340),
                      top: Math.min(editor.anchor.y + 6, window.innerHeight - 340),
                    }
                  : { left: '50%', top: '30%', transform: 'translateX(-50%)' }
            }
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              {editor.mode === 'new' ? 'New block' : editor.item?.kind === 'routine' ? 'Routine — this day only' : 'Edit block'}
            </p>
            <input
              autoFocus
              value={editor.title}
              onChange={e => setEditor({ ...editor, title: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && saveEditor()}
              placeholder="What are you doing?"
              className={inputCls}
            />
            <div className="flex items-center gap-2">
              <input type="time" value={editor.start} onChange={e => setEditor({ ...editor, start: e.target.value })} className={`${inputCls} flex-1`} />
              <span className="text-gray-400 text-sm">→</span>
              <input type="time" value={editor.end} onChange={e => setEditor({ ...editor, end: e.target.value })} className={`${inputCls} flex-1`} />
            </div>
            <div className="flex gap-1.5">
              {COLOR_KEYS.map(c => (
                <button
                  key={c}
                  onClick={() => setEditor({ ...editor, color: c })}
                  className={`w-6 h-6 rounded-full ${PLANNER_COLORS[c].dot} ${
                    editor.color === c ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-gray-900' : ''
                  }`}
                  title={c}
                />
              ))}
            </div>
            <textarea
              value={editor.note}
              onChange={e => setEditor({ ...editor, note: e.target.value })}
              placeholder="Note (optional)"
              rows={2}
              className={`${inputCls} resize-none`}
            />
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={saveEditor}
                className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Save
              </button>
              <button onClick={() => setEditor(null)} className="text-sm text-gray-500 px-1">Cancel</button>
              <div className="flex-1" />
              {editor.mode === 'edit' && (
                <button onClick={deleteFromEditor} className="text-sm text-red-500 hover:text-red-600">
                  {editor.item?.kind === 'routine' ? 'Skip today' : 'Delete'}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
