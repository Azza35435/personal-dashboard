'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import type { IncomeStream, IncomeCategory, AccountGroup } from '@/lib/types'

const CATEGORY_CONFIG: Record<IncomeCategory, { label: string; emoji: string }> = {
  freelance: { label: 'Freelance', emoji: '💼' },
  swimming: { label: 'Swimming', emoji: '🏊' },
  investments: { label: 'Investments', emoji: '📈' },
  centrelink: { label: 'Centrelink', emoji: '🏛️' },
}

const GROUP_LABELS: Record<AccountGroup, string> = {
  personal: 'Personal',
  family: 'Family',
  business: 'Business',
}

export default function IncomeWidget() {
  const [streams, setStreams] = useState<IncomeStream[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [adding, setAdding] = useState(false)
  const [newStream, setNewStream] = useState({
    name: '',
    category: 'freelance' as IncomeCategory,
    destination: 'personal' as AccountGroup,
    amount: '',
  })

  const load = () =>
    supabase.from('income_streams').select('*').order('category').then(({ data }) => {
      setStreams(data ?? [])
      setLoading(false)
    })

  useEffect(() => { load() }, [])

  const saveEdit = async (id: string) => {
    const val = parseFloat(editValue)
    if (isNaN(val)) return
    await supabase.from('income_streams').update({ amount: val, updated_at: new Date().toISOString() }).eq('id', id)
    setEditing(null)
    load()
  }

  const addStream = async () => {
    const amount = parseFloat(newStream.amount)
    if (!newStream.name || isNaN(amount)) return
    await supabase.from('income_streams').insert({ ...newStream, amount })
    setAdding(false)
    setNewStream({ name: '', category: 'freelance', destination: 'personal', amount: '' })
    load()
  }

  const deleteStream = async (id: string) => {
    await supabase.from('income_streams').delete().eq('id', id)
    load()
  }

  const total = streams.reduce((s, i) => s + i.amount, 0)
  const totalFn = total * 12 / 26

  return (
    <div className="rounded p-5 flex flex-col gap-3 h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-amber-400 shadow-sm text-gray-900 dark:text-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Income</p>
          <p className="text-2xl font-bold">{formatCurrency(total)}<span className="text-sm font-normal text-gray-400 dark:text-gray-500">/mo</span></p>
          <p className="text-sm text-gray-400 dark:text-gray-500">{formatCurrency(totalFn)}<span className="text-xs">/fn</span></p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 transition"
        >
          + Add
        </button>
      </div>

      {adding && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-2 border border-gray-200 dark:border-gray-700">
          <input
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
            placeholder="Source name"
            value={newStream.name}
            onChange={(e) => setNewStream({ ...newStream, name: e.target.value })}
          />
          <div className="flex gap-2">
            <select
              className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none"
              value={newStream.category}
              onChange={(e) => setNewStream({ ...newStream, category: e.target.value as IncomeCategory })}
            >
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.emoji} {v.label}</option>
              ))}
            </select>
            <select
              className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none"
              value={newStream.destination}
              onChange={(e) => setNewStream({ ...newStream, destination: e.target.value as AccountGroup })}
            >
              {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
              placeholder="Monthly amount"
              type="number"
              value={newStream.amount}
              onChange={(e) => setNewStream({ ...newStream, amount: e.target.value })}
            />
            <button onClick={addStream} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm px-3 py-1.5 rounded transition">Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="animate-pulse h-8 bg-gray-200 dark:bg-gray-700 rounded" />)}
        </div>
      ) : streams.length === 0 ? (
        <p className="text-sm text-gray-400">No income streams yet.</p>
      ) : (
        <div className="space-y-1.5 overflow-y-auto flex-1">
          {streams.map((stream) => {
            const config = CATEGORY_CONFIG[stream.category]
            return (
              <div key={stream.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded px-3 py-2 group border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className="text-base">{config.emoji}</span>
                  <div>
                    <p className="text-sm font-medium leading-tight">{stream.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">→ {GROUP_LABELS[stream.destination as AccountGroup]}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editing === stream.id ? (
                    <div className="flex gap-1">
                      <input
                        autoFocus
                        className="w-24 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-sm text-right outline-none text-gray-900 dark:text-gray-100"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(stream.id); if (e.key === 'Escape') setEditing(null) }}
                      />
                      <button onClick={() => saveEdit(stream.id)} className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold px-2 py-1 rounded">✓</button>
                    </div>
                  ) : (
                    <>
                      <div className="text-right">
                        <button
                          onClick={() => { setEditing(stream.id); setEditValue(String(stream.amount)) }}
                          className="font-bold text-sm block"
                        >
                          {formatCurrency(stream.amount)}<span className="text-xs font-normal text-gray-400">/mo</span>
                        </button>
                        <p className="text-xs text-gray-400">{formatCurrency(stream.amount * 12 / 26)}/fn</p>
                      </div>
                      <button
                        onClick={() => deleteStream(stream.id)}
                        className="opacity-0 group-hover:opacity-40 hover:!opacity-80 text-gray-500 text-xs transition"
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
