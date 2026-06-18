import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '../auth/[...nextauth]/route'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start') ?? new Date().toISOString()
  const end = searchParams.get('end')

  const authHeader = { Authorization: `Bearer ${session.accessToken}` }

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
