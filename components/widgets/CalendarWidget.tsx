'use client'

import { useEffect, useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { formatDate, formatTime } from '@/lib/utils'
import type { CalendarEvent } from '@/lib/types'

export default function CalendarWidget() {
  const { data: session, status } = useSession()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    fetch('/api/calendar')
      .then((r) => r.json())
      .then((data) => {
        setEvents(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session])

  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 h-full bg-violet-600 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Calendar</p>
          <p className="text-sm opacity-70">{today}</p>
        </div>
        {status === 'authenticated' ? (
          <button
            onClick={() => signOut()}
            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition"
          >
            Sign out
          </button>
        ) : (
          <button
            onClick={() => signIn('google')}
            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition"
          >
            Connect Google
          </button>
        )}
      </div>

      {status === 'loading' || loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-8 bg-white/20 rounded-lg" />
          ))}
        </div>
      ) : status === 'unauthenticated' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm opacity-70">Connect your Google account to see upcoming events</p>
          <button
            onClick={() => signIn('google')}
            className="bg-white text-violet-600 font-semibold text-sm px-4 py-2 rounded-full hover:bg-white/90 transition"
          >
            Sign in with Google
          </button>
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm opacity-60 flex-1 flex items-center">No upcoming events</p>
      ) : (
        <div className="space-y-2 overflow-y-auto flex-1">
          {events.map((event) => {
            const start = event.start.dateTime ?? event.start.date ?? ''
            const isAllDay = !event.start.dateTime
            return (
              <div key={event.id} className="bg-white/10 rounded-xl p-3">
                <p className="font-medium text-sm leading-tight">{event.summary}</p>
                <p className="text-xs opacity-70 mt-0.5">
                  {isAllDay ? formatDate(start) : `${formatDate(start)} · ${formatTime(start)}`}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
