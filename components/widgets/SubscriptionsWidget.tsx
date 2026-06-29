'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Subscription, BillingCycle, SubscriptionCategory, Curricular } from '@/lib/types'

// ── helpers ────────────────────────────────────────────────────────────────

function toMonthly(amount: number, cycle: BillingCycle): number {
  if (cycle === 'monthly') return amount
  if (cycle === 'fortnightly') return (amount * 26) / 12
  if (cycle === 'yearly') return amount / 12
  if (cycle === 'weekly') return (amount * 52) / 12
  return 0
}

function fmtAUD(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 })
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)
  return Math.ceil(diff / 86400000)
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

const CYCLES: BillingCycle[] = ['monthly', 'fortnightly', 'yearly', 'weekly', 'one-off']
const CATS: SubscriptionCategory[] = ['personal', 'work', 'study']

const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: '/mo',
  fortnightly: '/fn',
  yearly: '/yr',
  weekly: '/wk',
  'one-off': '',
}

const CAT_LABEL: Record<SubscriptionCategory, string> = {
  personal: 'Personal',
  work: 'Work',
  study: 'Study',
}

const CAT_COLOR: Record<SubscriptionCategory, string> = {
  personal: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  work: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  study: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
}

// ── shared form UI ─────────────────────────────────────────────────────────

interface SubFormProps {
  name: string; setName: (v: string) => void
  amount: string; setAmount: (v: string) => void
  cycle: BillingCycle; setCycle: (v: BillingCycle) => void
  nextDate: string; setNextDate: (v: string) => void
  category: SubscriptionCategory; setCategory: (v: SubscriptionCategory) => void
  curricularId: string; setCurricularId: (v: string) => void
  notes: string; setNotes: (v: string) => void
  curriculars: Curricular[]
  onSave: () => void
  onCancel: () => void
  saveLabel: string
  autoFocus?: boolean
}

