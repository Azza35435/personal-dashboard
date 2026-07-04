'use client'

import { useEffect, useRef, useState } from 'react'
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

type NavItem = (typeof NAV_ITEMS)[number]

interface NavDrag {
  href: string
  startX: number
  startY: number
  active: boolean
  overIndex: number | null
  rowH: number
  captured: NavItem[]
}

export default function Sidebar() {
  const pathname = usePathname()
  const [saleCount, setSaleCount] = useState(0)
  const [items, setItems] = useState<NavItem[]>(NAV_ITEMS)
  const [drag, setDrag] = useState<NavDrag | null>(null)
  const dragRef = useRef<NavDrag | null>(null)
  const didDragRef = useRef(false)

  useEffect(() => {
    supabase
      .from('shopping_items')
      .select('status, on_sale_now, dismissed_at, last_sale_detected_at')
      .eq('status', 'watching')
      .eq('on_sale_now', true)
      .then(({ data }) => setSaleCount((data ?? []).filter(alertActive).length))
  }, [pathname])

  useEffect(() => {
    supabase.from('sidebar_order').select('href, position').then(({ data }) => {
      if (!data || data.length === 0) return
      const pos = new Map<string, number>(data.map(r => [r.href, r.position]))
      const known = NAV_ITEMS.filter(i => pos.has(i.href)).sort((a, b) => pos.get(a.href)! - pos.get(b.href)!)
      const unknown = NAV_ITEMS.filter(i => !pos.has(i.href))
      const ordered = [...known.filter(i => i.href !== '/'), ...unknown.filter(i => i.href !== '/')]
      setItems([NAV_ITEMS[0], ...ordered])
    })
  }, [])

  const commitDrop = (d: NavDrag) => {
    const from = d.captured.findIndex(i => i.href === d.href)
    if (from === -1 || d.overIndex === null) return
    let to = d.overIndex
    if (to > from) to--
    to = Math.max(1, Math.min(to, d.captured.length - 1))
    if (to === from) return
    const next = [...d.captured]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setItems(next)
    supabase.from('sidebar_order').upsert(next.map((i, idx) => ({ href: i.href, position: idx }))).then(() => {})
  }

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      if (!d.active && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 6) return
      let over: number | null = null
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        const attr = (el as HTMLElement).dataset?.navIdx
        if (attr !== undefined) {
          const r = (el as HTMLElement).getBoundingClientRect()
          const idx = parseInt(attr, 10)
          over = e.clientY < r.top + r.height / 2 ? idx : idx + 1
          break
        }
      }
      didDragRef.current = true
      const next: NavDrag = { ...d, active: true, overIndex: over !== null ? Math.max(1, over) : d.overIndex }
      dragRef.current = next
      setDrag(next)
    }
    const up = () => {
      const d = dragRef.current
      if (d?.active) commitDrop(d)
      dragRef.current = null
      setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [!!drag]) // eslint-disable-line react-hooks/exhaustive-deps

  const gapAt = drag?.active ? drag.overIndex : null

  return (
    <aside className="w-52 flex-shrink-0 h-screen sticky top-0 border-r border-border flex flex-col bg-sidebar">
      <div className="px-5 py-5 border-b border-border">
        <h1 className="font-semibold text-sm tracking-tight text-sidebar-foreground">My Dashboard</h1>
        <p className="text-xs text-sidebar-foreground/50 mt-0.5">
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
      </div>

      <nav className="flex-1 p-3 flex flex-col gap-0.5">
        {items.map((item, idx) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          const beingDragged = drag?.active && drag.href === item.href
          return (
            <div key={item.href} className="contents">
              {gapAt === idx && (
                <div style={{ height: drag!.rowH }} className="rounded-lg bg-sidebar-accent/60 border border-dashed border-sidebar-foreground/20" />
              )}
              <Link
                href={item.href}
                draggable={false}
                data-nav-idx={idx}
                onPointerDown={e => {
                  if (item.href === '/' || e.button !== 0) return
                  didDragRef.current = false
                  const d: NavDrag = {
                    href: item.href,
                    startX: e.clientX,
                    startY: e.clientY,
                    active: false,
                    overIndex: null,
                    rowH: e.currentTarget.getBoundingClientRect().height,
                    captured: items,
                  }
                  dragRef.current = d
                  setDrag(d)
                }}
                onClick={e => {
                  if (didDragRef.current) {
                    e.preventDefault()
                    didDragRef.current = false
                  }
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors select-none ${
                  beingDragged ? 'opacity-30' : ''
                } ${
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
            </div>
          )
        })}
        {gapAt === items.length && (
          <div style={{ height: drag!.rowH }} className="rounded-lg bg-sidebar-accent/60 border border-dashed border-sidebar-foreground/20" />
        )}
      </nav>
    </aside>
  )
}
