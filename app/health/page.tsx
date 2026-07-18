'use client'

import dynamic from 'next/dynamic'

const GymWidget = dynamic(() => import('@/components/widgets/GymWidget'), { ssr: false })
const NutritionWidget = dynamic(() => import('@/components/widgets/NutritionWidget'), { ssr: false })
const CookbookWidget = dynamic(() => import('@/components/widgets/CookbookWidget'), { ssr: false })
const AppleHealthWidget = dynamic(() => import('@/components/widgets/AppleHealthWidget'), { ssr: false })

export default function HealthPage() {
  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-full lg:h-screen p-3 sm:p-6 overflow-y-auto lg:overflow-hidden">
      <div className="lg:flex-1 lg:overflow-auto min-w-0">
        <GymWidget />
      </div>
      <div className="w-full lg:w-72 flex-shrink-0 lg:overflow-auto">
        <NutritionWidget />
      </div>
      <div className="w-full lg:w-72 flex-shrink-0 lg:overflow-hidden flex flex-col gap-4 lg:gap-6">
        <CookbookWidget />
        <div className="flex-shrink-0">
          <AppleHealthWidget />
        </div>
      </div>
    </div>
  )
}
