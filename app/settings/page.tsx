'use client'

import dynamic from 'next/dynamic'

const SettingsWidget = dynamic(() => import('@/components/widgets/SettingsWidget'), { ssr: false })

export default function SettingsPage() {
  return <SettingsWidget />
}
