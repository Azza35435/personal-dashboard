'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { alertActive } from '@/lib/shopping'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: '◈' },
  { href: '/schedule', label: 'Schedule & Tasks', icon: '📅' },
  { href: '/finance', label: 'Finance', icon: '💰' },
  { href: '/health', label: 'Health', icon: '💪' },
  { href: '/apple-health', label: 'Apple Health', icon: '♥' },
  { href: '/habits', label: 'Habits', icon: '✓' },
  { href: '/goals', label: 'Goals', icon: '🎯' },
  { href: '/shopping', label: 'Shopping Waitlist', icon: '🛒' },
  { href: '/notes', label: 'Notes', icon: '📝' },
  { href: '/curriculars', label: 'Curriculars', icon: '🎓' },
  { href: '/deadlines', label: 'Deadlines', icon: '📅' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [saleCount, setSaleCount] = useState(0)

  useEffect(() => {
    supabase
      .from('shopping_items')
      .select('status, on_sale_now, dismissed_at, last_sale_detected_at')
      .eq('status', 'watching')
      .eq('on_sale_now', true)
      .then(({ data }) => setSaleCount((data ?? []).filter(alertActive).length))
  }, [pathname])

  return (
    <aside className="w-52 flex-shrink-0 h-screen sticky top-0 border-r border-border flex flex-col bg-sidebar">
      <div className="px-5 py-5 border-b border-border">
        <h1 className="font-semibold text-sm tracking-tight text-sidebar-foreground">My Dashboard</h1>
        <p className="text-xs text-sidebar-foreground/50 mt-0.5">
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
              }`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.href === '/shopping' && saleCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-green-600 text-white text-[10px] font-semibold flex items-center justify-center">
                  {saleCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
