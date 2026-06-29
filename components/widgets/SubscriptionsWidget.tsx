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

function advanceDate(dateStr: string | null, cycle: BillingCycle): string {
  const base = dateStr ? new Date(dateStr + 'T00:00:00') : new Date()
  if (cycle === 'monthly') base.setMonth(base.getMonth() + 1)
  else if (cycle === 'fortnightly') base.setDate(base.getDate() + 14)
  else if (cycle === 'weekly') base.setDate(base.getDate() + 7)
  else if (cycle === 'yearly') base.setFullYear(base.getFullYear() + 1)
  return base.toISOString().split('T')[0]
}

const CYCLES: BillingCycle[] = ['monthly', 'fortnightly', 'yearly', 'weekly', 'one-off']
const CATS: SubscriptionCategory[] = ['personal', 'work', 'study']

const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: '/mo', fortnightly: '/fn', yearly: '/yr', weekly: '/wk', 'one-off': '',
}

const CAT_LABEL: Record<SubscriptionCategory, string> = {
  personal: 'Personal', work: 'Work', study: 'Study',
}

const CAT_COLOR: Record<SubscriptionCategory, string> = {
  personal: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  work: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  study: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300',
}

// ── shared form ────────────────────────────────────────────────────────────

interface SubFormProps {
  name: string; setName: (v: string) => void
  amount: string; setAmount: (v: string) => void
  cycle: BillingCycle; setCycle: (v: BillingCycle) => void
  nextDate: string; setNextDate: (v: string) => void
  category: SubscriptionCategory; setCategory: (v: SubscriptionCategory) => void
  curricularId: string; setCurricularId: (v: string) => void
  notes: string; setNotes: (v: string) => void
  paymentType: 'subscription' | 'manual'; setPaymentType: (v: 'subscription' | 'manual') => void
  isRecurring: boolean; setIsRecurring: (v: boolean) => void
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
  paymentType, setPaymentType, isRecurring, setIsRecurring,
  curriculars, onSave, onCancel, saveLabel, autoFocus,
}: SubFormProps) {
  return (
    <div className="space-y-2.5">
      {/* Payment type */}
      <div className="flex gap-1">
        {(['subscription', 'manual'] as const).map(t => (
          <button
            key={t}
            onClick={() => setPaymentType(t)}
            className={`flex-1 text-xs py-1.5 rounded transition border capitalize ${
              paymentType === t
                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white font-medium'
                : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {t === 'subscription' ? '🔄 Subscription' : '✋ Manual payment'}
          </button>
        ))}
      </div>

      {/* Recurring toggle (manual only) */}
      {paymentType === 'manual' && (
        <div className="flex gap-1">
          {[true, false].map(r => (
            <button
              key={String(r)}
              onClick={() => setIsRecurring(r)}
              className={`flex-1 text-xs py-1.5 rounded transition border ${
                isRecurring === r
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white font-medium'
                  : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {r ? 'Recurring' : 'One-off'}
            </button>
          ))}
        </div>
      )}

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
            type="number" min="0" step="0.01"
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
          title={paymentType === 'manual' ? 'Payment due date' : 'Next payment date'}
        />
      </div>

      {/* Billing cycle — hide for one-off manual */}
      {!(paymentType === 'manual' && !isRecurring) && (
        <div className="flex gap-1">
          {CYCLES.filter(c => c !== 'one-off').map(c => (
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
      )}

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
          {curriculars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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

// ── row component ──────────────────────────────────────────────────────────

interface RowProps {
  s: Subscription
  curricularById: Record<string, Curricular>
  onEdit: () => void
  onDelete: () => void
  onMarkPaid?: () => void
  isPaidSection?: boolean
  editNode?: React.ReactNode
  confirmNode?: React.ReactNode
}

function PaymentRow({ s, curricularById, onEdit, onDelete, onMarkPaid, isPaidSection, editNode, confirmNode }: RowProps) {
  const days = daysUntil(s.next_payment_date)
  const cur = s.curricular_id ? curricularById[s.curricular_id] : null
  const daysColor = days == null ? 'text-gray-400'
    : days <= 3 ? 'text-red-500 font-semibold'
    : days <= 7 ? 'text-amber-500 font-medium'
    : 'text-gray-400'
  const effectiveCycle = (s.payment_type === 'manual' && !s.is_recurring) ? 'one-off' : s.billing_cycle

  if (editNode) {
    return (
      <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-3">
        {editNode}
      </div>
    )
  }

  return (
    <div className={`rounded border group ${
      isPaidSection
        ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800 opacity-60'
        : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700'
    }`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {isPaidSection ? <span className="line-through">{s.name}</span> : s.name}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${CAT_COLOR[s.category]}`}>
              {cur ? cur.name : CAT_LABEL[s.category]}
            </span>
          </div>
          {s.notes && <p className="text-xs text-gray-400 truncate mt-0.5">{s.notes}</p>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 text-right">
          <div>
            <p className="text-sm font-semibold tabular-nums">
              {fmtAUD(s.amount)}<span className="text-xs font-normal text-gray-400">{CYCLE_LABEL[effectiveCycle]}</span>
            </p>
            {s.billing_cycle === 'yearly' && !isPaidSection && (
              <p className="text-xs text-gray-400">{fmtAUD(s.amount / 12)}/mo</p>
            )}
          </div>
          {s.next_payment_date && (
            <div className="text-right">
              <p className={`text-xs ${isPaidSection ? 'text-gray-400' : daysColor}`}>
                {isPaidSection ? 'Paid'
                  : days === 0 ? 'Today'
                  : days === 1 ? 'Tomorrow'
                  : days != null && days > 0 ? `${days}d`
                  : 'Overdue'}
              </p>
              <p className="text-xs text-gray-400">{fmtDate(s.next_payment_date)}</p>
            </div>
          )}
          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
            {onMarkPaid && !isPaidSection && (
              <button
                onClick={onMarkPaid}
                className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 font-medium transition"
                title="Mark as paid"
              >
                ✓
              </button>
            )}
            <button onClick={onEdit} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xs transition" title="Edit">✎</button>
            <button onClick={onDelete} className="text-gray-400 hover:text-red-500 text-sm transition leading-none" title="Delete">×</button>
          </div>
        </div>
      </div>

      {/* Inline confirm next date (recurring manual only) */}
      {confirmNode && (
        <div className="px-3 pb-3">
          {confirmNode}
        </div>
      )}
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────────

function emptyForm() {
  return {
    name: '', amount: '', cycle: 'monthly' as BillingCycle,
    nextDate: '', category: 'personal' as SubscriptionCategory,
    curricularId: '', notes: '',
    paymentType: 'subscription' as 'subscription' | 'manual',
    isRecurring: true,
  }
}

export default function SubscriptionsWidget() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [curriculars, setCurriculars] = useState<Curricular[]>([])
  const [loading, setLoading] = useState(true)

  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState(emptyForm())

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm())

  // confirm next-date state for recurring manual "mark paid"
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmDate, setConfirmDate] = useState('')

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
    setEditForm({
      name: s.name, amount: String(s.amount), cycle: s.billing_cycle,
      nextDate: s.next_payment_date ?? '', category: s.category,
      curricularId: s.curricular_id ?? '', notes: s.notes ?? '',
      paymentType: s.payment_type ?? 'subscription',
      isRecurring: s.is_recurring ?? true,
    })
    setAdding(false)
    setConfirmId(null)
  }

  const addSub = async () => {
    const { name, amount, cycle, nextDate, category, curricularId, notes, paymentType, isRecurring } = addForm
    const a = parseFloat(amount)
    if (!name.trim() || isNaN(a) || a <= 0) return
    const effectiveCycle = paymentType === 'manual' && !isRecurring ? 'one-off' : cycle
    await supabase.from('subscriptions').insert({
      name: name.trim(), amount: a, billing_cycle: effectiveCycle,
      next_payment_date: nextDate || null, category,
      curricular_id: (category !== 'personal' && curricularId) ? curricularId : null,
      notes: notes.trim() || null, active: true,
      payment_type: paymentType, is_recurring: isRecurring, paid: false,
    })
    setAddForm(emptyForm())
    setAdding(false)
    load()
  }

  const saveEdit = async () => {
    if (!editingId) return
    const { name, amount, cycle, nextDate, category, curricularId, notes, paymentType, isRecurring } = editForm
    const a = parseFloat(amount)
    if (!name.trim() || isNaN(a) || a <= 0) return
    const effectiveCycle = paymentType === 'manual' && !isRecurring ? 'one-off' : cycle
    await supabase.from('subscriptions').update({
      name: name.trim(), amount: a, billing_cycle: effectiveCycle,
      next_payment_date: nextDate || null, category,
      curricular_id: (category !== 'personal' && curricularId) ? curricularId : null,
      notes: notes.trim() || null,
      payment_type: paymentType, is_recurring: isRecurring,
    }).eq('id', editingId)
    setEditingId(null)
    load()
  }

  const deleteSub = async (id: string) => {
    await supabase.from('subscriptions').update({ active: false }).eq('id', id)
    load()
  }

  const handleMarkPaid = (s: Subscription) => {
    if (!s.is_recurring) {
      // one-off: move to paid section immediately
      supabase.from('subscriptions').update({ paid: true }).eq('id', s.id).then(load)
    } else {
      // recurring: show confirm-next-date prompt
      const suggested = advanceDate(s.next_payment_date, s.billing_cycle)
      setConfirmId(s.id)
      setConfirmDate(suggested)
    }
  }

  const confirmNextDate = async (s: Subscription) => {
    await supabase.from('subscriptions').update({ next_payment_date: confirmDate }).eq('id', s.id)
    setConfirmId(null)
    load()
  }

  const unmarkPaid = async (id: string) => {
    await supabase.from('subscriptions').update({ paid: false }).eq('id', id)
    load()
  }

  const autoSubs = subs.filter(s => (s.payment_type ?? 'subscription') === 'subscription')
  const manualSubs = subs.filter(s => s.payment_type === 'manual' && !s.paid)
  const paidSubs = subs.filter(s => s.payment_type === 'manual' && s.paid)

  const activeSubs = [...autoSubs, ...manualSubs]
  const totalMonthly = activeSubs.reduce((sum, s) => {
    const cycle = (s.payment_type === 'manual' && !s.is_recurring) ? 'one-off' : s.billing_cycle
    return sum + toMonthly(s.amount, cycle)
  }, 0)

  const byCategory = CATS.map(cat => ({
    cat,
    items: activeSubs.filter(s => s.category === cat),
    total: activeSubs.filter(s => s.category === cat).reduce((sum, s) => {
      const cycle = (s.payment_type === 'manual' && !s.is_recurring) ? 'one-off' : s.billing_cycle
      return sum + toMonthly(s.amount, cycle)
    }, 0),
  })).filter(g => g.items.length > 0)

  const sortByDate = (a: Subscription, b: Subscription) => {
    if (!a.next_payment_date && !b.next_payment_date) return 0
    if (!a.next_payment_date) return 1
    if (!b.next_payment_date) return -1
    return a.next_payment_date.localeCompare(b.next_payment_date)
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-emerald-400 rounded shadow-sm p-5">
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />)}
        </div>
      </div>
    )
  }

  const renderRows = (list: Subscription[], showMarkPaid = false) =>
    [...list].sort(sortByDate).map(s => (
      <PaymentRow
        key={s.id}
        s={s}
        curricularById={curricularById}
        onEdit={() => openEdit(s)}
        onDelete={() => deleteSub(s.id)}
        onMarkPaid={showMarkPaid ? () => handleMarkPaid(s) : undefined}
        editNode={editingId === s.id ? (
          <SubForm
            {...editForm}
            setName={v => setEditForm(f => ({ ...f, name: v }))}
            setAmount={v => setEditForm(f => ({ ...f, amount: v }))}
            setCycle={v => setEditForm(f => ({ ...f, cycle: v }))}
            setNextDate={v => setEditForm(f => ({ ...f, nextDate: v }))}
            setCategory={v => setEditForm(f => ({ ...f, category: v }))}
            setCurricularId={v => setEditForm(f => ({ ...f, curricularId: v }))}
            setNotes={v => setEditForm(f => ({ ...f, notes: v }))}
            setPaymentType={v => setEditForm(f => ({ ...f, paymentType: v }))}
            setIsRecurring={v => setEditForm(f => ({ ...f, isRecurring: v }))}
            curriculars={curriculars}
            onSave={saveEdit}
            onCancel={() => setEditingId(null)}
            saveLabel="Save changes"
            autoFocus
          />
        ) : undefined}
        confirmNode={confirmId === s.id ? (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded p-3 space-y-2">
            <p className="text-xs font-medium text-green-700 dark:text-green-400">Confirm next payment date</p>
            <p className="text-xs text-gray-500">Auto-calculated based on {s.billing_cycle} cycle. Change if needed:</p>
            <div className="flex gap-2">
              <input
                type="date"
                className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                value={confirmDate}
                onChange={e => setConfirmDate(e.target.value)}
              />
              <button
                onClick={() => confirmNextDate(s)}
                className="bg-green-600 text-white font-medium text-sm px-3 py-1.5 rounded hover:bg-green-700 transition"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmId(null)}
                className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition px-2"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : undefined}
      />
    ))

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-emerald-400 rounded shadow-sm">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Payments</p>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {fmtAUD(totalMonthly)}<span className="text-xs font-normal text-gray-400">/mo</span>
          </span>
        </div>
        <button
          onClick={() => { setAdding(p => !p); setEditingId(null); setAddForm(emptyForm()) }}
          className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 transition"
        >
          {adding ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <SubForm
            {...addForm}
            setName={v => setAddForm(f => ({ ...f, name: v }))}
            setAmount={v => setAddForm(f => ({ ...f, amount: v }))}
            setCycle={v => setAddForm(f => ({ ...f, cycle: v }))}
            setNextDate={v => setAddForm(f => ({ ...f, nextDate: v }))}
            setCategory={v => setAddForm(f => ({ ...f, category: v }))}
            setCurricularId={v => setAddForm(f => ({ ...f, curricularId: v }))}
            setNotes={v => setAddForm(f => ({ ...f, notes: v }))}
            setPaymentType={v => setAddForm(f => ({ ...f, paymentType: v }))}
            setIsRecurring={v => setAddForm(f => ({ ...f, isRecurring: v }))}
            curriculars={curriculars}
            onSave={addSub}
            onCancel={() => setAdding(false)}
            saveLabel="Save"
            autoFocus
          />
        </div>
      )}

      {subs.length === 0 && !adding ? (
        <div className="px-5 py-8 text-center text-sm text-gray-400">
          No payments yet. Add one to track upcoming payments.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-gray-800">

          {/* Left: Payment lists */}
          <div className="px-5 py-4 space-y-5">

            {/* Subscriptions */}
            {autoSubs.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">🔄 Subscriptions</p>
                <div className="space-y-2">{renderRows(autoSubs, true)}</div>
              </div>
            )}

            {/* Manual payments */}
            {manualSubs.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">✋ Manual payments</p>
                <div className="space-y-2">{renderRows(manualSubs, true)}</div>
              </div>
            )}

            {autoSubs.length === 0 && manualSubs.length === 0 && !adding && (
              <p className="text-sm text-gray-400">No active payments.</p>
            )}

            {/* Paid (one-off manual) */}
            {paidSubs.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">✓ Paid</p>
                <div className="space-y-2">
                  {paidSubs.map(s => (
                    <PaymentRow
                      key={s.id}
                      s={s}
                      curricularById={curricularById}
                      onEdit={() => openEdit(s)}
                      onDelete={() => deleteSub(s.id)}
                      isPaidSection
                      editNode={editingId === s.id ? (
                        <SubForm
                          {...editForm}
                          setName={v => setEditForm(f => ({ ...f, name: v }))}
                          setAmount={v => setEditForm(f => ({ ...f, amount: v }))}
                          setCycle={v => setEditForm(f => ({ ...f, cycle: v }))}
                          setNextDate={v => setEditForm(f => ({ ...f, nextDate: v }))}
                          setCategory={v => setEditForm(f => ({ ...f, category: v }))}
                          setCurricularId={v => setEditForm(f => ({ ...f, curricularId: v }))}
                          setNotes={v => setEditForm(f => ({ ...f, notes: v }))}
                          setPaymentType={v => setEditForm(f => ({ ...f, paymentType: v }))}
                          setIsRecurring={v => setEditForm(f => ({ ...f, isRecurring: v }))}
                          curriculars={curriculars}
                          onSave={saveEdit}
                          onCancel={() => setEditingId(null)}
                          saveLabel="Save changes"
                          autoFocus
                        />
                      ) : undefined}
                    />
                  ))}
                </div>
                <button
                  onClick={() => paidSubs.forEach(s => unmarkPaid(s.id))}
                  className="mt-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                >
                  Clear paid
                </button>
              </div>
            )}
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
                      const cycle = (s.payment_type === 'manual' && !s.is_recurring) ? 'one-off' : s.billing_cycle
                      return (
                        <div key={s.id} className="flex items-center justify-between text-sm px-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-gray-500 text-xs">{s.payment_type === 'manual' ? '✋' : '🔄'}</span>
                            <span className="text-gray-600 dark:text-gray-300 truncate">{s.name}</span>
                            {cur && <span className="text-xs text-gray-400 truncate">· {cur.name}</span>}
                          </div>
                          <span className="text-gray-500 text-xs tabular-nums flex-shrink-0 ml-2">
                            {fmtAUD(toMonthly(s.amount, cycle))}/mo
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
              <div className="text-xs text-gray-400 -mt-2">{fmtAUD(totalMonthly * 12)}/yr</div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
