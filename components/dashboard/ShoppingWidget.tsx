'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { discountPct, STORE_LABEL } from '@/lib/shopping'
import type { ShoppingItem, ShoppingPrice, ShoppingStore } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

export default function ShoppingWidget() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [latest, setLatest] = useState<Map<string, ShoppingPrice>>(new Map())
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: itemRows } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('status', 'watching')
      .eq('on_sale_now', true)
      .order('position')
    const onSale = itemRows ?? []
    const map = new Map<string, ShoppingPrice>()
    if (onSale.length > 0) {
      const { data: priceRows } = await supabase
        .from('shopping_prices')
        .select('*')
        .in('item_id', onSale.map((i) => i.id))
        .order('checked_at', { ascending: false })
        .limit(200)
      for (const p of priceRows ?? []) {
        const key = `${p.item_id}:${p.store}`
        if (!map.has(key)) map.set(key, p)
      }
    }
    setItems(onSale)
    setLatest(map)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex-shrink-0 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">On Sale Now</p>
        <Link href="/shopping" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          Waitlist →
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-gray-400">Nothing on your waitlist is on sale</p>
          </div>
        ) : (
          items.map((item) => {
            const stores: ShoppingStore[] = ['woolworths', 'coles', 'chemist']
            const price = stores.map((s) => latest.get(`${item.id}:${s}`)).find((p) => p != null)
            const pct = price ? discountPct(price.price, price.was_price) : null
            return (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-950/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{item.name}</p>
                  {price && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{STORE_LABEL[price.store]}</p>
                  )}
                </div>
                {price && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      {price.price != null ? formatCurrency(price.price) : '—'}
                    </p>
                    {pct != null && <p className="text-[10px] font-semibold text-green-600">-{pct}%</p>}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
