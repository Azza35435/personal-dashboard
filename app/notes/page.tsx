'use client'

import dynamic from 'next/dynamic'

const NotesWidget = dynamic(() => import('@/components/widgets/NotesWidget'), { ssr: false })

export default function NotesPage() {
  return (
    <div className="p-6 h-full overflow-auto">
      <h1 className="text-xl font-semibold mb-6">Notes</h1>
      <NotesWidget />
    </div>
  )
}
