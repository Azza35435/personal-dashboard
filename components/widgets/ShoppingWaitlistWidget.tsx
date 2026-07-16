'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { alertActive, discountPct, meetsRule, STORE_LABEL } from '@/lib/shopping'
import { firstSharedGroup } from '@/lib/groups'
import type { ShoppingAlertType, ShoppingItem, ShoppingPrice, ShoppingStore } from '@/lib/types'
import { formatPrice } from '@/lib/utils'

const STORES: ShoppingStore[] = ['woolworths', 'coles', 'chemist']

interface CheckError {
  item: string
  store: string
  error: string
}

interface ItemForm {
  name: string
  search_query: string
  woolworths_url: string
  coles_url: string
  chemist_url: string
  alert_type: ShoppingAlertType
  alert_value: string
}

const emptyForm: ItemForm = {
  name: '',
  search_query: '',
  woolworths_url: '',
  coles_url: '',
  chemist_url: '',
  alert_type: 'any',
  alert_value: '',
}

function formFromItem(item: ShoppingItem): ItemForm {
  return {
    name: item.name,
    search_query: item.search_query ?? '',
    woolworths_url: item.woolworths_url ?? '',
    coles_url: item.coles_url ?? '',
    chemist_url: item.chemist_url ?? '',
    alert_type: item.alert_type,
    alert_value: item.alert_value != null ? String(item.alert_value) : '',
  }
}

function formToRow(form: ItemForm) {
  return {
    name: form.name.trim(),
    search_query: form.search_query.trim() || null,
    woolworths_url: form.woolworths_url.trim() || null,
    coles_url: form.coles_url.trim() || null,
    chemist_url: form.chemist_url.trim() || null,
    alert_type: form.alert_type,
    alert_value: form.alert_type === 'any' || !form.alert_value ? null : Number(form.alert_value),
  }
}

function ruleLabel(item: ShoppingItem): string {
  if (item.alert_type === 'percent' && item.alert_value != null) return `≥ ${item.alert_value}% off`
  if (item.alert_type === 'price' && item.alert_value != null) return `under ${formatPrice(item.alert_value)}`
  return 'any discount'
}

