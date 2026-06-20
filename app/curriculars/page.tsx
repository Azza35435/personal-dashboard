'use client'

import dynamic from 'next/dynamic'

const CurricularsWidget = dynamic(() => import('@/components/widgets/CurricularsWidget'), { ssr: false })

export default function CurricularsPage() {
  return (
    <div className="h-full p-6 overflow-hidden">
      <CurricularsWidget />
    </div>
  )
}