function SubForm({
  name, setName, amount, setAmount, cycle, setCycle,
  nextDate, setNextDate, category, setCategory,
  curricularId, setCurricularId, notes, setNotes,
  curriculars, onSave, onCancel, saveLabel, autoFocus,
}: SubFormProps) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <input
          autoFocus={autoFocus}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
          placeholder="Name (e.g. Netflix)"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <div className="flex gap-1.5 items-center">
          <span className="text-sm text-gray-500 flex-shrink-0">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
            placeholder="Amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>
        <input
          type="date"
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
          value={nextDate}
          onChange={e => setNextDate(e.target.value)}
          title="Next payment date"
        />
      </div>

      <div className="flex gap-1">
        {CYCLES.map(c => (
          <button
            key={c}
            onClick={() => setCycle(c)}
            className={`flex-1 text-xs py-1.5 rounded capitalize transition border ${
              cycle === c
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white font-medium'
                : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        {CATS.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`flex-1 text-xs py-1.5 rounded capitalize transition border ${
              category === cat
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white font-medium'
                : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {category !== 'personal' && curriculars.length > 0 && (
        <select
          className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none"
          value={curricularId}
          onChange={e => setCurricularId(e.target.value)}
        >
          <option value="">— link to a curricular (optional) —</option>
          {curriculars.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      <input
        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
        placeholder="Notes (optional)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSave()}
      />

      <div className="flex gap-2">
        <button
          onClick={onSave}
          className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm py-1.5 rounded hover:opacity-90 transition"
        >
          {saveLabel}
        </button>
        <button
          onClick={onCancel}
          className="px-4 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────────

export default function SubscriptionsWidget() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [curriculars, setCurriculars] = useState<Curricular[]>([])
  const [loading, setLoading] = useState(true)

  // Add form
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [nextDate, setNextDate] = useState('')
  const [category, setCategory] = useState<SubscriptionCategory>('personal')
  const [curricularId, setCurricularId] = useState('')
  const [notes, setNotes] = useState('')

  // Edit form
  const [editingId, setEditingId] = useState<string | null>(null)
  const [eName, setEName] = useState('')
  const [eAmount, setEAmount] = useState('')
  const [eCycle, setECycle] = useState<BillingCycle>('monthly')
  const [eNextDate, setENextDate] = useState('')
  const [eCategory, setECategory] = useState<SubscriptionCategory>('personal')
  const [eCurricularId, setECurricularId] = useState('')
  const [eNotes, setENotes] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from('subscriptions').select('*').eq('active', true).order('next_payment_date', { nullsFirst: false }),
      supabase.from('curriculars').select('*').order('position'),
    ])
    setSubs((s ?? []) as Subscription[])
    setCurriculars((c ?? []) as Curricular[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const curricularById = Object.fromEntries(curriculars.map(c => [c.id, c]))

  function openEdit(s: Subscription) {
    setEditingId(s.id)
    setEName(s.name)
    setEAmount(String(s.amount))
    setECycle(s.billing_cycle)
    setENextDate(s.next_payment_date ?? '')
    setECategory(s.category)
    setECurricularId(s.curricular_id ?? '')
    setENotes(s.notes ?? '')
    setAdding(false)
  }

  const addSub = async () => {
    const n = name.trim()
    const a = parseFloat(amount)
    if (!n || isNaN(a) || a <= 0) return
    await supabase.from('subscriptions').insert({
      name: n, amount: a, billing_cycle: cycle,
      next_payment_date: nextDate || null, category,
      curricular_id: (category !== 'personal' && curricularId) ? curricularId : null,
      notes: notes.trim() || null, active: true,
    })
    setName(''); setAmount(''); setCycle('monthly'); setNextDate('')
    setCategory('personal'); setCurricularId(''); setNotes('')
    setAdding(false)
    load()
  }

  const saveEdit = async () => {
    if (!editingId) return
    const a = parseFloat(eAmount)
    if (!eName.trim() || isNaN(a) || a <= 0) return
    await supabase.from('subscriptions').update({
      name: eName.trim(), amount: a, billing_cycle: eCycle,
      next_payment_date: eNextDate || null, category: eCategory,
      curricular_id: (eCategory !== 'personal' && eCurricularId) ? eCurricularId : null,
      notes: eNotes.trim() || null,
    }).eq('id', editingId)
    setEditingId(null)
    load()
  }

  const deleteSub = async (id: string) => {
    await supabase.from('subscriptions').update({ active: false }).eq('id', id)
    load()
  }

  const totalMonthly = subs.reduce((sum, s) => sum + toMonthly(s.amount, s.billing_cycle), 0)

  const byCategory = CATS.map(cat => ({
    cat,
    items: subs.filter(s => s.category === cat),
    total: subs.filter(s => s.category === cat).reduce((sum, s) => sum + toMonthly(s.amount, s.billing_cycle), 0),
  })).filter(g => g.items.length > 0)

  const upcoming = [...subs].sort((a, b) => {
    if (!a.next_payment_date && !b.next_payment_date) return 0
    if (!a.next_payment_date) return 1
    if (!b.next_payment_date) return -1
    return a.next_payment_date.localeCompare(b.next_payment_date)
  })

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-emerald-400 rounded shadow-sm p-5">
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-emerald-400 rounded shadow-sm">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Subscriptions</p>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {fmtAUD(totalMonthly)}<span className="text-xs font-normal text-gray-400">/mo</span>
          </span>
        </div>
        <button
          onClick={() => { setAdding(p => !p); setEditingId(null) }}
          className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 transition"
        >
          {adding ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <SubForm
            name={name} setName={setName}
            amount={amount} setAmount={setAmount}
            cycle={cycle} setCycle={setCycle}
            nextDate={nextDate} setNextDate={setNextDate}
            category={category} setCategory={setCategory}
            curricularId={curricularId} setCurricularId={setCurricularId}
            notes={notes} setNotes={setNotes}
            curriculars={curriculars}
            onSave={addSub}
            onCancel={() => setAdding(false)}
            saveLabel="Save subscription"
            autoFocus
          />
        </div>
      )}

      {subs.length === 0 && !adding ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          No subscriptions yet. Add one to track upcoming payments.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-gray-800">

          {/* Left: Upcoming payments */}
          <div className="px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Upcoming payments</p>
            <div className="space-y-2">
              {upcoming.map(s => {
                const days = daysUntil(s.next_payment_date)
                const cur = s.curricular_id ? curricularById[s.curricular_id] : null
                const daysColor = days == null ? 'text-gray-400'
                  : days <= 3 ? 'text-red-500 font-semibold'
                  : days <= 7 ? 'text-amber-500 font-medium'
                  : 'text-gray-400'

                if (editingId === s.id) {
                  return (
                    <div key={s.id} className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-3">
                      <SubForm
                        name={eName} setName={setEName}
                        amount={eAmount} setAmount={setEAmount}
                        cycle={eCycle} setCycle={setECycle}
                        nextDate={eNextDate} setNextDate={setENextDate}
                        category={eCategory} setCategory={setECategory}
                        curricularId={eCurricularId} setCurricularId={setECurricularId}
                        notes={eNotes} setNotes={setENotes}
                        curriculars={curriculars}
                        onSave={saveEdit}
                        onCancel={() => setEditingId(null)}
                        saveLabel="Save changes"
                        autoFocus
                      />
                    </div>
                  )
                }

                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.name}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${CAT_COLOR[s.category]}`}>
                          {cur ? cur.name : CAT_LABEL[s.category]}
                        </span>
                      </div>
                      {s.notes && <p className="text-xs text-gray-400 truncate mt-0.5">{s.notes}</p>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-right">
                      <div>
                        <p className="text-sm font-semibold tabular-nums">
                          {fmtAUD(s.amount)}<span className="text-xs font-normal text-gray-400">{CYCLE_LABEL[s.billing_cycle]}</span>
                        </p>
                        {s.billing_cycle === 'yearly' && (
                          <p className="text-xs text-gray-400">{fmtAUD(s.amount / 12)}/mo</p>
                        )}
                      </div>
                      {s.next_payment_date && (
                        <div className="text-right">
                          <p className={`text-xs ${daysColor}`}>
                            {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days != null && days > 0 ? `${days}d` : 'Overdue'}
                          </p>
                          <p className="text-xs text-gray-400">{fmtDate(s.next_payment_date)}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => openEdit(s)}
                          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs transition"
                          title="Edit"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => deleteSub(s.id)}
                          className="text-gray-400 hover:text-red-500 text-sm transition leading-none"
                          title="Delete"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: Category breakdown */}
          <div className="px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">By category</p>
            <div className="space-y-4">
              {byCategory.map(({ cat, items, total }) => (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${CAT_COLOR[cat]}`}>
                      {CAT_LABEL[cat]}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{fmtAUD(total)}<span className="text-xs font-normal text-gray-400">/mo</span></span>
                  </div>
                  <div className="space-y-1">
                    {items.map(s => {
                      const cur = s.curricular_id ? curricularById[s.curricular_id] : null
                      return (
                        <div key={s.id} className="flex items-center justify-between text-sm px-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-gray-600 dark:text-gray-300 truncate">{s.name}</span>
                            {cur && (
                              <span className="text-xs text-gray-400 truncate">· {cur.name}</span>
                            )}
                          </div>
                          <span className="text-gray-500 text-xs tabular-nums flex-shrink-0 ml-2">
                            {fmtAUD(toMonthly(s.amount, s.billing_cycle))}/mo
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total</span>
                <span className="text-base font-semibold tabular-nums">{fmtAUD(totalMonthly)}<span className="text-xs font-normal text-gray-400">/mo</span></span>
              </div>
              <div className="text-xs text-gray-400 -mt-2">
                {fmtAUD(totalMonthly * 12)}/yr
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
