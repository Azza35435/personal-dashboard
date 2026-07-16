'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCalendarConnection } from '@/lib/useCalendarConnection'
import { supabase } from '@/lib/supabase'
import {
  NAV_ITEMS,
  PREFS_CHANGED_EVENT,
  loadSidebarPrefs,
  persistSidebarPrefs,
  resetSidebarPrefs,
  type NavEntry,
  type PrefState,
} from '@/lib/sidebarPrefs'
import type { Group, Profile, SharedTool } from '@/lib/types'

type Tab = 'sidebar' | 'preferences' | 'account' | 'admin'

const cardCls =
  'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-slate-400 rounded shadow-sm p-5'
const labelCls = 'text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500'
const inputCls =
  'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder-gray-400 px-2 py-1.5 text-sm outline-none'
const primaryBtnCls =
  'bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40'
const ghostBtnCls =
  'border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function SettingsWidget() {
  const [tab, setTab] = useState<Tab>('sidebar')
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'sidebar', label: 'Sidebar' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'account', label: 'Account' },
    ...(profile?.is_admin ? [{ id: 'admin' as Tab, label: 'Admin' }] : []),
  ]

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">Customise your dashboard</p>

        <div className="flex gap-1 mt-5 mb-4 border-b border-gray-200 dark:border-gray-800">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm -mb-px border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-gray-900 dark:border-white text-gray-900 dark:text-gray-100 font-medium'
                  : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'sidebar' && <SidebarTab />}
        {tab === 'preferences' && <PreferencesTab />}
        {tab === 'account' && <AccountTab profile={profile} />}
        {tab === 'admin' && profile?.is_admin && <AdminTab me={profile} />}
      </div>
    </div>
  )
}

/* ───────────────────────── Sidebar tab ───────────────────────── */

interface RowDrag {
  href: string
  startY: number
  active: boolean
  overIndex: number | null
  rowH: number
  captured: NavEntry[]
}

