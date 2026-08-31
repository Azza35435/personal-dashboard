'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { GroceryItem } from '@/lib/types'

export default function GroceriesWidget() {
  const [items, setItems] = useState<GroceryItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('grocery_items')
      .select('*')
      .is('cleared_at', null)
      .eq('checked', false)
      .order('created_at')
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="h-full flex flex-col border hairline overflow-hidden" style={{ background: 'var(--paper-raised)', borderColor: 'var(--rule)' }}>
      <div className="px-6 pt-6 pb-3 flex-shrink-0 flex items-baseline justify-between">
        <p className="eyebrow">
          Groceries{items.length > 0 && <span className="ml-1.5" style={{ color: 'var(--oxblood)' }}>{items.length}</span>}
        </p>
        <Link href="/shopping?tab=groceries" className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          List →
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-5">
        {loading ? (
          <div className="space-y-1.5 pt-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-7 rounded animate-pulse" style={{ background: 'var(--rule)' }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Nothing on the list</p>
          </div>
        ) : (
          <div>
            {items.slice(0, 6).map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 py-2"
                style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--rule)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--sage)' }} />
                <p className="flex-1 text-sm truncate" style={{ color: 'var(--ink)' }}>{item.name}</p>
                {item.qty && <span className="text-[10px] flex-shrink-0" style={{ color: 'var(--ink-faint)' }}>× {item.qty}</span>}
              </div>
            ))}
          </div>
        )}
        {!loading && items.length > 6 && (
          <p className="text-[11px] text-center pt-2" style={{ color: 'var(--ink-faint)' }}>+{items.length - 6} more</p>
        )}
      </div>
    </div>
  )
}
