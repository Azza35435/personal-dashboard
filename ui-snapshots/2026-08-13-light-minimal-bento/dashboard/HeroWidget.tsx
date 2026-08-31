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
    <div className="h-full flex flex-col justify-between p-6 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-2xl text-white overflow-hidden relative">
      {/* subtle background circle decoration */}
      <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/5" />
      <div className="absolute -right-2 top-16 w-24 h-24 rounded-full bg-white/5" />

      <div className="relative">
        <p className="text-sm font-medium text-white/60 tracking-wide">{dateStr}</p>
        <h2 className="text-2xl font-bold mt-1 tracking-tight">{greeting}, Aaron 👋</h2>
      </div>

      <div className="relative">
        <p className="text-5xl font-light tabular-nums tracking-tight leading-none">{timeStr}</p>
        <p className="text-xs text-white/50 mt-2 uppercase tracking-widest">Melbourne, AU</p>
      </div>
    </div>
  )
}