function SidebarTab() {
  const [order, setOrder] = useState<NavEntry[]>(NAV_ITEMS)
  const [prefs, setPrefs] = useState<Record<string, PrefState>>({})
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [drag, setDrag] = useState<RowDrag | null>(null)
  const dragRef = useRef<RowDrag | null>(null)

  const load = useCallback(() => {
    loadSidebarPrefs().then(({ order, prefs }) => {
      setOrder(order)
      setPrefs(prefs)
    })
  }, [])

  useEffect(() => {
    load()
    // Re-sync if the sidebar itself is drag-reordered while this page is open
    const onChange = () => {
      if (!dragRef.current) load()
    }
    window.addEventListener(PREFS_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(PREFS_CHANGED_EVENT, onChange)
  }, [load])

  const commitDrop = (d: RowDrag) => {
    const from = d.captured.findIndex(i => i.href === d.href)
    if (from === -1 || d.overIndex === null) return
    let to = d.overIndex
    if (to > from) to--
    to = Math.max(1, Math.min(to, d.captured.length - 1))
    if (to === from) return
    const next = [...d.captured]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOrder(next)
    persistSidebarPrefs(next, prefs)
  }

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      let over: number | null = null
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        const attr = (el as HTMLElement).dataset?.setIdx
        if (attr !== undefined) {
          const r = (el as HTMLElement).getBoundingClientRect()
          const idx = parseInt(attr, 10)
          over = e.clientY < r.top + r.height / 2 ? idx : idx + 1
          break
        }
      }
      const next: RowDrag = { ...d, active: true, overIndex: over !== null ? Math.max(1, over) : d.overIndex }
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
    persistSidebarPrefs(order, next)
  }

  const rename = (href: string, label: string) => {
    const item = NAV_ITEMS.find(i => i.href === href)
    const custom = label && label !== item?.label ? label : null
    const cur = prefs[href]
    const next = { ...prefs, [href]: { hidden: !!cur?.hidden, custom_label: custom } }
    setPrefs(next)
    persistSidebarPrefs(order, next)
  }

  const move = (href: string, dir: -1 | 1) => {
    const idx = order.findIndex(i => i.href === href)
    const to = idx + dir
    if (idx <= 0 || to <= 0 || to >= order.length) return
    const next = [...order]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    setOrder(next)
    persistSidebarPrefs(next, prefs)
  }

  const gapAt = drag?.active ? drag.overIndex : null

  return (
    <div className={cardCls}>
      <p className={labelCls}>Sidebar tools</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-3">
        Drag ⠿ (or use the arrows) to reorder, ✎ to rename, 👁 to hide. Hidden tools stay reachable by their URL.
      </p>
      <div className="flex flex-col gap-0.5">
        {order.map((item, idx) => {
          const pref = prefs[item.href]
          const pinned = item.href === '/'
          const hidden = !pinned && !!pref?.hidden
          const label = pref?.custom_label || item.label
          const beingDragged = drag?.active && drag.href === item.href
          return (
            <div key={item.href} className="contents">
              {gapAt === idx && (
                <div
                  style={{ height: drag!.rowH }}
                  className="rounded bg-gray-100 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600"
                />
              )}
              <div
                data-set-idx={idx}
                className={`group flex items-center gap-2 rounded px-2 py-2 text-sm border border-transparent hover:border-gray-100 dark:hover:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60 ${
                  beingDragged ? 'opacity-30' : ''
                } ${hidden ? 'opacity-50' : ''}`}
              >
                {pinned ? (
                  <span className="w-4" />
                ) : (
                  <span
                    onPointerDown={e => {
                      if (e.button !== 0) return
                      e.preventDefault()
                      const row = (e.currentTarget as HTMLElement).parentElement!
                      const d: RowDrag = {
                        href: item.href,
                        startY: e.clientY,
                        active: false,
                        overIndex: null,
                        rowH: row.getBoundingClientRect().height,
                        captured: order,
                      }
                      dragRef.current = d
                      setDrag(d)
                    }}
                    className="w-4 text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing select-none"
                    title="Drag to reorder"
                  >
                    ⠿
                  </span>
                )}
                <span className="w-5 text-center text-base">{item.icon}</span>
                {renaming === item.href ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        rename(item.href, renameValue.trim())
                        setRenaming(null)
                      }
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    onBlur={() => {
                      rename(item.href, renameValue.trim())
                      setRenaming(null)
                    }}
                    placeholder={item.label}
                    className={`flex-1 min-w-0 ${inputCls} py-0.5`}
                  />
                ) : (
                  <span className="flex-1 truncate text-gray-800 dark:text-gray-200">
                    {label}
                    {pref?.custom_label && (
                      <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({item.label})</span>
                    )}
                    {hidden && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-gray-400">hidden</span>}
                  </span>
                )}
                {pinned ? (
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">pinned</span>
                ) : (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => move(item.href, -1)}
                      disabled={idx <= 1}
                      className="w-6 h-6 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 text-xs"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(item.href, 1)}
                      disabled={idx >= order.length - 1}
                      className="w-6 h-6 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 text-xs"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => {
                        setRenaming(item.href)
                        setRenameValue(pref?.custom_label || item.label)
                      }}
                      className="w-6 h-6 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 text-xs"
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => toggleHidden(item.href)}
                      className="w-6 h-6 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 text-xs"
                      title={hidden ? 'Show in sidebar' : 'Hide from sidebar'}
                    >
                      {hidden ? '🚫' : '👁'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {gapAt === order.length && (
          <div
            style={{ height: drag!.rowH }}
            className="rounded bg-gray-100 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600"
          />
        )}
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 mt-4 pt-3">
        {confirmReset ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400 flex-1">
              Restore default order, names &amp; visibility?
            </span>
            <button
              onClick={() => {
                setConfirmReset(false)
                resetSidebarPrefs().then(load)
              }}
              className={primaryBtnCls}
            >
              Reset
            </button>
            <button onClick={() => setConfirmReset(false)} className="text-xs text-gray-500 px-1">
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            Reset sidebar to defaults
          </button>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────── Preferences tab ─────────────────────── */

const TARGETS_KEY = 'nutrition_targets'
const DEFAULT_TARGETS = { calories: 2000, protein: 150, carbs: 250, fat: 65 }
const PIN_HASH_KEY = 'finance_passcode_hash'

function PreferencesTab() {
  return (
    <div className="flex flex-col gap-4">
      <NutritionTargetsCard />
      <FinancePinCard />
    </div>
  )
}

function NutritionTargetsCard() {
  const [targets, setTargets] = useState(DEFAULT_TARGETS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(TARGETS_KEY)
    if (stored) {
      try {
        setTargets({ ...DEFAULT_TARGETS, ...JSON.parse(stored) })
      } catch {}
    }
  }, [])

  const save = () => {
    localStorage.setItem(TARGETS_KEY, JSON.stringify(targets))
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  const fields: { key: keyof typeof DEFAULT_TARGETS; label: string; unit: string }[] = [
    { key: 'calories', label: 'Calories', unit: 'kcal' },
    { key: 'protein', label: 'Protein', unit: 'g' },
    { key: 'carbs', label: 'Carbs', unit: 'g' },
    { key: 'fat', label: 'Fat', unit: 'g' },
  ]

  return (
    <div className={cardCls}>
      <p className={labelCls}>Daily nutrition targets</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-3">
        Used by the Nutrition widget&apos;s progress bars and the gym calendar&apos;s day tints. Stored on this device.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {fields.map(f => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {f.label} <span className="text-gray-300 dark:text-gray-600">({f.unit})</span>
            </span>
            <input
              type="number"
              min={0}
              value={targets[f.key]}
              onChange={e => setTargets(t => ({ ...t, [f.key]: Number(e.target.value) }))}
              className={inputCls}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button onClick={save} className={primaryBtnCls}>
          Save targets
        </button>
        {saved && <span className="text-xs text-green-600">Saved ✓</span>}
      </div>
    </div>
  )
}

function FinancePinCard() {
  const [hasPin, setHasPin] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    setHasPin(!!localStorage.getItem(PIN_HASH_KEY))
  }, [])

  const clear = () => {
    setCurrent('')
    setNext('')
    setConfirm('')
  }

  const flash = (text: string, ok: boolean) => {
    setMessage({ text, ok })
    setTimeout(() => setMessage(null), 2500)
  }

  const verifyCurrent = async () => {
    const stored = localStorage.getItem(PIN_HASH_KEY)
    return stored !== null && (await sha256(current)) === stored
  }

  const setOrChange = async () => {
    if (!/^\d{4}$/.test(next)) return flash('PIN must be 4 digits', false)
    if (next !== confirm) return flash('PINs do not match', false)
    if (hasPin && !(await verifyCurrent())) return flash('Current PIN is incorrect', false)
    localStorage.setItem(PIN_HASH_KEY, await sha256(next))
    setHasPin(true)
    clear()
    flash(hasPin ? 'PIN changed' : 'PIN set', true)
  }

  const remove = async () => {
    if (!(await verifyCurrent())) return flash('Current PIN is incorrect', false)
    localStorage.removeItem(PIN_HASH_KEY)
    sessionStorage.removeItem('finance_unlocked')
    setHasPin(false)
    clear()
    flash('PIN removed', true)
  }

  const pinInput = (value: string, set: (v: string) => void, placeholder: string) => (
    <input
      type="password"
      inputMode="numeric"
      maxLength={4}
      value={value}
      onChange={e => set(e.target.value.replace(/\D/g, ''))}
      placeholder={placeholder}
      className={`${inputCls} w-28 tracking-widest`}
    />
  )

  return (
    <div className={cardCls}>
      <p className={labelCls}>Finance PIN</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-3">
        {hasPin
          ? 'The Finance page asks for this 4-digit PIN once per browser session. Stored on this device.'
          : 'No PIN set — the Finance page is open. Set a 4-digit PIN to lock it on this device.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {hasPin && pinInput(current, setCurrent, 'Current')}
        {pinInput(next, setNext, hasPin ? 'New PIN' : 'PIN')}
        {pinInput(confirm, setConfirm, 'Confirm')}
        <button onClick={setOrChange} className={primaryBtnCls}>
          {hasPin ? 'Change PIN' : 'Set PIN'}
        </button>
        {hasPin && (
          <button onClick={remove} className={`${ghostBtnCls} text-red-500 dark:text-red-400`}>
            Remove
          </button>
        )}
      </div>
      {message && (
        <p className={`text-xs mt-2 ${message.ok ? 'text-green-600' : 'text-red-500'}`}>{message.text}</p>
      )}
    </div>
  )
}

/* ───────────────────────── Account tab ───────────────────────── */

function AccountTab({ profile }: { profile: Profile | null }) {
  const { connected, status, connect, disconnect } = useCalendarConnection()

  const signOutEverywhere = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cardCls}>
        <p className={labelCls}>Account</p>
        {profile ? (
          <div className="flex items-center gap-3 mt-3">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-semibold">
                {(profile.display_name ?? profile.email)[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {profile.display_name ?? profile.email}
                {profile.is_admin && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-gray-500 dark:text-gray-400">
                    admin
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{profile.email}</p>
            </div>
            <button onClick={signOutEverywhere} className={`${ghostBtnCls} hover:text-red-600 dark:hover:text-red-400`}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="h-10 mt-3 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
        )}
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Google Calendar</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-3">
          Powers the Schedule widgets. Granted as part of your Google sign-in — reconnect here if you skipped the
          calendar checkbox on the consent screen.
        </p>
        {status === 'loading' ? (
          <div className="h-8 animate-pulse bg-gray-100 dark:bg-gray-800 rounded w-48" />
        ) : connected ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Connected
              {profile?.email && <span className="text-gray-400 dark:text-gray-500">· {profile.email}</span>}
            </span>
            <button onClick={() => disconnect()} className={ghostBtnCls}>
              Disconnect
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" /> Not connected
            </span>
            <button onClick={() => connect()} className={primaryBtnCls}>
              Connect calendar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────── Admin tab ────────────────────────── */

interface Invite {
  email: string
  is_admin: boolean
}

function AdminTab({ me }: { me: Profile }) {
  const [members, setMembers] = useState<Profile[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  const load = useCallback(async () => {
    const [{ data: profiles }, { data: allowed }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('allowed_users').select('email, is_admin').order('created_at'),
    ])
    setMembers(profiles ?? [])
    const emails = new Set((profiles ?? []).map(p => p.email.toLowerCase()))
    setInvites((allowed ?? []).filter(a => !emails.has(a.email.toLowerCase())))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const invite = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address')
      return
    }
    setError('')
    const { error: err } = await supabase.from('allowed_users').insert({ email })
    if (err) {
      setError(err.code === '23505' ? 'That email is already invited' : err.message)
      return
    }
    setNewEmail('')
    load()
  }

  const remove = async (email: string) => {
    setRemoving(true)
    setError('')
    const res = await fetch('/api/admin/members', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? `Remove failed (${res.status})`)
    }
    setConfirmRemove(null)
    setRemoving(false)
    load()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cardCls}>
        <p className={labelCls}>Members</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-3">
          Everyone with access to this dashboard. Removing a member deletes their account <b>and all their data</b>;
          shared sale alerts and recipes arrive with sharing groups (coming soon).
        </p>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded px-2 py-1.5 mb-2">
            {error}
          </p>
        )}

        {loading ? (
          <div className="h-16 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
        ) : (
          <div className="flex flex-col gap-1">
            {members.map(m => (
              <div
                key={m.id}
                className="group flex items-center gap-2.5 rounded px-2 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
              >
                {m.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatar_url} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold">
                    {(m.display_name ?? m.email)[0]?.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                    {m.display_name ?? m.email}
                    {m.id === me.id && <span className="ml-1.5 text-xs text-gray-400">(you)</span>}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{m.email}</p>
                </div>
                {m.is_admin && (
                  <span className="text-[10px] uppercase tracking-wider bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-gray-500 dark:text-gray-400">
                    admin
                  </span>
                )}
                {m.id !== me.id &&
                  (confirmRemove === m.email ? (
                    <span className="flex items-center gap-1.5">
                      <button
                        onClick={() => remove(m.email)}
                        disabled={removing}
                        className="text-xs bg-red-600 text-white rounded px-2 py-1 disabled:opacity-50"
                      >
                        {removing ? 'Removing…' : 'Delete account + data'}
                      </button>
                      <button onClick={() => setConfirmRemove(null)} className="text-xs text-gray-500 px-1">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(m.email)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-600 transition-opacity"
                    >
                      Remove
                    </button>
                  ))}
              </div>
            ))}

            {invites.map(i => (
              <div
                key={i.email}
                className="group flex items-center gap-2.5 rounded px-2 py-2 border border-dashed border-gray-200 dark:border-gray-700"
              >
                <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs text-gray-400">
                  ✉
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-600 dark:text-gray-300 truncate">{i.email}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Invited — hasn&apos;t signed in yet</p>
                </div>
                {confirmRemove === i.email ? (
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={() => remove(i.email)}
                      disabled={removing}
                      className="text-xs bg-red-600 text-white rounded px-2 py-1 disabled:opacity-50"
                    >
                      {removing ? 'Removing…' : 'Remove invite'}
                    </button>
                    <button onClick={() => setConfirmRemove(null)} className="text-xs text-gray-500 px-1">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmRemove(i.email)}
                    className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-600 transition-opacity"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && invite()}
            placeholder="friend@gmail.com"
            className={`${inputCls} flex-1`}
          />
          <button onClick={invite} className={primaryBtnCls}>
            Invite
          </button>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
          Invited people sign in with their Google account — no password to share.
        </p>
      </div>

      <GroupsCard members={members} />
    </div>
  )
}

/* ─────────────────────── Sharing groups ──────────────────────── */

const SHARE_TOOLS: { id: SharedTool; label: string; icon: string }[] = [
  { id: 'shopping', label: 'Shopping Waitlist', icon: '🛒' },
  { id: 'groceries', label: 'Groceries', icon: '🧺' },
  { id: 'cookbook', label: 'Cookbook', icon: '🍳' },
]

function GroupsCard({ members }: { members: Profile[] }) {
  const [groups, setGroups] = useState<Group[]>([])
  const [memberships, setMemberships] = useState<{ group_id: string; user_id: string }[]>([])
  const [shares, setShares] = useState<{ group_id: string; tool: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [{ data: g }, { data: gm }, { data: gs }] = await Promise.all([
      supabase.from('groups').select('*').order('created_at'),
      supabase.from('group_members').select('group_id, user_id'),
      supabase.from('group_shares').select('group_id, tool'),
    ])
    setGroups(g ?? [])
    setMemberships(gm ?? [])
    setShares(gs ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async (op: PromiseLike<{ error: { message: string } | null }>) => {
    const { error: err } = await op
    if (err) setError(err.message)
    else setError('')
    load()
  }

  const createGroup = () => {
    const name = newName.trim()
    if (!name) return
    setNewName('')
    run(supabase.from('groups').insert({ name }))
  }

  const isMember = (gid: string, uid: string) => memberships.some(m => m.group_id === gid && m.user_id === uid)
  const isShared = (gid: string, tool: SharedTool) => shares.some(s => s.group_id === gid && s.tool === tool)

  const toggleMember = (gid: string, uid: string) =>
    run(
      isMember(gid, uid)
        ? supabase.from('group_members').delete().eq('group_id', gid).eq('user_id', uid)
        : supabase.from('group_members').insert({ group_id: gid, user_id: uid })
    )

  const toggleShare = (gid: string, tool: SharedTool) =>
    run(
      isShared(gid, tool)
        ? supabase.from('group_shares').delete().eq('group_id', gid).eq('tool', tool)
        : supabase.from('group_shares').insert({ group_id: gid, tool })
    )

  return (
    <div className={cardCls}>
      <p className={labelCls}>Sharing groups</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-3">
        Members of a group share the ticked tools: everyone in the group sees and edits the same items. New items are
        stamped with the group automatically; existing private items stay private.
      </p>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded px-2 py-1.5 mb-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="h-16 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(g => (
            <div key={g.id} className="rounded border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
              <div className="flex items-center gap-2">
                {renaming === g.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        run(supabase.from('groups').update({ name: renameValue.trim() || g.name }).eq('id', g.id))
                        setRenaming(null)
                      }
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    onBlur={() => {
                      run(supabase.from('groups').update({ name: renameValue.trim() || g.name }).eq('id', g.id))
                      setRenaming(null)
                    }}
                    className={`${inputCls} py-0.5 text-sm font-medium`}
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 flex-1">{g.name}</p>
                )}
                {renaming !== g.id && (
                  <>
                    <button
                      onClick={() => {
                        setRenaming(g.id)
                        setRenameValue(g.name)
                      }}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      title="Rename group"
                    >
                      ✎
                    </button>
                    {confirmDelete === g.id ? (
                      <span className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setConfirmDelete(null)
                            run(supabase.from('groups').delete().eq('id', g.id))
                          }}
                          className="text-xs bg-red-600 text-white rounded px-2 py-0.5"
                        >
                          Delete group
                        </button>
                        <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-500">
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(g.id)}
                        className="text-xs text-gray-400 hover:text-red-600"
                        title="Delete group (items revert to their owners)"
                      >
                        ×
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="mt-2.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Members</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {members.map(m => (
                    <label key={m.id} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isMember(g.id, m.id)}
                        onChange={() => toggleMember(g.id, m.id)}
                        className="accent-gray-900 dark:accent-white"
                      />
                      {m.display_name ?? m.email}
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-2.5">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Shared tools</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {SHARE_TOOLS.map(t => (
                    <label key={t.id} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isShared(g.id, t.id)}
                        onChange={() => toggleShare(g.id, t.id)}
                        className="accent-gray-900 dark:accent-white"
                      />
                      {t.icon} {t.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createGroup()}
              placeholder="New group name (e.g. Friends)"
              className={`${inputCls} flex-1`}
            />
            <button onClick={createGroup} className={primaryBtnCls}>
              Add group
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
