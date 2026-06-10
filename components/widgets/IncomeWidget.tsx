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

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 h-full bg-amber-500 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Income</p>
          <p className="text-2xl font-bold">{formatCurrency(total)}<span className="text-sm font-normal opacity-70">/mo</span></p>
        </div>
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
            placeholder="Source name"
            value={newStream.name}
            onChange={(e) => setNewStream({ ...newStream, name: e.target.value })}
          />
          <div className="flex gap-2">
            <select
              className="flex-1 bg-white/20 rounded-lg px-2 py-1.5 text-sm outline-none"
              value={newStream.category}
              onChange={(e) => setNewStream({ ...newStream, category: e.target.value as IncomeCategory })}
            >
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                <option key={k} value={k} className="text-black">{v.emoji} {v.label}</option>
              ))}
            </select>
            <select
              className="flex-1 bg-white/20 rounded-lg px-2 py-1.5 text-sm outline-none"
              value={newStream.destination}
              onChange={(e) => setNewStream({ ...newStream, destination: e.target.value as AccountGroup })}
            >
              {Object.entries(GROUP_LABELS).map(([k, v]) => <option key={k} value={k} className="text-black">{v}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
              placeholder="Monthly amount"
              type="number"
              value={newStream.amount}
              onChange={(e) => setNewStream({ ...newStream, amount: e.target.value })}
            />
            <button onClick={addStream} className="bg-white text-amber-600 font-semibold text-sm px-3 py-1.5 rounded-lg">Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="animate-pulse h-8 bg-white/20 rounded-lg" />)}
        </div>
      ) : streams.length === 0 ? (
        <p className="text-sm opacity-60">No income streams yet.</p>
      ) : (
        <div className="space-y-1.5 overflow-y-auto flex-1">
          {streams.map((stream) => {
            const config = CATEGORY_CONFIG[stream.category]
            return (
              <div key={stream.id} className="flex items-center justify-between bg-white/10 rounded-xl px-3 py-2 group">
                <div className="flex items-center gap-2">
                  <span className="text-base">{config.emoji}</span>
                  <div>
                    <p className="text-sm font-medium leading-tight">{stream.name}</p>
                    <p className="text-xs opacity-60">→ {GROUP_LABELS[stream.destination as AccountGroup]}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editing === stream.id ? (
                    <div className="flex gap-1">
                      <input
                        autoFocus
                        className="w-24 bg-white/20 rounded-lg px-2 py-1 text-sm text-right outline-none"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(stream.id); if (e.key === 'Escape') setEditing(null) }}
                      />
                      <button onClick={() => saveEdit(stream.id)} className="text-xs bg-white text-amber-600 font-bold px-2 py-1 rounded-lg">✓</button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditing(stream.id); setEditValue(String(stream.amount)) }}
                        className="font-bold text-sm"
                      >
                        {formatCurrency(stream.amount)}
                      </button>
                      <button
                        onClick={() => deleteStream(stream.id)}
                        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs transition"
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
