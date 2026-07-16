'use client'

// Google Calendar connection state, post-NextAuth: connected means the user
// has a google_tokens row (created by /auth/callback when Google returns a
// provider refresh token). Connecting re-runs the Supabase Google OAuth flow
// with the calendar scope; disconnecting just deletes the token row.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'

export function connectGoogleCalendar(returnTo?: string) {
  const next = returnTo ?? window.location.pathname
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      scopes: CALENDAR_SCOPE,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
}

export function useCalendarConnection() {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading')

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('google_tokens').select('user_id').maybeSingle()
    setStatus(data ? 'connected' : 'disconnected')
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const disconnect = useCallback(async () => {
    // RLS limits this to the caller's own row; PostgREST just needs a filter
    await supabase.from('google_tokens').delete().neq('user_id', '00000000-0000-0000-0000-000000000000')
    setStatus('disconnected')
  }, [])

  return { status, connected: status === 'connected', connect: connectGoogleCalendar, disconnect, refresh }
}
