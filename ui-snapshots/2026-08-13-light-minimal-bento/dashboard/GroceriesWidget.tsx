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
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex-shrink-0 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Groceries{items.length > 0 && <span className="ml-1.5 text-cyan-600 dark:text-cyan-400">{items.length}</span>}
        </p>
        <Link href="/shopping?tab=groceries" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          List →
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-gray-400">Nothing on the list 🧺</p>
          </div>
        ) : (
          items.slice(0, 6).map(item => (
            <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
              <p className="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{item.name}</p>
              {item.qty && <span className="text-[10px] text-gray-400 flex-shrink-0">× {item.qty}</span>}
            </div>
          ))
        )}
        {!loading && items.length > 6 && (
          <p className="text-[11px] text-gray-400 text-center pt-1">+{items.length - 6} more</p>
        )}
      </div>
    </div>
  )
}
