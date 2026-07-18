'use client'

import dynamic from 'next/dynamic'

const WeekCalendar = dynamic(() => import('@/components/widgets/WeekCalendar'), { ssr: false })
const TodoWidget = dynamic(() => import('@/components/widgets/TodoWidget'), { ssr: false })

export default function SchedulePage() {
  return (
    <div className="flex flex-col md:flex-row h-full overflow-y-auto md:overflow-hidden">
      <div className="flex-shrink-0 md:flex-1 overflow-hidden flex flex-col h-[70vh] md:h-full">
        <WeekCalendar />
      </div>
      <div className="w-full md:w-80 flex-shrink-0 border-t md:border-t-0 md:border-l border-border overflow-hidden p-3 h-[28rem] md:h-auto">
        <TodoWidget />
      </div>
    </div>
  )
}
