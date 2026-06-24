'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import type { CalendarEvent } from '@/lib/types'

const START_HOUR = 7
const END_HOUR = 22
const TOTAL_HOURS = END_HOUR - START_HOUR
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const EVENT_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-pink-500',
]

function getWeekDays(date: Date): Date[] {
  const day = date.getDay()
  const monday = new Date(date)
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1))
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

interface EventPos {
  dayIndex: number
  top: number
  height: number
}

function getEventPos(event: CalendarEvent, weekDays: Date[], hourHeight: number): EventPos | null {
  if (!event.start.dateTime) return null
  const start = new Date(event.start.dateTime)
  const end = new Date(event.end?.dateTime ?? event.start.dateTime)
  const startHour = start.getHours() + start.getMinutes() / 60
  const endHour = end.getHours() + end.getMinutes() / 60
  if (startHour >= END_HOUR || endHour <= START_HOUR) return null
  const dayIndex = weekDays.findIndex(d => d.toDateString() === start.toDateString())
  if (dayIndex === -1) return null
  const top = Math.max(0, (startHour - START_HOUR) * hourHeight)
  const height = Math.max(20, (Math.min(endHour, END_HOUR) - Math.max(startHour, START_HOUR)) * hourHeight)
  return { dayIndex, top, height }
}

export default function WeekCalendar() {
  const { data: session, status } = useSession()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [calError, setCalError] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLDivElement>(null)
  const [hourHeight, setHourHeight] = useState(48)

  const today = new Date()

  const weekDays = (() => {
    const base = new Date(today)
    base.setDate(today.getDate() + weekOffset * 7)
    return getWeekDays(base)
  })()

  const fetchEvents = () => {
    if (!session) return
    setLoading(true)
    setCalError(null)
    const start = weekDays[0].toISOString()
    const end = new Date(weekDays[6].getTime() + 86400000).toISOString()
    fetch(`/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEvents(data)
        } else {
          setCalError(data?.error ?? JSON.stringify(data))
          setEvents([])
        }
        setLoading(false)
      })
      .catch(err => { setCalError(String(err)); setLoading(false) })
  }

  useEffect(() => {
    fetchEvents()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, weekOffset])

  // Auto-refresh every 5 minutes when viewing the current week
  useEffect(() => {
    if (!session || weekOffset !== 0) return
    const interval = setInterval(fetchEvents, 5 * 60 * 1000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, weekOffset])

  // Measure grid container and compute hourHeight so the grid fills without scrolling
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const h = entries[0].contentRect.height
      if (h > 0) setHourHeight(h / TOTAL_HOURS)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const now = new Date()
  const currentTimeTop = (now.getHours() + now.getMinutes() / 60 - START_HOUR) * hourHeight
  const isCurrentWeek = weekOffset === 0

  const monthLabel = weekDays[0].getMonth() === weekDays[6].getMonth()
    ? weekDays[0].toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
    : `${weekDays[0].toLocaleDateString('en-AU', { month: 'short' })} – ${weekDays[6].toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}`

  if (status === 'unauthenticated') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="text-5xl">📅</span>
        <div>
          <p className="font-medium">Connect Google Calendar</p>
          <p className="text-sm text-muted-foreground mt-1">See your week at a glance</p>
        </div>
        <button
          onClick={() => signIn('google')}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
        >
          Sign in with Google
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="p-1.5 rounded-md hover:bg-muted transition text-muted-foreground text-sm"
          >
            ‹
          </button>
          <span className="text-sm font-semibold min-w-[160px] text-center">{monthLabel}</span>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            className="p-1.5 rounded-md hover:bg-muted transition text-muted-foreground text-sm"
          >
            ›
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 transition text-muted-foreground ml-1"
            >
              Today
            </button>
          )}
        </div>
        {status === 'authenticated' && (
          <button onClick={() => signOut()} className="text-xs text-muted-foreground hover:text-foreground transition">
            Disconnect
          </button>
        )}
      </div>

      {/* Day header row */}
      <div className="flex flex-shrink-0 border-b border-border">
        <div className="w-12 flex-shrink-0" />
        {weekDays.map((day, i) => {
          const isToday = day.toDateString() === today.toDateString()
          return (
            <div key={i} className="flex-1 py-2.5 text-center">
              <p className="text-xs text-muted-foreground uppercase font-medium tracking-wide">{DAYS[i]}</p>
              <div className={`text-sm font-semibold mt-1 w-8 h-8 flex items-center justify-center rounded-full mx-auto
                ${isToday ? 'bg-primary text-primary-foreground' : ''}`}>
                {day.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Error banner */}
      {calError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-500">
          Calendar error: {calError}
        </div>
      )}

      {/* Grid — fills remaining space, no scroll */}
      <div ref={gridRef} className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            Loading events…
          </div>
        ) : (
          <div className="flex h-full">
            {/* Time gutter */}
            <div className="w-12 flex-shrink-0 relative select-none h-full">
              {Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i).map(hour => (
                <div
                  key={hour}
                  className="absolute right-2 text-[10px] text-muted-foreground/60"
                  style={{ top: `${(hour - START_HOUR) * hourHeight - 7}px` }}
                >
                  {hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day, dayIndex) => {
              const isToday = day.toDateString() === today.toDateString()
              const dayEvents = events
                .map(e => ({ event: e, pos: getEventPos(e, weekDays, hourHeight) }))
                .filter(({ pos }) => pos?.dayIndex === dayIndex)

              return (
                <div
                  key={dayIndex}
                  className={`flex-1 relative border-l border-border/40 ${isToday ? 'bg-primary/[0.02]' : ''}`}
                >
                  {/* Hour lines */}
                  {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => i).map(i => (
                    <div
                      key={i}
                      className="absolute inset-x-0 border-t border-border/30"
                      style={{ top: `${i * hourHeight}px` }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {isToday && isCurrentWeek && currentTimeTop > 0 && currentTimeTop < TOTAL_HOURS * hourHeight && (
                    <div
                      ref={timeRef}
                      className="absolute inset-x-0 z-10 pointer-events-none"
                      style={{ top: `${currentTimeTop}px` }}
                    >
                      <div className="border-t-2 border-red-400 relative">
                        <div className="w-2 h-2 rounded-full bg-red-400 absolute -left-1 -top-1" />
                      </div>
                    </div>
                  )}

                  {/* Events */}
                  {dayEvents.map(({ event, pos }, idx) => {
                    if (!pos) return null
                    const color = EVENT_COLORS[idx % EVENT_COLORS.length]
                    return (
                      <div
                        key={event.id}
                        className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 text-white overflow-hidden ${color} hover:opacity-90 transition-opacity cursor-default`}
                        style={{ top: `${pos.top + 1}px`, height: `${pos.height - 2}px` }}
                      >
                        <p className="text-xs font-semibold leading-tight truncate">{event.summary}</p>
                        {pos.height >= 44 && (
                          <p className="text-[10px] opacity-80 leading-tight mt-0.5">
                            {new Date(event.start.dateTime!).toLocaleTimeString('en-AU', {
                              hour: 'numeric', minute: '2-digit', hour12: true,
                            })}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
