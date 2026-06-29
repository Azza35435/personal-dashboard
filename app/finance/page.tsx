'use client'

import dynamic from 'next/dynamic'
import FinanceLock from '@/components/FinanceLock'

const NetWorthWidget = dynamic(() => import('@/components/widgets/NetWorthWidget'), { ssr: false })
const AccountsWidget = dynamic(() => import('@/components/widgets/AccountsWidget'), { ssr: false })
const IncomeWidget = dynamic(() => import('@/components/widgets/IncomeWidget'), { ssr: false })
const SubscriptionsWidget = dynamic(() => import('@/components/widgets/SubscriptionsWidget'), { ssr: false })

export default function FinancePage() {
  return (
    <FinanceLock>
      <NetWorthWidget />
      <AccountsWidget />
      <IncomeWidget />
      <div className="col-span-full">
        <SubscriptionsWidget />
      </div>
    </FinanceLock>
  )
}
