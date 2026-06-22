'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import type { Account, AccountType, AccountGroup } from '@/lib/types'

const TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  cash: 'Cash',
  owed: 'Owed to Me',
}

const GROUP_LABELS: Record<AccountGroup, string> = {
  personal: 'Personal',
  family: 'Family',
  business: 'Business',
}

export default function AccountsWidget() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', type: 'checking' as AccountType, group_name: 'personal' as AccountGroup, balance: '' })

  const load = () =>
    supabase
      .from('accounts')
      .select('*')
      .order('group_name')
      .then(({ data }) => {
        setAccounts(data ?? [])
        setLoading(false)
      })

  useEffect(() => { load() }, [])

  const saveEdit = async (id: string) => {
    const val = parseFloat(editValue)
    if (isNaN(val)) return
    await supabase.from('accounts').update({ balance: val, updated_at: new Date().toISOString() }).eq('id', id)
    setEditing(null)
    load()
  }

  const addAccount = async () => {
    const balance = parseFloat(newAccount.balance)
    if (!newAccount.name || isNaN(balance)) return
    await supabase.from('accounts').insert({ ...newAccount, balance })
    setAdding(false)
    setNewAccount({ name: '', type: 'checking', group_name: 'personal', balance: '' })
    load()
  }

  const deleteAccount = async (id: string) => {
    await supabase.from('accounts').delete().eq('id', id)
    load()
  }

  const groups = Array.from(new Set(accounts.map((a) => a.group_name))) as AccountGroup[]

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 h-full bg-teal-600 text-white">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Accounts</p>
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition"
        >
          + Add
        </button>
      </div>

      {adding && (
        <div className="bg-white/10 rounded-xl p-3 space-y-2">
          <input
            className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
            placeholder="Account name"
            value={newAccount.name}
            onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
          />
          <div className="flex gap-2">
            <select
              className="flex-1 bg-white/20 rounded-lg px-2 py-1.5 text-sm outline-none"
              value={newAccount.type}
              onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value as AccountType })}
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k} className="text-black">{v}</option>)}
            </select>
            <select
              className="flex-1 bg-white/20 rounded-lg px-2 py-1.5 text-sm outline-none"
              value={newAccount.group_name}
              onChange={(e) => setNewAccount({ ...newAccount, group_name: e.target.value as AccountGroup })}
            >
              {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k} className="text-black">{v}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
              placeholder="Balance"
              type="number"
              value={newAccount.balance}
              onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })}
            />
            <button onClick={addAccount} className="bg-white text-teal-600 font-semibold text-sm px-3 py-1.5 rounded-lg">Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="animate-pulse h-8 bg-white/20 rounded-lg" />)}
        </div>
      ) : accounts.length === 0 ? (
        <p className="text-sm opacity-60">No accounts yet. Add one above.</p>
      ) : (
        <div className="space-y-3 overflow-y-auto flex-1">
          {groups.map((group) => (
            <div key={group}>
              <p className="text-xs font-bold uppercase opacity-60 mb-1">{GROUP_LABELS[group]}</p>
              {accounts.filter((a) => a.group_name === group).map((account) => (
                <div key={account.id} className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2 mb-1.5 group">
                  <div>
                    <p className="text-sm font-medium">{account.name}</p>
                    <p className="text-xs opacity-60">{TYPE_LABELS[account.type]}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {editing === account.id ? (
                      <div className="flex gap-1">
                        <input
                          autoFocus
                          className="w-24 bg-white/20 rounded-lg px-2 py-1 text-sm text-right outline-none"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(account.id); if (e.key === 'Escape') setEditing(null) }}
                        />
                        <button onClick={() => saveEdit(account.id)} className="text-xs bg-white text-teal-600 font-bold px-2 py-1 rounded-lg">✓</button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditing(account.id); setEditValue(String(account.balance)) }}
                          className="font-bold text-sm"
                        >
                          {formatCurrency(account.balance)}
                        </button>
                        <button
                          onClick={() => deleteAccount(account.id)}
                          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs transition"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
