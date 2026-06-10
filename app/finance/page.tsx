'use client'

import dynamic from 'next/dynamic'

const NetWorthWidget = dynamic(() => import('@/components/widgets/NetWorthWidget'), { ssr: false })
const AccountsWidget = dynamic(() => import('@/components/widgets/AccountsWidget'), { ssr: false })
const IncomeWidget = dynamic(() => import('@/components/widgets/IncomeWidget'), { ssr: false })

export default function FinancePage() {
  return (
    <div className="p-6 h-full overflow-auto">
      <h1 className="text-xl font-semibold mb-6">Finance</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        <NetWorthWidget />
        <AccountsWidget />
        <IncomeWidget />
      </div>
    </div>
  )
}
