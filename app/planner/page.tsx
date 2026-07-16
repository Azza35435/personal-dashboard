'use client'

import dynamic from 'next/dynamic'

const PlannerWidget = dynamic(() => import('@/components/widgets/PlannerWidget'), { ssr: false })

export default function PlannerPage() {
  return <PlannerWidget />
}
