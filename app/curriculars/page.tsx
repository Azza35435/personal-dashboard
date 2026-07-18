'use client'

import dynamic from 'next/dynamic'

const CurricularsWidget = dynamic(() => import('@/components/widgets/CurricularsWidget'), { ssr: false })

export default function CurricularsPage() {
  return (
    <div className="h-full p-3 sm:p-6 overflow-y-auto md:overflow-hidden">
      <CurricularsWidget />
    </div>
  )
}
