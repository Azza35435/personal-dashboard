'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { firstSharedGroup } from '@/lib/groups'
import { formatDate } from '@/lib/utils'
import type { GroceryCategory, GroceryItem, Profile } from '@/lib/types'

const CATEGORIES: { id: GroceryCategory; label: string; icon: string }[] = [
  { id: 'produce', label: 'Produce', icon: '🥬' },
  { id: 'dairy', label: 'Dairy', icon: '🥛' },
  { id: 'meat', label: 'Meat', icon: '🥩' },
  { id: 'bakery', label: 'Bakery', icon: '🍞' },
  { id: 'pantry', label: 'Pantry', icon: '🥫' },
  { id: 'frozen', label: 'Frozen', icon: '🧊' },
  { id: 'household', label: 'Household', icon: '🧻' },
  { id: 'other', label: 'Other', icon: '🛒' },
]

function Avatar({ profile }: { profile: Profile | undefined }) {
  if (!profile) return null
  const name = profile.display_name ?? profile.email
  return profile.avatar_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={profile.avatar_url} alt="" title={`Added by ${name}`} className="w-4.5 h-4.5 w-[18px] h-[18px] rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
  ) : (
    <span
      title={`Added by ${name}`}
      className="w-[18px] h-[18px] rounded-full bg-gray-200 dark:bg-gray-700 text-[9px] font-semibold flex items-center justify-center flex-shrink-0 text-gray-600 dark:text-gray-300"
    >
      {name[0]?.toUpperCase()}
    </span>
  )
}