function ItemFormFields({ form, setForm }: { form: ItemForm; setForm: (f: ItemForm) => void }) {
  const inputCls =
    'w-full px-2 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder-gray-400'
  return (
    <div className="space-y-2">
      <input
        autoFocus
        className={inputCls}
        placeholder="Item name (e.g. Connoisseur ice cream 1L)"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <input
        className={inputCls}
        placeholder="Search keywords (optional — defaults to name)"
        value={form.search_query}
        onChange={(e) => setForm({ ...form, search_query: e.target.value })}
      />
      <input
        className={inputCls}
        placeholder="Woolworths product URL (optional, exact tracking)"
        value={form.woolworths_url}
        onChange={(e) => setForm({ ...form, woolworths_url: e.target.value })}
      />
      <input
        className={inputCls}
        placeholder="Coles product URL (optional — checker coming soon)"
        value={form.coles_url}
        onChange={(e) => setForm({ ...form, coles_url: e.target.value })}
      />
      <input
        className={inputCls}
        placeholder="Chemist Warehouse URL (optional — checker coming soon)"
        value={form.chemist_url}
        onChange={(e) => setForm({ ...form, chemist_url: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <select
          className="px-2 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded"
          value={form.alert_type}
          onChange={(e) => setForm({ ...form, alert_type: e.target.value as ShoppingAlertType })}
        >
          <option value="any">Alert on any discount</option>
          <option value="percent">Alert when % off ≥</option>
          <option value="price">Alert when price ≤</option>
        </select>
        {form.alert_type !== 'any' && (
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-24 px-2 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder-gray-400"
            placeholder={form.alert_type === 'percent' ? '%' : '$'}
            value={form.alert_value}
            onChange={(e) => setForm({ ...form, alert_value: e.target.value })}
          />
        )}
      </div>
    </div>
  )
}

export default function ShoppingWaitlistWidget() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [prices, setPrices] = useState<ShoppingPrice[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [checkErrors, setCheckErrors] = useState<CheckError[]>([])
  const [checkNote, setCheckNote] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState<ItemForm>(emptyForm)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ItemForm | null>(null)
  const [showPurchased, setShowPurchased] = useState(false)

  const load = useCallback(async () => {
    const { data: itemRows } = await supabase
      .from('shopping_items')
      .select('*')
      .order('position')
      .order('created_at')
    const { data: priceRows } = await supabase
      .from('shopping_prices')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(2000)
    setItems(itemRows ?? [])
    setPrices(priceRows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // prices arrive newest-first, so first hit per (item, store) is the latest
  const latest = new Map<string, ShoppingPrice>()
  const lowest = new Map<string, number>()
  for (const p of prices) {
    const key = `${p.item_id}:${p.store}`
    if (!latest.has(key)) latest.set(key, p)
    if (p.price != null && (!lowest.has(key) || p.price < lowest.get(key)!)) lowest.set(key, p.price)
  }
  const lastChecked = prices[0]?.checked_at ?? null

  const checkNow = async () => {
    setChecking(true)
    setCheckErrors([])
    setCheckNote(null)
    try {
      const res = await fetch('/api/shopping/check', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setCheckErrors([{ item: '', store: '', error: json.error ?? `Check failed (${res.status})` }])
      } else if (json.blocked) {
        // Woolworths 403s the hosting server's IP — checks run from the Mac instead
        setCheckNote(
          'Woolworths blocks price checks from the cloud server, so the Check now button only works when running locally. Prices update automatically every morning at 9am from your Mac.'
        )
      } else {
        setCheckErrors(json.errors ?? [])
        if (json.note) setCheckNote(json.note)
      }
    } catch (e) {
      setCheckErrors([{ item: '', store: '', error: e instanceof Error ? e.message : 'Check failed' }])
    }
    await load()
    setChecking(false)
  }

  const addItem = async () => {
    if (!addForm.name.trim()) return
    const maxPos = items.reduce((m, i) => Math.max(m, i.position), -1)
    // stamp the household group (if one shares shopping) so members see it
    const groupId = await firstSharedGroup('shopping')
    await supabase.from('shopping_items').insert({ ...formToRow(addForm), position: maxPos + 1, group_id: groupId })
    setAddForm(emptyForm)
    setAdding(false)
    load()
  }

  const saveEdit = async (item: ShoppingItem) => {
    if (!editForm || !editForm.name.trim()) return
    const row = formToRow(editForm)
    // re-evaluate the (possibly changed) rule against the latest known prices
    const onSaleNow = STORES.some((s) => {
      const p = latest.get(`${item.id}:${s}`)
      return p != null && meetsRule({ alert_type: row.alert_type, alert_value: row.alert_value }, p.price, p.was_price, p.on_special)
    })
    await supabase.from('shopping_items').update({ ...row, on_sale_now: onSaleNow }).eq('id', item.id)
    setEditForm(null)
    load()
  }

  const dismiss = async (item: ShoppingItem) => {
    await supabase.from('shopping_items').update({ dismissed_at: new Date().toISOString() }).eq('id', item.id)
    load()
  }

  const setStatus = async (item: ShoppingItem, status: 'watching' | 'purchased') => {
    await supabase.from('shopping_items').update({ status }).eq('id', item.id)
    load()
  }

  const removeItem = async (item: ShoppingItem) => {
    await supabase.from('shopping_items').delete().eq('id', item.id)
    setExpandedId(null)
    load()
  }

  const watching = items.filter((i) => i.status === 'watching')
  const onSale = watching.filter((i) => i.on_sale_now)
  const notOnSale = watching.filter((i) => !i.on_sale_now)
  const purchased = items.filter((i) => i.status === 'purchased')

  const renderItem = (item: ShoppingItem) => {
    const expanded = expandedId === item.id
    const active = alertActive(item)
    const storePrices = STORES.map((s) => ({ store: s, price: latest.get(`${item.id}:${s}`) })).filter(
      (sp) => sp.price != null
    ) as { store: ShoppingStore; price: ShoppingPrice }[]

    return (
      <div
        key={item.id}
        className={`rounded border p-3 cursor-pointer transition-colors ${
          item.on_sale_now && item.status === 'watching'
            ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900'
            : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700'
        }`}
        onClick={() => {
          setExpandedId(expanded ? null : item.id)
          setEditForm(null)
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className={`text-sm truncate ${item.status === 'purchased' ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}>
                {item.name}
              </p>
              {active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-600 text-white font-medium flex-shrink-0">SALE</span>}
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">Alert: {ruleLabel(item)}</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {storePrices.length === 0 && <span className="text-[10px] text-gray-400">not checked yet</span>}
            {storePrices.map(({ store, price }) => {
              const pct = discountPct(price.price, price.was_price)
              return (
                <div key={store} className="text-right">
                  <div className="flex items-baseline gap-1.5 justify-end">
                    {price.was_price != null && pct != null && (
                      <span className="text-[10px] text-gray-400 line-through">{formatPrice(price.was_price)}</span>
                    )}
                    <span className={`text-sm font-medium ${pct != null ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {price.price != null ? formatPrice(price.price) : '—'}
                    </span>
                    {pct != null && (
                      <span className="text-[10px] font-semibold text-green-700 dark:text-green-400">-{pct}%</span>
                    )}
                  </div>
                  <p className="text-[9px] uppercase tracking-wider text-gray-400">{STORE_LABEL[store]}</p>
                </div>
              )
            })}
            {active && (
              <button
                onClick={(e) => { e.stopPropagation(); dismiss(item) }}
                className="text-[10px] px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            {editForm ? (
              <div className="space-y-2">
                <ItemFormFields form={editForm} setForm={setEditForm} />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(item)} className="px-3 py-1.5 text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded">
                    Save
                  </button>
                  <button onClick={() => setEditForm(null)} className="px-3 py-1.5 text-xs text-gray-500">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {storePrices.map(({ store, price }) => {
                  const low = lowest.get(`${item.id}:${store}`)
                  return (
                    <div key={store} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span className="uppercase tracking-wider text-[10px] text-gray-400 w-24 flex-shrink-0">{STORE_LABEL[store]}</span>
                      {price.product_url ? (
                        <a href={price.product_url} target="_blank" rel="noreferrer" className="truncate underline decoration-gray-300 hover:text-gray-700 dark:hover:text-gray-200">
                          {price.product_name ?? 'View product'}
                        </a>
                      ) : (
                        <span className="truncate">{price.product_name}</span>
                      )}
                      {low != null && <span className="flex-shrink-0 text-gray-400">lowest seen {formatPrice(low)}</span>}
                    </div>
                  )
                })}
                {item.search_query && <p className="text-xs text-gray-400 mb-1">Keywords: {item.search_query}</p>}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setEditForm(formFromItem(item))} className="px-2.5 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                    ✎ Edit
                  </button>
                  {item.status === 'watching' ? (
                    <button onClick={() => setStatus(item, 'purchased')} className="px-2.5 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                      ✓ Purchased
                    </button>
                  ) : (
                    <button onClick={() => setStatus(item, 'watching')} className="px-2.5 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                      Watch again
                    </button>
                  )}
                  <button onClick={() => removeItem(item)} className="px-2.5 py-1 text-xs rounded border border-red-200 dark:border-red-900 text-red-500 ml-auto">
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-cyan-400 rounded shadow-sm overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3 flex-shrink-0">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Shopping Waitlist</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {lastChecked
              ? `Last checked ${new Date(lastChecked).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`
              : 'Never checked — add items and hit Check now'}
          </p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="px-3 py-1.5 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
        >
          + Add item
        </button>
        <button
          onClick={checkNow}
          disabled={checking || watching.length === 0}
          className="px-3 py-1.5 text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded disabled:opacity-40"
        >
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {checkErrors.length > 0 && (
          <div className="p-3 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-600 dark:text-red-400 space-y-0.5">
            {checkErrors.map((e, i) => (
              <p key={i}>{e.item ? `${e.item} (${e.store}): ` : ''}{e.error}</p>
            ))}
          </div>
        )}
        {checkNote && (
          <div className="p-3 rounded border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-700 dark:text-amber-400">
            {checkNote}
          </div>
        )}

        {adding && (
          <div className="p-3 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 space-y-2">
            <ItemFormFields form={addForm} setForm={setAddForm} />
            <div className="flex gap-2">
              <button onClick={addItem} className="px-3 py-1.5 text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded">
                Add
              </button>
              <button onClick={() => { setAdding(false); setAddForm(emptyForm) }} className="px-3 py-1.5 text-xs text-gray-500">
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 && !adding ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">No items on your waitlist yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add products you&apos;re waiting to go on sale, then hit Check now.</p>
          </div>
        ) : (
          <>
            {onSale.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-green-600 dark:text-green-500 mb-2">
                  🔔 On sale ({onSale.length})
                </p>
                <div className="space-y-2">{onSale.map(renderItem)}</div>
              </div>
            )}
            {notOnSale.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
                  👀 Watching ({notOnSale.length})
                </p>
                <div className="space-y-2">{notOnSale.map(renderItem)}</div>
              </div>
            )}
            {purchased.length > 0 && (
              <div>
                <button
                  onClick={() => setShowPurchased(!showPurchased)}
                  className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2"
                >
                  ✓ Purchased ({purchased.length}) {showPurchased ? '▾' : '▸'}
                </button>
                {showPurchased && <div className="space-y-2">{purchased.map(renderItem)}</div>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
