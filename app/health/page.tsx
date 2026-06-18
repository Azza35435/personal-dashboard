'use client'

import dynamic from 'next/dynamic'

const GymWidget = dynamic(() => import('@/components/widgets/GymWidget'), { ssr: false })
const NutritionWidget = dynamic(() => import('@/components/widgets/NutritionWidget'), { ssr: false })

export default function HealthPage() {
  return (
    <div className="flex gap-6 h-screen p-6 overflow-hidden">
      <div className="flex-1 overflow-auto min-w-0">
        <GymWidget />
      </div>
      <div className="w-80 flex-shrink-0 overflow-auto">
        <NutritionWidget />
      </div>
    </div>
  )
}