export default function GroceriesWidget() {
  const [items, setItems] = useState<GroceryItem[]>([])
  const [history, setHistory] = useState<GroceryItem[]>([])
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map())
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [showNote, setShowNote] = useState(false)
  const [category, setCategory] = useState<GroceryCategory>('other')
  const [showHistory, setShowHistory] = useState(false)

  const load = useCallback(async () => {
    const [{ data: active }, { data: past }, { data: profs }] = await Promise.all([
      supabase.from('grocery_items').select('*').is('cleared_at', null).order('created_at'),
      supabase
        .from('grocery_items')
        .select('*')
        .not('cleared_at', 'is', null)
        .order('cleared_at', { ascending: false })
        .limit(200),
      supabase.from('profiles').select('*'),
    ])
    setItems(active ?? [])
    setHistory(past ?? [])
    setProfiles(new Map((profs ?? []).map(p => [p.id, p])))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const addItem = async (n: string, q?: string | null, cat?: GroceryCategory, nt?: string | null) => {
    const trimmed = n.trim()
    if (!trimmed) return
    const groupId = await firstSharedGroup('groceries')
    await supabase.from('grocery_items').insert({
      name: trimmed,
      qty: q?.trim() || null,
      note: nt?.trim() || null,
      category: cat ?? 'other',
      group_id: groupId,
    })
    load()
  }

  const submitAdd = async () => {
    if (!name.trim()) return
    const n = name
    setName('')
    setQty('')
    setNote('')
    await addItem(n, qty, category, note)
  }

  const toggle = async (item: GroceryItem) => {
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, checked: !i.checked } : i)))
    await supabase.from('grocery_items').update({ checked: !item.checked }).eq('id', item.id)
  }

  const remove = async (item: GroceryItem) => {
    setItems(prev => prev.filter(i => i.id !== item.id))
    await supabase.from('grocery_items').delete().eq('id', item.id)
  }

  const clearCompleted = async () => {
    const ids = items.filter(i => i.checked).map(i => i.id)
    if (ids.length === 0) return
    await supabase.from('grocery_items').update({ cleared_at: new Date().toISOString() }).in('id', ids)
    load()
  }

  const checkedCount = items.filter(i => i.checked).length

  // Most-bought (from history), excluding names already on the list
  const activeNames = new Set(items.map(i => i.name.toLowerCase()))
  const freqMap = new Map<string, { count: number; latest: GroceryItem }>()
  for (const h of history) {
    const key = h.name.toLowerCase()
    if (activeNames.has(key)) continue
    const cur = freqMap.get(key)
    if (cur) cur.count++
    else freqMap.set(key, { count: 1, latest: h }) // history is newest-first
  }
  const frequents = [...freqMap.values()].sort((a, b) => b.count - a.count).slice(0, 8)

  // History grouped by cleared date
  const historyByDay = new Map<string, GroceryItem[]>()
  for (const h of history) {
    const day = h.cleared_at!.slice(0, 10)
    if (!historyByDay.has(day)) historyByDay.set(day, [])
    historyByDay.get(day)!.push(h)
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-cyan-400 shadow-sm text-gray-900 dark:text-gray-100">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Groceries</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {items.length === 0 ? 'Shared list — nothing needed' : `${items.length - checkedCount} to buy${checkedCount ? ` · ${checkedCount} in trolley` : ''}`}
          </p>
        </div>
        {checkedCount > 0 && (
          <button
            onClick={clearCompleted}
            className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-3 py-1.5 font-medium hover:opacity-90 transition-opacity"
          >
            Clear completed ({checkedCount})
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* Add row */}
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitAdd()}
            placeholder="Add an item…"
            className="flex-1 min-w-40 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder-gray-400 px-2.5 py-1.5 text-sm outline-none"
          />
          <input
            value={qty}
            onChange={e => setQty(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitAdd()}
            placeholder="Qty"
            className="w-16 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder-gray-400 px-2 py-1.5 text-sm outline-none"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value as GroceryCategory)}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm outline-none text-gray-700 dark:text-gray-300"
          >
            {CATEGORIES.map(c => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
          <button
            onClick={submitAdd}
            className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Add
          </button>
        </div>
        <button
          onClick={() => setShowNote(s => !s)}
          className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-3"
        >
          {showNote ? '− note' : '+ note'}
        </button>
        {showNote && (
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitAdd()}
            placeholder="Note (e.g. the lactose-free one)"
            className="w-full mb-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder-gray-400 px-2.5 py-1.5 text-sm outline-none"
          />
        )}

        {/* Frequents */}
        {frequents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {frequents.map(f => (
              <button
                key={f.latest.id}
                onClick={() => addItem(f.latest.name, f.latest.qty, f.latest.category)}
                title={`Bought ${f.count}×`}
                className="text-xs px-2 py-1 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                + {f.latest.name}
              </button>
            ))}
          </div>
        )}

        {/* Active list by category */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">List is empty — add what you need for the next shop</p>
        ) : (
          CATEGORIES.map(cat => {
            const catItems = items.filter(i => i.category === cat.id)
            if (catItems.length === 0) return null
            return (
              <div key={cat.id} className="mb-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">
                  {cat.icon} {cat.label}
                </p>
                <div className="flex flex-col gap-1">
                  {catItems.map(item => (
                    <div
                      key={item.id}
                      className={`group flex items-center gap-2.5 rounded px-2.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 ${
                        item.checked ? 'opacity-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggle(item)}
                        className="accent-gray-900 dark:accent-white cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm text-gray-800 dark:text-gray-200 truncate ${item.checked ? 'line-through' : ''}`}>
                          {item.name}
                          {item.qty && (
                            <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">× {item.qty}</span>
                          )}
                        </p>
                        {item.note && <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{item.note}</p>}
                      </div>
                      <Avatar profile={profiles.get(item.user_id)} />
                      <button
                        onClick={() => remove(item)}
                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-sm transition-opacity"
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="mt-6 border-t border-gray-100 dark:border-gray-800 pt-3">
            <button
              onClick={() => setShowHistory(s => !s)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {showHistory ? '▾' : '▸'} History ({history.length})
            </button>
            {showHistory && (
              <div className="mt-2 flex flex-col gap-3">
                {[...historyByDay.entries()].map(([day, dayItems]) => (
                  <div key={day}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
                      {formatDate(day)}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      {dayItems.map(h => (
                        <div key={h.id} className="group flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                          <span className="flex-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                            {h.name}
                            {h.qty && <span className="text-gray-300 dark:text-gray-600"> × {h.qty}</span>}
                          </span>
                          <button
                            onClick={() => addItem(h.name, h.qty, h.category, h.note)}
                            className="opacity-0 group-hover:opacity-100 text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-opacity"
                          >
                            + add again
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
