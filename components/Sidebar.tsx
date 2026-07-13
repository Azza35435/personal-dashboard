'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { alertActive } from '@/lib/shopping'
import SidebarSettings, { type NavEntry } from '@/components/SidebarSettings'

const NAV_ITEMS: NavEntry[] = [
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

interface Pref {
  hidden: boolean
  custom_label: string | null
}

interface NavDrag {
  href: string
  startX: number
  startY: number
  active: boolean
  overIndex: number | null
  rowH: number
  captured: NavEntry[]
}

export default function Sidebar() {
  const pathname = usePathname()
  const [saleCount, setSaleCount] = useState(0)
  const [order, setOrder] = useState<NavEntry[]>(NAV_ITEMS) // full order incl. hidden, Dashboard first
  const [prefs, setPrefs] = useState<Record<string, Pref>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [drag, setDrag] = useState<NavDrag | null>(null)
  const dragRef = useRef<NavDrag | null>(null)
  const didDragRef = useRef(false)

  const visible = order.filter(i => i.href === '/' || !prefs[i.href]?.hidden)

  useEffect(() => {
    supabase
      .from('shopping_items')
      .select('status, on_sale_now, dismissed_at, last_sale_detected_at')
      .eq('status', 'watching')
      .eq('on_sale_now', true)
      .then(({ data }) => setSaleCount((data ?? []).filter(alertActive).length))
  }, [pathname])

  useEffect(() => {
    supabase.from('sidebar_prefs').select('href, position, hidden, custom_label').then(({ data }) => {
      if (!data || data.length === 0) return
      const rows = new Map(data.map(r => [r.href, r]))
      const known = NAV_ITEMS.filter(i => rows.has(i.href)).sort(
        (a, b) => rows.get(a.href)!.position - rows.get(b.href)!.position
      )
      const unknown = NAV_ITEMS.filter(i => !rows.has(i.href))
      setOrder([NAV_ITEMS[0], ...known.filter(i => i.href !== '/'), ...unknown.filter(i => i.href !== '/')])
      const p: Record<string, Pref> = {}
      for (const r of data) p[r.href] = { hidden: !!r.hidden, custom_label: r.custom_label ?? null }
      setPrefs(p)
    })
  }, [])

  const persist = (fullOrder: NavEntry[], p: Record<string, Pref>) => {
    supabase
      .from('sidebar_prefs')
      .upsert(
        fullOrder.map((i, idx) => ({
          href: i.href,
          position: idx,
          hidden: i.href === '/' ? false : !!p[i.href]?.hidden,
          custom_label: p[i.href]?.custom_label ?? null,
        })),
        { onConflict: 'user_id,href' }
      )
      .then(() => {})
  }

  // Rebuild the full order after a drag reordered the visible list: hidden
  // items keep their relative order, tucked at the end.
  const rebuildOrder = (newVisible: NavEntry[]) => {
    const hiddenItems = order.filter(i => i.href !== '/' && prefs[i.href]?.hidden)
    return [...newVisible, ...hiddenItems]
  }

  const commitDrop = (d: NavDrag) => {
    const from = d.captured.findIndex(i => i.href === d.href)
    if (from === -1 || d.overIndex === null) return
    let to = d.overIndex
    if (to > from) to--
    to = Math.max(1, Math.min(to, d.captured.length - 1))
    if (to === from) return
    const nextVisible = [...d.captured]
    const [moved] = nextVisible.splice(from, 1)
    nextVisible.splice(to, 0, moved)
    const next = rebuildOrder(nextVisible)
    setOrder(next)
    persist(next, prefs)
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

  const toggleHidden = (href: string) => {
    const cur = prefs[href]
    const next = { ...prefs, [href]: { hidden: !cur?.hidden, custom_label: cur?.custom_label ?? null } }
    setPrefs(next)
    persist(order, next)
  }

  const rename = (href: string, label: string) => {
    const item = NAV_ITEMS.find(i => i.href === href)
    const custom = label && label !== item?.label ? label : null
    const cur = prefs[href]
    const next = { ...prefs, [href]: { hidden: !!cur?.hidden, custom_label: custom } }
    setPrefs(next)
    persist(order, next)
  }

  const move = (href: string, dir: -1 | 1) => {
    const idx = order.findIndex(i => i.href === href)
    const to = idx + dir
    if (idx <= 0 || to <= 0 || to >= order.length) return
    const next = [...order]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    setOrder(next)
    persist(next, prefs)
  }

  const reset = async () => {
    setOrder(NAV_ITEMS)
    setPrefs({})
    await supabase.from('sidebar_prefs').delete().neq('href', '')
  }

  const gapAt = drag?.active ? drag.overIndex : null

  if (pathname === '/login') return null

  return (
    <aside className="w-52 flex-shrink-0 h-screen sticky top-0 border-r border-border flex flex-col bg-sidebar">
      <div className="px-5 py-5 border-b border-border">
        <h1 className="font-semibold text-sm tracking-tight text-sidebar-foreground">My Dashboard</h1>
        <p className="text-xs text-sidebar-foreground/50 mt-0.5">
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
      </div>

      <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
        {visible.map((item, idx) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          const beingDragged = drag?.active && drag.href === item.href
          const label = prefs[item.href]?.custom_label || item.label
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
                    captured: visible,
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
                <span className="flex-1">{label}</span>
                {item.href === '/shopping' && saleCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-green-600 text-white text-[10px] font-semibold flex items-center justify-center">
                    {saleCount}
                  </span>
                )}
              </Link>
            </div>
          )
        })}
        {gapAt === visible.length && (
          <div style={{ height: drag!.rowH }} className="rounded-lg bg-sidebar-accent/60 border border-dashed border-sidebar-foreground/20" />
        )}
      </nav>

      <div className="p-3 border-t border-border">
        <button
          onClick={() => setSettingsOpen(o => !o)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
        >
          <span className="text-base w-5 text-center">⚙</span>
          <span>Settings</span>
        </button>
      </div>

      <SidebarSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        items={order}
        prefs={prefs}
        onToggleHidden={toggleHidden}
        onRename={rename}
        onMove={move}
        onReset={reset}
      />
    </aside>
  )
}
