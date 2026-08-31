'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { discountPct, STORE_LABEL } from '@/lib/shopping'
import type { ShoppingItem, ShoppingPrice, ShoppingStore } from '@/lib/types'
import { formatPrice } from '@/lib/utils'

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
    <div className="h-full flex flex-col border hairline overflow-hidden" style={{ background: 'var(--paper-raised)', borderColor: 'var(--rule)' }}>
      <div className="px-6 pt-6 pb-3 flex-shrink-0 flex items-baseline justify-between">
        <p className="eyebrow">On Sale Now</p>
        <Link href="/shopping" className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Waitlist →
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-5">
        {loading ? (
          <div className="space-y-2 pt-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 rounded animate-pulse" style={{ background: 'var(--rule)' }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Nothing on your waitlist is on sale</p>
          </div>
        ) : (
          <div>
            {items.map((item, idx) => {
              const stores: ShoppingStore[] = ['woolworths', 'coles', 'chemist']
              const price = stores.map((s) => latest.get(`${item.id}:${s}`)).find((p) => p != null)
              const pct = price ? discountPct(price.price, price.was_price) : null
              return (
                <div
                  key={item.id}
                  className="flex items-baseline justify-between gap-3 py-2.5"
                  style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--rule)' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--ink)' }}>{item.name}</p>
                    {price && (
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--ink-faint)' }}>{STORE_LABEL[price.store]}</p>
                    )}
                  </div>
                  {price && (
                    <div className="text-right flex-shrink-0">
                      <p className="num text-sm" style={{ color: 'var(--ink)' }}>
                        {price.price != null ? formatPrice(price.price) : '—'}
                      </p>
                      {pct != null && <p className="text-[10px] font-semibold" style={{ color: 'var(--oxblood)' }}>-{pct}%</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
