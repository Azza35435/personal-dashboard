'use client'

import { useEffect, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import type { CalendarEvent } from '@/lib/types'

const EVENT_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export default function TodayScheduleWidget() {
  const { data: session, status } = useSession()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    setError(null)
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString()
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString()
    fetch(`/api/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const sorted = data
            .filter(e => e.start.dateTime)
            .sort((a, b) => new Date(a.start.dateTime!).getTime() - new Date(b.start.dateTime!).getTime())
          setEvents(sorted)
        } else {
          setError(data?.error ?? 'Failed to load')
        }
        setLoading(false)
      })
      .catch(err => { setError(String(err)); setLoading(false) })
  }, [session])

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Today's Schedule</p>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {status === 'unauthenticated' && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <p className="text-xs text-gray-400">Connect Google Calendar to see today's events</p>
            <button
              onClick={() => signIn('google')}
              className="text-xs px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium transition"
            >
              Connect Calendar
            </button>
          </div>
        )}
        {status === 'authenticated' && loading && (
          <div className="space-y-2.5 pt-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        )}
        {status === 'authenticated' && !loading && error && (
          <p className="text-xs text-red-400 pt-2">{error}</p>
        )}
        {status === 'authenticated' && !loading && !error && events.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-gray-400">No events today</p>
          </div>
        )}
        {status === 'authenticated' && !loading && !error && events.length > 0 && (
          <div className="space-y-2 pt-1">
            {events.map((event, idx) => {
              const color = EVENT_COLORS[idx % EVENT_COLORS.length]
              const start = event.start.dateTime ? fmtTime(event.start.dateTime) : 'All day'
              const end = event.end?.dateTime ? fmtTime(event.end.dateTime) : ''
              return (
                <div key={event.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <div className="w-1 self-stretch rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{event.summary}</p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                      {start}{end ? ` – ${end}` : ''}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
