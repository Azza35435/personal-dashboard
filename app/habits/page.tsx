'use client'

import dynamic from 'next/dynamic'

const HabitTracker = dynamic(() => import('@/components/widgets/HabitTracker'), { ssr: false })

export default function HabitsPage() {
  return (
    <div className="h-full overflow-auto">
      <HabitTracker />
    </div>
  )
}
