'use client'

import { useEffect, useState } from 'react'

export default function HeroWidget() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hour = now.getHours()
  const greeting =
    hour < 5 ? 'Good night' :
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
    'Good evening'

  const timeStr = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const dateStr = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div
      className="h-full flex flex-col justify-center gap-1.5 px-7 border hairline overflow-hidden"
      style={{ background: 'var(--paper-raised)', borderColor: 'var(--rule)' }}
    >
      <p className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>{dateStr}</p>
      <h2
        style={{ fontFamily: 'var(--font-newsreader)', fontStyle: 'italic', fontWeight: 400, fontSize: 34, lineHeight: 1.1, color: 'var(--ink)' }}
      >
        {greeting}, <span style={{ fontStyle: 'normal', color: 'var(--oxblood)' }}>Aaron</span>.
      </h2>
      <div className="flex items-baseline gap-4 mt-1">
        <p className="num" style={{ fontFamily: 'var(--font-public-sans)', fontWeight: 500, fontSize: 15, color: 'var(--ink)' }}>{timeStr}</p>
        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--ink-faint)' }}>Melbourne, AU</p>
      </div>
    </div>
  )
}
