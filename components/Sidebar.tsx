'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { alertActive } from '@/lib/shopping'
import {
  NAV_ITEMS,
  PREFS_CHANGED_EVENT,
  loadSidebarPrefs,
  persistSidebarPrefs,
  type NavEntry,
  type PrefState,
} from '@/lib/sidebarPrefs'

const COLLAPSED_KEY = 'sidebar_collapsed'

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
  const [prefs, setPrefs] = useState<Record<string, PrefState>>({})
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false) // desktop icon rail
  const [drag, setDrag] = useState<NavDrag | null>(null)
  const dragRef = useRef<NavDrag | null>(null)
  const didDragRef = useRef(false)

  const visible = order.filter(i => i.href === '/' || !prefs[i.href]?.hidden)

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1')
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(c => {
      localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1')
      return !c
    })
  }

  // drawer closes on navigation and Escape
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  useEffect(() => {
    supabase
      .from('shopping_items')
      .select('status, on_sale_now, dismissed_at, last_sale_detected_at')
      .eq('status', 'watching')
      .eq('on_sale_now', true)
      .then(({ data }) => setSaleCount((data ?? []).filter(alertActive).length))
  }, [pathname])

  useEffect(() => {
    const load = () =>
      loadSidebarPrefs().then(({ order, prefs }) => {
        setOrder(order)
        setPrefs(prefs)
      })
    load()
    // Stay in sync with edits made on the /settings page
    const onChange = () => {
      if (!dragRef.current) load()
    }
    window.addEventListener(PREFS_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(PREFS_CHANGED_EVENT, onChange)
  }, [])

  // Rebuild the full order after a drag reordered the visible list: hidden
  // items keep their relative order, tucked at the end.
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
    const hiddenItems = order.filter(i => i.href !== '/' && prefs[i.href]?.hidden)
    const next = [...nextVisible, ...hiddenItems]
    setOrder(next)
    persistSidebarPrefs(next, prefs)
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

  if (pathname === '/login') return null

  const dateLabel = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })

  const navLink = (item: NavEntry, idx: number, opts: { inDrawer: boolean; iconOnly: boolean }) => {
    const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
    const beingDragged = !opts.inDrawer && drag?.active && drag.href === item.href
    const label = prefs[item.href]?.custom_label || item.label
    return (
      <Link
        key={item.href}
        href={item.href}
        draggable={false}
        title={opts.iconOnly ? label : undefined}
        {...(!opts.inDrawer ? { 'data-nav-idx': idx } : {})}
        onPointerDown={
          opts.inDrawer
            ? undefined // tap-first in the mobile drawer — reorder lives in Settings
            : e => {
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
              }
        }
        onClick={e => {
          if (!opts.inDrawer && didDragRef.current) {
            e.preventDefault()
            didDragRef.current = false
          }
        }}
        className={`relative flex items-center gap-3 rounded-lg text-sm transition-colors select-none ${
          opts.iconOnly ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
        } ${beingDragged ? 'opacity-30' : ''} ${
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
        }`}
      >
        <span className="text-base w-5 text-center">{item.icon}</span>
        {!opts.iconOnly && <span className="flex-1">{label}</span>}
        {item.href === '/shopping' && saleCount > 0 &&
          (opts.iconOnly ? (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-600" />
          ) : (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-green-600 text-white text-[10px] font-semibold flex items-center justify-center">
              {saleCount}
            </span>
          ))}
      </Link>
    )
  }

  const settingsLink = (iconOnly: boolean) => (
    <Link
      href="/settings"
      title={iconOnly ? 'Settings' : undefined}
      className={`flex items-center gap-3 rounded-lg text-sm transition-colors select-none ${
        iconOnly ? 'justify-center px-0 py-2' : 'px-3 py-2'
      } ${
        pathname.startsWith('/settings')
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
      }`}
    >
      <span className="text-base w-5 text-center">⚙</span>
      {!iconOnly && <span>Settings</span>}
    </Link>
  )

  return (
    <>
      {/* ── mobile top bar ── */}
      <div className="md:hidden fixed top-0 inset-x-0 h-12 z-30 flex items-center gap-2 px-2 border-b border-border bg-sidebar">
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="relative p-2.5 rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent/60 text-lg leading-none"
        >
          ☰
          {saleCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-green-600" />}
        </button>
        <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">My Dashboard</span>
        <span className="ml-auto pr-2 text-xs text-sidebar-foreground/50">{dateLabel}</span>
      </div>

      {/* ── mobile drawer ── */}
      {drawerOpen && <div className="md:hidden fixed inset-0 z-40 bg-black/30" onClick={() => setDrawerOpen(false)} />}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-border flex flex-col transform transition-transform duration-200 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-5 border-b border-border flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-sm tracking-tight text-sidebar-foreground">My Dashboard</h1>
            <p className="text-xs text-sidebar-foreground/50 mt-0.5">{dateLabel}</p>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="p-2 text-sidebar-foreground/50 hover:text-sidebar-foreground text-lg leading-none"
          >
            ×
          </button>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-0.5 overflow-y-auto">
          {visible.map((item, idx) => navLink(item, idx, { inDrawer: true, iconOnly: false }))}
        </nav>
        <div className="p-3 border-t border-border">{settingsLink(false)}</div>
      </aside>

      {/* ── desktop sidebar / icon rail ── */}
      <aside
        className={`hidden md:flex ${collapsed ? 'w-14' : 'w-52'} flex-shrink-0 h-screen sticky top-0 border-r border-border flex-col bg-sidebar transition-[width] duration-200`}
      >
        {collapsed ? (
          <div className="py-4 border-b border-border flex justify-center">
            <span className="text-base text-sidebar-foreground">◈</span>
          </div>
        ) : (
          <div className="px-5 py-5 border-b border-border">
            <h1 className="font-semibold text-sm tracking-tight text-sidebar-foreground">My Dashboard</h1>
            <p className="text-xs text-sidebar-foreground/50 mt-0.5">{dateLabel}</p>
          </div>
        )}

        <nav className={`flex-1 flex flex-col gap-0.5 overflow-y-auto ${collapsed ? 'p-1.5' : 'p-3'}`}>
          {visible.map((item, idx) => (
            <div key={item.href} className="contents">
              {!collapsed && gapAt === idx && (
                <div style={{ height: drag!.rowH }} className="rounded-lg bg-sidebar-accent/60 border border-dashed border-sidebar-foreground/20" />
              )}
              {navLink(item, idx, { inDrawer: false, iconOnly: collapsed })}
            </div>
          ))}
          {!collapsed && gapAt === visible.length && (
            <div style={{ height: drag!.rowH }} className="rounded-lg bg-sidebar-accent/60 border border-dashed border-sidebar-foreground/20" />
          )}
        </nav>

        <div className={`border-t border-border flex ${collapsed ? 'flex-col items-stretch p-1.5 gap-0.5' : 'items-center gap-1 p-3'}`}>
          <div className="flex-1 min-w-0">{settingsLink(collapsed)}</div>
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground text-sm transition-colors ${
              collapsed ? 'py-2 text-center' : 'px-2 py-2'
            }`}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
      </aside>
    </>
  )
}
