'use client'

import dynamic from 'next/dynamic'

const NutritionWidget = dynamic(() => import('@/components/widgets/NutritionWidget'), { ssr: false })

export default function NutritionPage() {
  return (
    <div className="p-6 h-full overflow-auto">
      <h1 className="text-xl font-semibold mb-6">Nutrition</h1>
      <div className="max-w-xl">
        <NutritionWidget />
      </div>
    </div>
  )
}
