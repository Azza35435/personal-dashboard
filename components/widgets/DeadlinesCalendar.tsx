'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Curricular, CurricularDeadline, Priority } from '@/lib/types'

// ── helpers ────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0]

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function getMonthBounds(offset: number) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { first, last, year: first.getFullYear(), month: first.getMonth() }
}

function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const numDays = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= numDays; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function fmtDay(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function fmtShortDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short',
  })
}

const PRIORITY_DOT: Record<Priority, string> = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-green-400',
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

function startOfWeek(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return isoDate(d)
}

// ── sub-components ─────────────────────────────────────────────────────────

interface DeadlineChipProps {
  deadline: CurricularDeadline
  curricular: Curricular | undefined
  onClick?: () => void
  showCurricular?: boolean
}

function DeadlineChip({ deadline, curricular, onClick, showCurricular }: DeadlineChipProps) {
  const past = deadline.due_date < todayStr() && !deadline.completed
  const color = curricular?.color ?? '#6b7280'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded border transition group ${
        deadline.completed
          ? 'opacity-40 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40'
          : past
            ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20'
            : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-200 dark:hover:border-gray-700'
      }`}
    >
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-tight ${deadline.completed ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {deadline.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {deadline.module && (
            <span className="text-xs text-gray-400 truncate">{deadline.module}</span>
          )}
          {showCurricular && curricular && (
            <span className="text-xs text-gray-400 truncate">{curricular.name}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[deadline.priority]}`} />
        <span className={`text-xs ${past && !deadline.completed ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
          {fmtShortDate(deadline.due_date)}
        </span>
      </div>
    </button>
  )
}

// ── main component ─────────────────────────────────────────────────────────

interface Props {
  curriculars?: Curricular[]
}

export default function DeadlinesCalendar({ curriculars: propCurriculars }: Props) {
  const [deadlines, setDeadlines] = useState<CurricularDeadline[]>([])
  const [curriculars, setCurriculars] = useState<Curricular[]>(propCurriculars ?? [])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'month' | 'agenda'>('agenda')
  const [monthOffset, setMonthOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: dl }, { data: curs }] = await Promise.all([
      supabase.from('curricular_deadlines').select('*').order('due_date').order('created_at'),
      propCurriculars
        ? Promise.resolve({ data: propCurriculars })
        : supabase.from('curriculars').select('*').order('position'),
    ])
    setDeadlines((dl ?? []) as CurricularDeadline[])
    if (!propCurriculars && curs) setCurriculars(curs as Curricular[])
    setLoading(false)
  }, [propCurriculars])

  useEffect(() => { load() }, [load])

  const curricularById = Object.fromEntries(curriculars.map(c => [c.id, c]))

  // ── Month view ──────────────────────────────────────────────────────────

  const { first, year, month } = getMonthBounds(monthOffset)
  const calGrid = buildMonthGrid(year, month)
  const monthLabel = first.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })

  const deadlinesByDate: Record<string, CurricularDeadline[]> = {}
  deadlines.forEach(d => {
    if (!deadlinesByDate[d.due_date]) deadlinesByDate[d.due_date] = []
    deadlinesByDate[d.due_date].push(d)
  })

  const selectedDateDeadlines = selectedDate ? (deadlinesByDate[selectedDate] ?? []) : []

  // ── Agenda view ─────────────────────────────────────────────────────────

  const today = todayStr()
  const thisWeekEnd = addDays(startOfWeek(today), 6)
  const nextWeekStart = addDays(thisWeekEnd, 1)
  const nextWeekEnd = addDays(nextWeekStart, 6)

  const groups = [
    {
      label: 'Overdue',
      items: deadlines.filter(d => d.due_date < today && !d.completed),
      accent: 'text-red-500',
    },
    {
      label: 'This week',
      items: deadlines.filter(d => d.due_date >= today && d.due_date <= thisWeekEnd && !d.completed),
      accent: 'text-violet-600 dark:text-violet-400',
    },
    {
      label: 'Next week',
      items: deadlines.filter(d => d.due_date > thisWeekEnd && d.due_date <= nextWeekEnd && !d.completed),
      accent: 'text-gray-600 dark:text-gray-300',
    },
    {
      label: 'Later',
      items: deadlines.filter(d => d.due_date > nextWeekEnd && !d.completed),
      accent: 'text-gray-400',
    },
    {
      label: 'Completed',
      items: deadlines.filter(d => d.completed),
      accent: 'text-gray-400',
    },
  ]

  if (loading) {
    return (
      <div className="space-y-2 pt-2">
        {[1,2,3].map(i => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* View toggle */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded p-0.5 border border-gray-200 dark:border-gray-700">
          {(['agenda', 'month'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-xs px-3 py-1.5 rounded capitalize transition font-medium ${
                view === v
                  ? 'bg-white dark:bg-gray-900 shadow-sm text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        {view === 'month' && (
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setMonthOffset(o => o - 1)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 text-sm"
            >‹</button>
            <span className="text-xs text-gray-500 w-32 text-center">{monthLabel}</span>
            <button
              onClick={() => setMonthOffset(o => o + 1)}
              disabled={monthOffset >= 0}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 text-sm disabled:opacity-30"
            >›</button>
          </div>
        )}
      </div>

      {/* ── Agenda view ──────────────────────────────────────────────── */}
      {view === 'agenda' && (
        <div className="flex-1 overflow-y-auto space-y-5 pr-0.5">
          {deadlines.length === 0 && (
            <p className="text-sm text-gray-400">No deadlines yet. Add one from a curricular tab.</p>
          )}
          {groups.map(group => group.items.length === 0 ? null : (
            <div key={group.label}>
              <p className={`text-xs font-semibold uppercase tracking-widest mb-2 ${group.accent}`}>
                {group.label} · {group.items.length}
              </p>
              <div className="space-y-1.5">
                {group.items.map(d => (
                  <DeadlineChip
                    key={d.id}
                    deadline={d}
                    curricular={curricularById[d.curricular_id]}
                    showCurricular
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Month view ───────────────────────────────────────────────── */}
      {view === 'month' && (
        <div className="flex-1 overflow-y-auto space-y-3">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-sm overflow-hidden">
            {/* Col headers */}
            <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400">{d}</div>
              ))}
            </div>
            {/* Rows */}
            {calGrid.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800 last:border-0">
                {week.map((dateStr, di) => {
                  if (!dateStr) return <div key={di} className="h-20 bg-gray-50 dark:bg-gray-800/30" />
                  const dayDeadlines = deadlinesByDate[dateStr] ?? []
                  const isToday = dateStr === today
                  const isSelected = dateStr === selectedDate
                  const isPast = dateStr < today
                  return (
                    <button
                      key={di}
                      onClick={() => setSelectedDate(d => d === dateStr ? null : dateStr)}
                      className={`h-20 p-1.5 flex flex-col items-start gap-0.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                        isSelected ? 'bg-violet-50 dark:bg-violet-950/20' : ''
                      } ${isPast ? 'opacity-60' : ''}`}
                    >
                      <span className={`text-xs font-medium mb-0.5 ${
                        isToday
                          ? 'bg-violet-500 text-white w-5 h-5 rounded-full flex items-center justify-center'
                          : 'text-gray-500'
                      }`}>
                        {parseInt(dateStr.split('-')[2])}
                      </span>
                      {dayDeadlines.slice(0, 2).map(d => (
                        <span
                          key={d.id}
                          className="w-full text-xs px-1 py-0.5 rounded truncate leading-none"
                          style={{
                            backgroundColor: (curricularById[d.curricular_id]?.color ?? '#6b7280') + '33',
                            color: curricularById[d.curricular_id]?.color ?? '#6b7280',
                          }}
                        >
                          {d.title}
                        </span>
                      ))}
                      {dayDeadlines.length > 2 && (
                        <span className="text-xs text-gray-400">+{dayDeadlines.length - 2}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Selected day detail */}
          {selectedDate && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-sm px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">{fmtDay(selectedDate)}</p>
              {selectedDateDeadlines.length === 0 ? (
                <p className="text-sm text-gray-400">No deadlines on this day.</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedDateDeadlines.map(d => (
                    <DeadlineChip
                      key={d.id}
                      deadline={d}
                      curricular={curricularById[d.curricular_id]}
                      showCurricular
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
