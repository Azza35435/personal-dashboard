'use client'

import dynamic from 'next/dynamic'

const GoalsWidget = dynamic(() => import('@/components/widgets/GoalsWidget'), { ssr: false })

export default function GoalsPage() {
  return (
    <div className="flex-1 overflow-hidden h-full flex flex-col p-3 sm:p-6">
      <GoalsWidget />
    </div>
  )
}
