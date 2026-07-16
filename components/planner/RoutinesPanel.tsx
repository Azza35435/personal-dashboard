'use client'

import { useState } from 'react'
import type { PlannerRoutine } from '@/lib/types'
import { COLOR_KEYS, PLANNER_COLORS, minToLabel, timeInputToMin } from '@/lib/planner'

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] // Mon-first

interface Props {
  routines: PlannerRoutine[]
  onAdd: (r: { title: string; start_min: number; duration_min: number; days: number[]; color: string }) => void
  onToggleActive: (r: PlannerRoutine) => void
  onDelete: (r: PlannerRoutine) => void
}

export default function RoutinesPanel({ routines, onAdd, onToggleActive, onDelete }: Props) {
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('07:00')
  const [duration, setDuration] = useState('30')
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6])
  const [color, setColor] = useState('violet')

  const submit = () => {
    if (!title.trim() || days.length === 0) return
    onAdd({
      title: title.trim(),
      start_min: timeInputToMin(time),
      duration_min: Math.max(15, parseInt(duration) || 30),
      days: [...days].sort(),
      color,
    })
    setTitle('')
  }

  const toggleDay = (d: number) =>
    setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]))

  const input = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder-gray-400 px-2 py-1.5 text-sm outline-none'

  return (
    <div className="mb-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Routines</p>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
        Repeat automatically on the chosen days. Edit or tick one on the planner to change just that day.
      </p>

      {routines.length > 0 && (
        <div className="flex flex-col gap-1 mb-3">
          {routines.map(r => (
            <div
              key={r.id}
              className={`group flex items-center gap-2.5 px-2.5 py-2 rounded bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 ${
                r.active ? '' : 'opacity-50'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${PLANNER_COLORS[r.color]?.dot ?? 'bg-gray-400'}`} />
              <span className="flex-1 min-w-0 truncate text-sm text-gray-800 dark:text-gray-200">{r.title}</span>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {minToLabel(r.start_min)} · {r.duration_min}m
              </span>
              <span className="flex gap-px">
                {DAY_LABELS.map((l, i) => (
                  <span
                    key={i}
                    className={`w-4 h-4 rounded-sm text-[9px] flex items-center justify-center ${
                      r.days.includes(i)
                        ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600'
                    }`}
                  >
                    {l}
                  </span>
                ))}
              </span>
              <button
                onClick={() => onToggleActive(r)}
                className="text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {r.active ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={() => onDelete(r)}
                className="text-gray-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Routine (e.g. Morning routine)"
          className={`${input} flex-1 min-w-40`}
        />
        <input type="time" value={time} onChange={e => setTime(e.target.value)} className={`${input} text-gray-700 dark:text-gray-300`} />
        <div className="flex items-center gap-1">
          <input
            value={duration}
            onChange={e => setDuration(e.target.value.replace(/\D/g, ''))}
            className={`${input} w-14`}
          />
          <span className="text-xs text-gray-400">min</span>
        </div>
        <div className="flex gap-0.5">
          {DAY_LABELS.map((l, i) => (
            <button
              key={i}
              onClick={() => toggleDay(i)}
              className={`w-6 h-6 rounded text-[10px] font-medium transition-colors ${
                days.includes(i)
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-400'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {COLOR_KEYS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-5 h-5 rounded-full ${PLANNER_COLORS[c].dot} ${color === c ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-gray-900' : ''}`}
              title={c}
            />
          ))}
        </div>
        <button
          onClick={submit}
          className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Add routine
        </button>
      </div>
    </div>
  )
}
