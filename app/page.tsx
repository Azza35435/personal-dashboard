'use client'

import dynamic from 'next/dynamic'

const WeekCalendar = dynamic(() => import('@/components/widgets/WeekCalendar'), { ssr: false })
const TodoWidget = dynamic(() => import('@/components/widgets/TodoWidget'), { ssr: false })

export default function Dashboard() {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-hidden flex flex-col">
        <WeekCalendar />
      </div>
      <div className="w-80 flex-shrink-0 border-l border-border overflow-hidden p-3">
        <TodoWidget />
      </div>
    </div>
  )
}
