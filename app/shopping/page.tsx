'use client'

import { Suspense, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'

const ShoppingWaitlistWidget = dynamic(() => import('@/components/widgets/ShoppingWaitlistWidget'), { ssr: false })
const GroceriesWidget = dynamic(() => import('@/components/widgets/GroceriesWidget'), { ssr: false })
const WishlistWidget = dynamic(() => import('@/components/widgets/WishlistWidget'), { ssr: false })

const TABS = [
  { id: 'waitlist', label: '🛒 Sale Waitlist' },
  { id: 'groceries', label: '🧺 Groceries' },
  { id: 'wishlist', label: '⭐ Wishlist' },
] as const

type TabId = (typeof TABS)[number]['id']

function ShoppingTabs() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const raw = searchParams.get('tab')
  const tab: TabId = raw === 'groceries' || raw === 'wishlist' ? raw : 'waitlist'

  const setTab = useCallback(
    (id: TabId) => {
      router.replace(id === 'waitlist' ? '/shopping' : `/shopping?tab=${id}`, { scroll: false })
    },
    [router]
  )

  return (
    <div className="flex-1 overflow-hidden h-full flex flex-col p-6">
      <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        {TABS.map(t => (
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
      <div className="flex-1 min-h-0 flex flex-col">
        {tab === 'waitlist' && <ShoppingWaitlistWidget />}
        {tab === 'groceries' && <GroceriesWidget />}
        {tab === 'wishlist' && <WishlistWidget />}
      </div>
    </div>
  )
}

export default function ShoppingPage() {
  return (
    <Suspense>
      <ShoppingTabs />
    </Suspense>
  )
}
