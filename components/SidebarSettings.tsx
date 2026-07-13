'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

export interface NavEntry {
  href: string
  label: string
  icon: string
}

interface Props {
  open: boolean
  onClose: () => void
  items: NavEntry[] // full order, including hidden, Dashboard first
  prefs: Record<string, { hidden: boolean; custom_label: string | null }>
  onToggleHidden: (href: string) => void
  onRename: (href: string, label: string) => void
  onMove: (href: string, dir: -1 | 1) => void
  onReset: () => void
}

export default function SidebarSettings({ open, onClose, items, prefs, onToggleHidden, onRename, onMove, onReset }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => setProfile(data))
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const startRename = (href: string, current: string) => {
    setRenaming(href)
    setRenameValue(current)
  }

  const commitRename = (href: string) => {
    onRename(href, renameValue.trim())
    setRenaming(null)
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed left-3 bottom-14 z-50 w-72 max-h-[85vh] overflow-y-auto rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-4 flex flex-col gap-4 text-gray-900 dark:text-gray-100">
        {/* Account */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Account</p>
          {profile ? (
            <div className="flex items-center gap-2.5">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold">
                  {(profile.display_name ?? profile.email)[0]?.toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile.display_name ?? profile.email}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{profile.email}</p>
              </div>
              <button
                onClick={signOut}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="h-8 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
          )}
        </div>

        {/* Tools */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Sidebar tools</p>
          <div className="flex flex-col gap-0.5">
            {items.map((item, idx) => {
              const pref = prefs[item.href]
              const pinned = item.href === '/'
              const hidden = !pinned && !!pref?.hidden
              const label = pref?.custom_label || item.label
              return (
                <div
                  key={item.href}
                  className={`group flex items-center gap-2 rounded px-2 py-1.5 text-sm ${hidden ? 'opacity-40' : ''} hover:bg-gray-50 dark:hover:bg-gray-800`}
                >
                  <span className="w-5 text-center text-base">{item.icon}</span>
                  {renaming === item.href ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(item.href)
                        if (e.key === 'Escape') {
                          e.stopPropagation()
                          setRenaming(null)
                        }
                      }}
                      onBlur={() => commitRename(item.href)}
                      placeholder={item.label}
                      className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-sm placeholder-gray-400 outline-none"
                    />
                  ) : (
                    <span className="flex-1 truncate">
                      {label}
                      {pref?.custom_label && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">({item.label})</span>}
                    </span>
                  )}
                  {pinned ? (
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">pinned</span>
                  ) : (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onMove(item.href, -1)}
                        disabled={idx <= 1}
                        className="w-5 h-5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 text-xs"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => onMove(item.href, 1)}
                        disabled={idx >= items.length - 1}
                        className="w-5 h-5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 disabled:opacity-30 text-xs"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => startRename(item.href, pref?.custom_label || item.label)}
                        className="w-5 h-5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 text-xs"
                        title="Rename"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => onToggleHidden(item.href)}
                        className={`w-5 h-5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-xs ${hidden ? 'text-gray-400' : 'text-gray-500'}`}
                        title={hidden ? 'Show in sidebar' : 'Hide from sidebar'}
                      >
                        {hidden ? '🚫' : '👁'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 leading-snug">
            Hidden tools stay reachable by their URL — they&apos;re just tucked out of the sidebar.
          </p>
        </div>

        {/* Reset */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
          {confirmReset ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400 text-xs flex-1">Restore default order, names &amp; visibility?</span>
              <button
                onClick={() => {
                  onReset()
                  setConfirmReset(false)
                }}
                className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-2 py-1"
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

        {/* Admin */}
        {profile?.is_admin && (
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Admin</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Member &amp; sharing management coming soon.</p>
          </div>
        )}
      </div>
    </>
  )
}
