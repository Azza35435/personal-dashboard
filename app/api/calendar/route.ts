import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '../auth/[...nextauth]/route'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(now)}` +
    `&maxResults=10` +
    `&singleEvents=true` +
    `&orderBy=startTime`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Calendar API error' }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data.items ?? [])
}
