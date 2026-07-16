'use client'

// Shared sidebar-preference model used by both the Sidebar (render + drag
// reorder) and the /settings page (hide/rename/reorder/reset). Changes are
// broadcast via a window event so the two stay in sync on screen.
import { supabase } from '@/lib/supabase'

export interface NavEntry {
  href: string
  label: string
  icon: string
}

export interface PrefState {
  hidden: boolean
  custom_label: string | null
}

export const NAV_ITEMS: NavEntry[] = [
  { href: '/', label: 'Dashboard', icon: '◈' },
  { href: '/schedule', label: 'Schedule & Tasks', icon: '📅' },
  { href: '/planner', label: 'Planner', icon: '🗓' },
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

export const PREFS_CHANGED_EVENT = 'sidebar-prefs-changed'

export function notifyPrefsChanged() {
  window.dispatchEvent(new Event(PREFS_CHANGED_EVENT))
}

export async function loadSidebarPrefs(): Promise<{ order: NavEntry[]; prefs: Record<string, PrefState> }> {
  const { data } = await supabase.from('sidebar_prefs').select('href, position, hidden, custom_label')
  if (!data || data.length === 0) return { order: NAV_ITEMS, prefs: {} }
  const rows = new Map(data.map(r => [r.href, r]))
  const known = NAV_ITEMS.filter(i => rows.has(i.href)).sort(
    (a, b) => rows.get(a.href)!.position - rows.get(b.href)!.position
  )
  const unknown = NAV_ITEMS.filter(i => !rows.has(i.href))
  const order = [NAV_ITEMS[0], ...known.filter(i => i.href !== '/'), ...unknown.filter(i => i.href !== '/')]
  const prefs: Record<string, PrefState> = {}
  for (const r of data) prefs[r.href] = { hidden: !!r.hidden, custom_label: r.custom_label ?? null }
  return { order, prefs }
}

export async function persistSidebarPrefs(order: NavEntry[], prefs: Record<string, PrefState>) {
  await supabase.from('sidebar_prefs').upsert(
    order.map((i, idx) => ({
      href: i.href,
      position: idx,
      hidden: i.href === '/' ? false : !!prefs[i.href]?.hidden,
      custom_label: prefs[i.href]?.custom_label ?? null,
    })),
    { onConflict: 'user_id,href' }
  )
  notifyPrefsChanged()
}

export async function resetSidebarPrefs() {
  await supabase.from('sidebar_prefs').delete().neq('href', '')
  notifyPrefsChanged()
}
