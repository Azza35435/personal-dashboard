import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-server'

// Google Calendar proxy. The caller's Supabase session identifies them; their
// google_tokens row (written by /auth/callback) holds the refresh token used
// to mint short-lived access tokens, cached in the same row until expiry.

interface GoogleTokenRow {
  user_id: string
  refresh_token: string
  access_token: string | null
  expires_at: string | null
}

async function getAccessToken(
  supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>,
  tok: GoogleTokenRow
): Promise<string | null> {
  if (tok.access_token && tok.expires_at && Date.parse(tok.expires_at) > Date.now() + 60_000) {
    return tok.access_token
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: tok.refresh_token,
    }),
  })
  const refreshed = await res.json()
  if (!res.ok) {
    // invalid_grant = user revoked access; drop the row so the UI offers Connect again
    if (refreshed?.error === 'invalid_grant') {
      await supabase.from('google_tokens').delete().eq('user_id', tok.user_id)
    }
    return null
  }

  const accessToken: string = refreshed.access_token
  await supabase
    .from('google_tokens')
    .update({
      access_token: accessToken,
      expires_at: new Date(Date.now() + (refreshed.expires_in as number) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', tok.user_id)
  return accessToken
}

export async function GET(request: Request) {
  const supabase = await createRouteHandlerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { data: tok } = await supabase.from('google_tokens').select('*').maybeSingle()
  if (!tok) {
    return NextResponse.json({ error: 'Google Calendar not connected', notConnected: true }, { status: 401 })
  }

  const accessToken = await getAccessToken(supabase, tok as GoogleTokenRow)
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Google Calendar access expired — reconnect from Settings', notConnected: true },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start') ?? new Date().toISOString()
  const end = searchParams.get('end')

  const authHeader = { Authorization: `Bearer ${accessToken}` }

  // Fetch the list of all calendars this account has access to
  const listRes = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    { headers: authHeader }
  )
  if (!listRes.ok) {
    const body = await listRes.json().catch(() => ({}))
    return NextResponse.json(
      { error: `Failed to fetch calendar list (${listRes.status}): ${body?.error?.message ?? listRes.statusText}` },
      { status: listRes.status }
    )
  }
  const listData = await listRes.json()
  const calendarIds: string[] = (listData.items ?? []).map((c: { id: string }) => c.id)

  // Fetch events from every calendar in parallel
  const results = await Promise.all(
    calendarIds.map(async (calId) => {
      let url =
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events` +
        `?timeMin=${encodeURIComponent(start)}` +
        `&maxResults=100` +
        `&singleEvents=true` +
        `&orderBy=startTime`
      if (end) url += `&timeMax=${encodeURIComponent(end)}`

      const res = await fetch(url, { headers: authHeader })
      if (!res.ok) return []
      const data = await res.json()
      return (data.items ?? []).map((e: Record<string, unknown>) => ({
        ...e,
        calendarId: calId,
      }))
    })
  )

  return NextResponse.json(results.flat())
}
