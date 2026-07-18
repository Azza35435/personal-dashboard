'use client'

import dynamic from 'next/dynamic'

const DeadlinesCalendar = dynamic(() => import('@/components/widgets/DeadlinesCalendar'), { ssr: false })

export default function DeadlinesPage() {
  return (
    <div className="p-3 sm:p-6 h-full overflow-auto">
      <h1 className="text-xl font-semibold mb-6">Deadlines</h1>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm p-5 h-[calc(100%-4rem)]">
        <DeadlinesCalendar />
      </div>
    </div>
  )
}
