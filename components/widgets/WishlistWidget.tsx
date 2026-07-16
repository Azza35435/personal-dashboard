'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatPrice } from '@/lib/utils'
import type { Priority, WishlistItem } from '@/lib/types'

const PRIORITY_DOT: Record<Priority, string> = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-green-400',
}
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

interface ItemForm {
  name: string
  price: string
  url: string
  priority: Priority
  target_date: string
  occasion: string
}

const EMPTY_FORM: ItemForm = { name: '', price: '', url: '', priority: 'medium', target_date: '', occasion: '' }

function formToRow(form: ItemForm) {
  return {
    name: form.name.trim(),
    price: form.price ? Number(form.price) : null,
    url: form.url.trim() ? (form.url.trim().startsWith('http') ? form.url.trim() : `https://${form.url.trim()}`) : null,
    priority: form.priority,
    target_date: form.target_date || null,
    occasion: form.occasion.trim() || null,
  }
}

function itemToForm(item: WishlistItem): ItemForm {
  return {
    name: item.name,
    price: item.price != null ? String(item.price) : '',
    url: item.url ?? '',
    priority: item.priority,
    target_date: item.target_date ?? '',
    occasion: item.occasion ?? '',
  }
}

function domain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function TargetBadge({ item }: { item: WishlistItem }) {
  if (!item.target_date && !item.occasion) return null
  const days = item.target_date
    ? Math.ceil((new Date(item.target_date).getTime() - Date.now()) / 86400000)
    : null
  const cls =
    days != null && days < 0
      ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900'
      : days != null && days <= 30
        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900'
        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
  const dateLabel = item.target_date
    ? new Date(item.target_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    : null
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${cls}`}>
      {[item.occasion, dateLabel].filter(Boolean).join(' · ')}
    </span>
  )
}

function FormFields({ form, setForm, onSubmit }: { form: ItemForm; setForm: (f: ItemForm) => void; onSubmit: () => void }) {
  const input = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder-gray-400 px-2 py-1.5 text-sm outline-none'
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          autoFocus
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && onSubmit()}
          placeholder="Item (e.g. Standing desk)"
          className={`${input} flex-1 min-w-40`}
        />
        <input
          value={form.price}
          onChange={e => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, '') })}
          placeholder="Price $"
          className={`${input} w-24`}
        />
        <select
          value={form.priority}
          onChange={e => setForm({ ...form, priority: e.target.value as Priority })}
          className={`${input} text-gray-700 dark:text-gray-300`}
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={form.url}
          onChange={e => setForm({ ...form, url: e.target.value })}
          placeholder="Link (optional)"
          className={`${input} flex-1 min-w-40`}
        />
        <input
          type="date"
          value={form.target_date}
          onChange={e => setForm({ ...form, target_date: e.target.value })}
          className={`${input} text-gray-700 dark:text-gray-300`}
        />
        <input
          value={form.occasion}
          onChange={e => setForm({ ...form, occasion: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && onSubmit()}
          placeholder="Occasion (e.g. Black Friday)"
          className={`${input} w-44`}
        />
      </div>
    </div>
  )
}

export default function WishlistWidget() {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<ItemForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ItemForm>(EMPTY_FORM)
  const [editingSaved, setEditingSaved] = useState<string | null>(null)
  const [savedValue, setSavedValue] = useState('')
  const [showPurchased, setShowPurchased] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('wishlist_items').select('*').order('created_at')
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const addItem = async () => {
    if (!form.name.trim()) return
    await supabase.from('wishlist_items').insert(formToRow(form))
    setForm(EMPTY_FORM)
    setAdding(false)
    load()
  }

  const saveEdit = async (id: string) => {
    if (!editForm.name.trim()) return
    await supabase.from('wishlist_items').update(formToRow(editForm)).eq('id', id)
    setEditingId(null)
    load()
  }

  const saveSaved = async (item: WishlistItem) => {
    const amount = Number(savedValue) || 0
    setEditingSaved(null)
    await supabase.from('wishlist_items').update({ saved_amount: amount }).eq('id', item.id)
    load()
  }

  const setPurchased = async (item: WishlistItem, purchased: boolean) => {
    await supabase
      .from('wishlist_items')
      .update({ purchased, purchased_at: purchased ? new Date().toISOString() : null })
      .eq('id', item.id)
    load()
  }

  const remove = async (item: WishlistItem) => {
    await supabase.from('wishlist_items').delete().eq('id', item.id)
    load()
  }

  const active = items
    .filter(i => !i.purchased)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  const purchased = items
    .filter(i => i.purchased)
    .sort((a, b) => (b.purchased_at ?? '').localeCompare(a.purchased_at ?? ''))

  const totalPrice = active.reduce((s, i) => s + (i.price ?? 0), 0)
  const totalSaved = active.reduce((s, i) => s + i.saved_amount, 0)

  return (
    <div className="flex-1 min-h-0 flex flex-col rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 shadow-sm text-gray-900 dark:text-gray-100">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Wishlist</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {active.length === 0
              ? 'Bigger purchases you’re working toward — private to you'
              : `${active.length} item${active.length === 1 ? '' : 's'} · ${formatPrice(totalSaved)} saved of ${formatPrice(totalPrice)}`}
          </p>
        </div>
        <button
          onClick={() => setAdding(a => !a)}
          className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-3 py-1.5 font-medium hover:opacity-90 transition-opacity"
        >
          {adding ? 'Cancel' : '+ Add item'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {adding && (
          <div className="mb-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700 p-3">
            <FormFields form={form} setForm={setForm} onSubmit={addItem} />
            <button
              onClick={addItem}
              className="mt-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-3 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Add to wishlist
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        ) : active.length === 0 && !adding ? (
          <p className="text-sm text-gray-400 text-center py-8">Nothing on the wishlist — add something you&apos;re saving for</p>
        ) : (
          <div className="flex flex-col gap-2">
            {active.map(item => {
              const pct = item.price ? Math.min(100, Math.round((item.saved_amount / item.price) * 100)) : null
              return editingId === item.id ? (
                <div key={item.id} className="bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700 p-3">
                  <FormFields form={editForm} setForm={setEditForm} onSubmit={() => saveEdit(item.id)} />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => saveEdit(item.id)}
                      className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded px-3 py-1.5 text-sm font-medium"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-sm text-gray-500 px-2">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={item.id}
                  className="group bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[item.priority]}`} title={`${item.priority} priority`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                        {item.name}
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2"
                          >
                            {domain(item.url)} ↗
                          </a>
                        )}
                      </p>
                    </div>
                    <TargetBadge item={item} />
                    {item.price != null && (
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">
                        {formatPrice(item.price)}
                      </span>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => setPurchased(item, true)}
                        className="w-6 h-6 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-950/40 text-sm"
                        title="Mark purchased"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(item.id)
                          setEditForm(itemToForm(item))
                        }}
                        className="w-6 h-6 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                        title="Edit"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => remove(item)}
                        className="w-6 h-6 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 text-sm"
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {item.price != null && (
                    <div className="flex items-center gap-2.5 mt-2 pl-[18px]">
                      <div className="flex-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        <div className="h-full bg-violet-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      {editingSaved === item.id ? (
                        <input
                          autoFocus
                          value={savedValue}
                          onChange={e => setSavedValue(e.target.value.replace(/[^\d.]/g, ''))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveSaved(item)
                            if (e.key === 'Escape') setEditingSaved(null)
                          }}
                          onBlur={() => saveSaved(item)}
                          className="w-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5 text-xs outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingSaved(item.id)
                            setSavedValue(String(item.saved_amount || ''))
                          }}
                          className="text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap"
                          title="Click to update saved amount"
                        >
                          {formatPrice(item.saved_amount)} saved · {pct}%
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {purchased.length > 0 && (
          <div className="mt-6 border-t border-gray-100 dark:border-gray-800 pt-3">
            <button
              onClick={() => setShowPurchased(s => !s)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {showPurchased ? '▾' : '▸'} ✓ Purchased ({purchased.length})
            </button>
            {showPurchased && (
              <div className="mt-2 flex flex-col gap-1">
                {purchased.map(item => (
                  <div key={item.id} className="group flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                    <span className="flex-1 text-sm text-gray-400 dark:text-gray-500 line-through truncate">{item.name}</span>
                    {item.price != null && <span className="text-xs text-gray-400">{formatPrice(item.price)}</span>}
                    {item.purchased_at && (
                      <span className="text-[10px] text-gray-300 dark:text-gray-600">
                        {new Date(item.purchased_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                    <button
                      onClick={() => setPurchased(item, false)}
                      className="opacity-0 group-hover:opacity-100 text-[11px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-opacity"
                    >
                      Move back
                    </button>
                    <button
                      onClick={() => remove(item)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-sm transition-opacity"
                    >
                      ×
                    </button>
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
