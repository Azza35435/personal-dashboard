'use client'

import dynamic from 'next/dynamic'

const AppleHealthTracker = dynamic(() => import('@/components/widgets/AppleHealthTracker'), { ssr: false })

export default function AppleHealthPage() {
  return (
    <div className="p-6 h-full overflow-auto">
      <AppleHealthTracker />
    </div>
  )
}
