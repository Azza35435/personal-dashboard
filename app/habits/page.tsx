'use client'

import dynamic from 'next/dynamic'

const HabitWidget = dynamic(() => import('@/components/widgets/HabitWidget'), { ssr: false })

export default function HabitsPage() {
  return (
    <div className="p-6 h-full overflow-auto">
      <h1 className="text-xl font-semibold mb-6">Habits</h1>
      <HabitWidget />
    </div>
  )
}
