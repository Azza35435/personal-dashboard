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

  let url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(start)}` +
    `&maxResults=100` +
    `&singleEvents=true` +
    `&orderBy=startTime`

  if (end) url += `&timeMax=${encodeURIComponent(end)}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Calendar API error' }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data.items ?? [])
}
