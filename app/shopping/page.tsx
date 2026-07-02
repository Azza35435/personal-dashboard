'use client'

import dynamic from 'next/dynamic'

const ShoppingWaitlistWidget = dynamic(() => import('@/components/widgets/ShoppingWaitlistWidget'), { ssr: false })

export default function ShoppingPage() {
  return (
    <div className="flex-1 overflow-hidden h-full flex flex-col p-6">
      <ShoppingWaitlistWidget />
    </div>
  )
}
