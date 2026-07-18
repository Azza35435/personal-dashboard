'use client'

import { useRef, useState } from 'react'
import type { Todo } from '@/lib/types'
import { yToMin, snap15, clampToDay } from '@/lib/planner'

const PRIORITY_DOT: Record<string, string> = { high: 'bg-red-400', medium: 'bg-amber-400', low: 'bg-green-400' }
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

interface Props {
  todos: Todo[]
  scheduledTodoIds: Set<string>
  pickedTodoId: string | null // tap-to-place mode
  onPick: (todo: Todo | null) => void
  onDropOnTimeline: (todo: Todo, startMin: number) => void
}

interface TrayDrag {
  todo: Todo
  x: number
  y: number
  active: boolean
}

export default function TodoTray({ todos, scheduledTodoIds, pickedTodoId, onPick, onDropOnTimeline }: Props) {
  const [drag, setDrag] = useState<TrayDrag | null>(null)
  const dragRef = useRef<TrayDrag | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false) // mobile bottom sheet

  const sorted = [...todos].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (p !== 0) return p
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })

  const startDrag = (todo: Todo, e: React.PointerEvent) => {
    if (e.button !== 0) return
    const d: TrayDrag = { todo, x: e.clientX, y: e.clientY, active: false }
    dragRef.current = d
    setDrag(d)

    const move = (ev: PointerEvent) => {
      const cur = dragRef.current
      if (!cur) return
      const active = cur.active || Math.abs(ev.clientX - cur.x) + Math.abs(ev.clientY - cur.y) >= 6
      const next = { ...cur, x: ev.clientX, y: ev.clientY, active }
      dragRef.current = next
      setDrag(next)
    }
    const up = (ev: PointerEvent) => {
      const cur = dragRef.current
      dragRef.current = null
      setDrag(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (!cur) return
      if (!cur.active) {
        // plain click → toggle tap-to-place mode
        onPick(pickedTodoId === cur.todo.id ? null : cur.todo)
        return
      }
      const canvas = document
        .elementsFromPoint(ev.clientX, ev.clientY)
        .find(el => (el as HTMLElement).dataset?.plannerCanvas !== undefined) as HTMLElement | undefined
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        onDropOnTimeline(cur.todo, clampToDay(snap15(yToMin(ev.clientY - rect.top))))
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <>
    {/* ── mobile bottom sheet ── */}
    <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
      <button
        onClick={() => setSheetOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300"
      >
        <span>📋 To-dos ({sorted.length})</span>
        <span className="text-gray-400">{sheetOpen ? '▾' : '▴'}</span>
      </button>
      {sheetOpen && (
        <div className="max-h-[45vh] overflow-y-auto px-3 pb-3 flex flex-col gap-1 border-t border-gray-100 dark:border-gray-800 pt-2">
          <p className="text-[11px] text-gray-400 dark:text-gray-500 px-1 pb-1">Tap a to-do, then tap a time on the planner</p>
          {sorted.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No open to-dos 🎉</p>
          ) : (
            sorted.map(todo => (
              <button
                key={todo.id}
                onClick={() => {
                  onPick(pickedTodoId === todo.id ? null : todo)
                  setSheetOpen(false)
                }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded border text-sm text-left ${
                  pickedTodoId === todo.id
                    ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-800'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[todo.priority]}`} />
                <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200">{todo.title}</span>
                {scheduledTodoIds.has(todo.id) && <span className="text-[10px]">🗓</span>}
                {todo.due_date && (
                  <span className="text-[10px] text-gray-400 flex-shrink-0">
                    {new Date(todo.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>

    {/* ── desktop right panel ── */}
    <div className="hidden md:flex w-64 flex-shrink-0 flex-col rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-rose-400 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">To-dos</p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
          {pickedTodoId ? 'Now click a time on the planner' : 'Drag onto the planner, or tap to place'}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {sorted.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No open to-dos 🎉</p>
        ) : (
          sorted.map(todo => (
            <div
              key={todo.id}
              onPointerDown={e => startDrag(todo, e)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded border text-sm select-none cursor-grab active:cursor-grabbing transition-colors ${
                pickedTodoId === todo.id
                  ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-800 ring-1 ring-violet-300'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'
              } ${drag?.active && drag.todo.id === todo.id ? 'opacity-30' : ''}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[todo.priority]}`} />
              <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200">{todo.title}</span>
              {scheduledTodoIds.has(todo.id) && <span title="Already scheduled" className="text-[10px]">🗓</span>}
              {todo.due_date && (
                <span className="text-[10px] text-gray-400 flex-shrink-0">
                  {new Date(todo.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* floating drag ghost */}
      {drag?.active && (
        <div
          className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-violet-300 shadow-lg text-sm text-gray-800 dark:text-gray-200"
          style={{ left: drag.x + 10, top: drag.y + 6 }}
        >
          {drag.todo.title}
        </div>
      )}
    </div>
    </>
  )
}
