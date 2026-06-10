'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import type { Account } from '@/lib/types'

export default function NetWorthWidget() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('accounts')
      .select('*')
      .then(({ data }) => {
        setAccounts(data ?? [])
        setLoading(false)
      })
  }, [])

  const netWorth = accounts.reduce((sum, a) => {
    return a.type === 'owed' ? sum + a.balance : sum + a.balance
  }, 0)

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-2 h-full bg-emerald-500 text-white">
      <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Net Worth</p>
      {loading ? (
        <div className="animate-pulse h-10 bg-white/20 rounded-lg w-32" />
      ) : (
        <p className="text-4xl font-bold">{formatCurrency(netWorth)}</p>
      )}
      <p className="text-xs opacity-70 mt-auto">
        Across {accounts.length} account{accounts.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
