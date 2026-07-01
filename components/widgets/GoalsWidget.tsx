'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type Horizon = 'monthly' | 'short' | 'long'

interface GoalCategory {
  id: string
  name: string
  position: number
}

interface Goal {
  id: string
  title: string
  category_id: string | null
  horizon: Horizon
  target_date: string | null
  notes: string | null
  month: string | null
  completed: boolean
  position: number
  created_at: string
}

interface Milestone {
  id: string
  goal_id: string
  title: string
  completed: boolean
  position: number
}

interface Decision {
  id: string
  content: string
  date: string
  created_at: string
}

const HORIZON_LABELS: Record<Horizon, string> = {
  monthly: 'Monthly',
  short: 'Short-term',
  long: 'Long-term',
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function viewMonth(offset: number) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const EARLIEST_MONTH = '2026-06'

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatMonth(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

function progressFromMilestones(ms: Milestone[]) {
  if (!ms.length) return null
  return Math.round((ms.filter(m => m.completed).length / ms.length) * 100)
}

export default function GoalsWidget() {
  const [tab, setTab] = useState<Horizon | 'decisions'>('monthly')
  const [categories, setCategories] = useState<GoalCategory[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [milestones, setMilestones] = useState<Record<string, Milestone[]>>({})
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [monthOffset, setMonthOffset] = useState(0)

  // Expanded goal
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Category editing
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  // Goal adding
  const [addingGoalCatId, setAddingGoalCatId] = useState<string | null>(null)
  const [newGoalTitle, setNewGoalTitle] = useState('')
  const [newGoalDate, setNewGoalDate] = useState('')

  // Goal editing (inline on expanded card)
  const [editingGoal, setEditingGoal] = useState<Partial<Goal> & { id: string } | null>(null)

  // Milestone adding
  const [addingMilestoneGoalId, setAddingMilestoneGoalId] = useState<string | null>(null)
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')

  // Decision adding
  const [addingDecision, setAddingDecision] = useState(false)
  const [newDecisionContent, setNewDecisionContent] = useState('')
  const [newDecisionDate, setNewDecisionDate] = useState(localToday())

  const load = useCallback(async () => {
    setLoading(true)

    const [catsRes, goalsRes, decisionsRes] = await Promise.all([
      supabase.from('goal_categories').select('*').order('position'),
      tab !== 'decisions'
        ? supabase.from('goals').select('*').eq('horizon', tab).order('position').order('created_at')
        : Promise.resolve({ data: [] }),
      tab === 'decisions'
        ? supabase.from('goal_decisions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

    if ('error' in catsRes && catsRes.error) setSaveError(catsRes.error.message)
    if ('error' in goalsRes && goalsRes.error) setSaveError(goalsRes.error.message)
    if ('error' in decisionsRes && decisionsRes.error) setSaveError(decisionsRes.error.message)

    const loadedCategories = (catsRes.data ?? []) as GoalCategory[]
    const loadedGoals = (goalsRes.data ?? []) as Goal[]
    const loadedDecisions = (decisionsRes.data ?? []) as Decision[]

    setCategories(loadedCategories)
    setDecisions(loadedDecisions)

    // For monthly tab: include selected month + past incomplete carried goals
    let filtered = loadedGoals
    if (tab === 'monthly') {
      const vm = viewMonth(monthOffset)
      filtered = loadedGoals.filter(g => g.month === vm || (g.month && g.month < vm && !g.completed))
    }
    setGoals(filtered)

    // Load milestones for all goals
    if (filtered.length > 0) {
      const ids = filtered.map(g => g.id)
      const { data: ms } = await supabase
        .from('goal_milestones')
        .select('*')
        .in('goal_id', ids)
        .order('position')
      const grouped: Record<string, Milestone[]> = {}
      for (const m of (ms ?? []) as Milestone[]) {
        if (!grouped[m.goal_id]) grouped[m.goal_id] = []
        grouped[m.goal_id].push(m)
      }
      setMilestones(grouped)
    } else {
      setMilestones({})
    }

    setLoading(false)
  }, [tab, monthOffset])

  useEffect(() => { load() }, [load])

  // ── Categories ────────────────────────────────────────────────

  const addCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    const { error } = await supabase.from('goal_categories').insert({ name, position: categories.length })
    if (error) { setSaveError(error.message); return }
    setNewCatName('')
    setAddingCat(false)
    load()
  }

  const renameCategory = async (id: string) => {
    const name = editingCatName.trim()
    if (!name) return
    await supabase.from('goal_categories').update({ name }).eq('id', id)
    setEditingCatId(null)
    load()
  }

  const deleteCategory = async (id: string) => {
    await supabase.from('goal_categories').delete().eq('id', id)
    load()
  }

  // ── Goals ─────────────────────────────────────────────────────

  const addGoal = async (catId: string) => {
    const title = newGoalTitle.trim()
    if (!title) return
    setSaveError(null)
    const { error } = await supabase.from('goals').insert({
      title,
      category_id: catId,
      horizon: tab === 'decisions' ? 'short' : tab,
      target_date: newGoalDate || null,
      month: tab === 'monthly' ? viewMonth(monthOffset) : null,
      position: goals.filter(g => g.category_id === catId).length,
    })
    if (error) { setSaveError(error.message); return }
    setNewGoalTitle('')
    setNewGoalDate('')
    setAddingGoalCatId(null)
    load()
  }

  const updateGoal = async (id: string, fields: Partial<Goal>) => {
    await supabase.from('goals').update(fields).eq('id', id)
    load()
  }

  const deleteGoal = async (id: string) => {
    await supabase.from('goals').delete().eq('id', id)
    if (expandedId === id) setExpandedId(null)
    load()
  }

  // ── Milestones ────────────────────────────────────────────────

  const toggleMilestone = async (m: Milestone) => {
    setMilestones(prev => ({
      ...prev,
      [m.goal_id]: (prev[m.goal_id] ?? []).map(x => x.id === m.id ? { ...x, completed: !x.completed } : x),
    }))
    await supabase.from('goal_milestones').update({ completed: !m.completed }).eq('id', m.id)
  }

  const addMilestone = async (goalId: string) => {
    const title = newMilestoneTitle.trim()
    if (!title) return
    const pos = (milestones[goalId] ?? []).length
    const { error } = await supabase.from('goal_milestones').insert({ goal_id: goalId, title, position: pos })
    if (error) { setSaveError(error.message); return }
    setNewMilestoneTitle('')
    setAddingMilestoneGoalId(null)
    load()
  }

  const deleteMilestone = async (m: Milestone) => {
    await supabase.from('goal_milestones').delete().eq('id', m.id)
    setMilestones(prev => ({
      ...prev,
      [m.goal_id]: (prev[m.goal_id] ?? []).filter(x => x.id !== m.id),
    }))
  }

  // ── Decisions ─────────────────────────────────────────────────

  const addDecision = async () => {
    const content = newDecisionContent.trim()
    if (!content) return
    setSaveError(null)
    const { error } = await supabase.from('goal_decisions').insert({ content, date: newDecisionDate })
    if (error) { setSaveError(error.message); return }
    setNewDecisionContent('')
    setNewDecisionDate(localToday())
    setAddingDecision(false)
    load()
  }

  const deleteDecision = async (id: string) => {
    await supabase.from('goal_decisions').delete().eq('id', id)
    load()
  }

  // ── Render helpers ────────────────────────────────────────────

  function renderProgressBar(pct: number | null) {
    if (pct === null) return null
    return (
      <div className="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-400' : 'bg-violet-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    )
  }

  function renderGoalCard(goal: Goal) {
    const ms = milestones[goal.id] ?? []
    const pct = progressFromMilestones(ms)
    const isExpanded = expandedId === goal.id
    const isCarried = tab === 'monthly' && goal.month !== null && goal.month < viewMonth(monthOffset)

    return (
      <div
        key={goal.id}
        className={`rounded border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 transition ${
          goal.completed ? 'opacity-50' : ''
        }`}
      >
        {/* Goal header row */}
        <button
          onClick={() => setExpandedId(isExpanded ? null : goal.id)}
          className="w-full text-left px-3 py-2.5 flex items-start gap-2 group"
        >
          {/* Complete toggle */}
          <button
            onClick={e => { e.stopPropagation(); updateGoal(goal.id, { completed: !goal.completed }) }}
            className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 transition flex items-center justify-center ${
              goal.completed
                ? 'border-emerald-400 bg-emerald-400'
                : 'border-gray-300 dark:border-gray-600 hover:border-violet-400'
            }`}
            title={goal.completed ? 'Mark incomplete' : 'Mark complete'}
          >
            {goal.completed && <span className="text-white text-[8px] leading-none">✓</span>}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-medium leading-snug ${goal.completed ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                {goal.title}
              </span>
              {isCarried && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium flex-shrink-0">
                  carried from {formatMonth(goal.month!)}
                </span>
              )}
              {goal.target_date && (
                <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                  by {new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
            {pct !== null && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1">{renderProgressBar(pct)}</div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
                  {ms.filter(m => m.completed).length}/{ms.length}
                </span>
              </div>
            )}
          </div>

          <span className={`text-gray-300 dark:text-gray-600 text-xs flex-shrink-0 mt-0.5 transition ${isExpanded ? 'rotate-90' : ''}`}>›</span>
        </button>

        {/* Expanded body */}
        {isExpanded && (
          <div className="px-3 pb-3 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-2">
            {/* Edit title / date / notes */}
            {editingGoal?.id === goal.id ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm outline-none focus:border-violet-400"
                  value={editingGoal.title ?? goal.title}
                  onChange={e => setEditingGoal({ ...editingGoal, title: e.target.value })}
                  placeholder="Goal title"
                />
                <input
                  type="date"
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm outline-none focus:border-violet-400 text-gray-700 dark:text-gray-300"
                  value={editingGoal.target_date ?? goal.target_date ?? ''}
                  onChange={e => setEditingGoal({ ...editingGoal, target_date: e.target.value || null })}
                />
                <textarea
                  rows={2}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm outline-none focus:border-violet-400 resize-none placeholder-gray-400"
                  value={editingGoal.notes ?? goal.notes ?? ''}
                  onChange={e => setEditingGoal({ ...editingGoal, notes: e.target.value })}
                  placeholder="Notes…"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (editingGoal) {
                        await updateGoal(goal.id, {
                          title: editingGoal.title ?? goal.title,
                          target_date: editingGoal.target_date ?? goal.target_date,
                          notes: editingGoal.notes ?? goal.notes,
                        })
                      }
                      setEditingGoal(null)
                    }}
                    className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium px-3 py-1.5 rounded"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditingGoal(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5 flex-1 min-w-0">
                  {goal.notes && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{goal.notes}</p>
                  )}
                  {!goal.notes && (
                    <p className="text-xs text-gray-300 dark:text-gray-600 italic">No notes</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setEditingGoal({ id: goal.id, title: goal.title, target_date: goal.target_date, notes: goal.notes })}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => deleteGoal(goal.id)}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* Milestones */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">Milestones</p>
              <div className="space-y-1">
                {ms.map(m => (
                  <div key={m.id} className="flex items-center gap-2 group/ms">
                    <button
                      onClick={() => toggleMilestone(m)}
                      className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition ${
                        m.completed
                          ? 'bg-emerald-400 border-emerald-400'
                          : 'border-gray-300 dark:border-gray-600 hover:border-violet-400'
                      }`}
                    >
                      {m.completed && <span className="text-white text-[8px] leading-none">✓</span>}
                    </button>
                    <span className={`text-xs flex-1 leading-snug ${m.completed ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {m.title}
                    </span>
                    <button
                      onClick={() => deleteMilestone(m)}
                      className="opacity-0 group-hover/ms:opacity-40 hover:!opacity-80 text-gray-500 text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* Add milestone */}
              {addingMilestoneGoalId === goal.id ? (
                <div className="flex gap-1.5 mt-2">
                  <input
                    autoFocus
                    className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-xs outline-none focus:border-violet-400 placeholder-gray-400"
                    placeholder="Milestone…"
                    value={newMilestoneTitle}
                    onChange={e => setNewMilestoneTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addMilestone(goal.id)
                      if (e.key === 'Escape') { setAddingMilestoneGoalId(null); setNewMilestoneTitle('') }
                    }}
                  />
                  <button onClick={() => addMilestone(goal.id)} className="text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-2.5 py-1 rounded font-medium">
                    Add
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setAddingMilestoneGoalId(goal.id); setNewMilestoneTitle('') }}
                  className="mt-1.5 text-[11px] text-gray-400 hover:text-violet-500 dark:hover:text-violet-400 transition"
                >
                  + Add milestone
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderCategorySection(cat: GoalCategory) {
    const catGoals = goals.filter(g => g.category_id === cat.id)
    const isEditingName = editingCatId === cat.id

    return (
      <div key={cat.id} className="space-y-2">
        {/* Category header */}
        <div className="flex items-center justify-between group/cat">
          {isEditingName ? (
            <div className="flex items-center gap-1.5 flex-1">
              <input
                autoFocus
                className="text-xs font-semibold uppercase tracking-widest bg-transparent border-b border-violet-400 outline-none text-gray-700 dark:text-gray-300 w-32"
                value={editingCatName}
                onChange={e => setEditingCatName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') renameCategory(cat.id)
                  if (e.key === 'Escape') setEditingCatId(null)
                }}
              />
              <button onClick={() => renameCategory(cat.id)} className="text-[10px] text-violet-500 font-medium">Save</button>
              <button onClick={() => setEditingCatId(null)} className="text-[10px] text-gray-400">Cancel</button>
            </div>
          ) : (
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
              {cat.name}
              <button
                onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name) }}
                className="opacity-0 group-hover/cat:opacity-60 hover:!opacity-100 text-gray-400 hover:text-gray-600 transition normal-case tracking-normal font-normal"
                title="Rename"
              >
                ✎
              </button>
              <button
                onClick={() => deleteCategory(cat.id)}
                className="opacity-0 group-hover/cat:opacity-60 hover:!opacity-100 text-gray-400 hover:text-red-400 transition normal-case tracking-normal font-normal"
                title="Delete category"
              >
                ×
              </button>
            </p>
          )}

          <button
            onClick={() => { setAddingGoalCatId(cat.id); setNewGoalTitle(''); setNewGoalDate('') }}
            className="text-[11px] text-gray-400 hover:text-violet-500 dark:hover:text-violet-400 transition"
          >
            + Add goal
          </button>
        </div>

        {/* Add goal form */}
        {addingGoalCatId === cat.id && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-2.5 space-y-2">
            <input
              autoFocus
              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm outline-none focus:border-violet-400 placeholder-gray-400"
              placeholder="Goal title…"
              value={newGoalTitle}
              onChange={e => setNewGoalTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addGoal(cat.id); if (e.key === 'Escape') setAddingGoalCatId(null) }}
            />
            <div className="flex gap-2">
              <input
                type="date"
                className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-xs outline-none text-gray-700 dark:text-gray-300"
                value={newGoalDate}
                onChange={e => setNewGoalDate(e.target.value)}
                placeholder="Target date (optional)"
              />
              <button onClick={() => addGoal(cat.id)} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-xs px-3 py-1.5 rounded">
                Add
              </button>
              <button onClick={() => setAddingGoalCatId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Goals list */}
        <div className="space-y-1.5">
          {catGoals.length === 0 && (
            <p className="text-xs text-gray-300 dark:text-gray-600 italic px-1">No goals yet</p>
          )}
          {catGoals.map(g => renderGoalCard(g))}
        </div>
      </div>
    )
  }

  function renderDecisions() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Decision Log</p>
          <button
            onClick={() => { setAddingDecision(true); setNewDecisionContent(''); setNewDecisionDate(localToday()) }}
            className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 transition"
          >
            + Add decision
          </button>
        </div>

        {addingDecision && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-3 space-y-2">
            <input
              type="date"
              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm outline-none text-gray-700 dark:text-gray-300"
              value={newDecisionDate}
              onChange={e => setNewDecisionDate(e.target.value)}
            />
            <textarea
              autoFocus
              rows={3}
              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm outline-none focus:border-violet-400 resize-none placeholder-gray-400"
              placeholder="What decision did you make and why…"
              value={newDecisionContent}
              onChange={e => setNewDecisionContent(e.target.value)}
            />
            <div className="flex gap-2">
              <button onClick={addDecision} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-xs px-3 py-1.5 rounded">Save</button>
              <button onClick={() => setAddingDecision(false)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {decisions.length === 0 && !addingDecision && (
            <p className="text-sm text-gray-400 dark:text-gray-500">No decisions logged yet.</p>
          )}
          {decisions.map(d => (
            <div key={d.id} className="bg-gray-50 dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700 p-3 group">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium flex-shrink-0">
                  {new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <button
                  onClick={() => deleteDecision(d.id)}
                  className="opacity-0 group-hover:opacity-40 hover:!opacity-80 text-gray-500 text-xs"
                >
                  ×
                </button>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 leading-relaxed whitespace-pre-wrap">{d.content}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const TABS: Array<{ key: Horizon | 'decisions'; label: string; desc?: string }> = [
    { key: 'monthly', label: 'Monthly' },
    { key: 'short', label: 'Short-term', desc: '6-12 mo' },
    { key: 'long', label: 'Long-term', desc: '5+ yr' },
    { key: 'decisions', label: 'Decisions' },
  ]

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 rounded shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Goals</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setExpandedId(null) }}
            className={`flex-1 px-2 py-2.5 text-xs font-medium transition border-b-2 leading-tight ${
              tab === t.key
                ? 'border-violet-400 text-violet-600 dark:text-violet-400'
                : 'border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span className="block">{t.label}</span>
            {t.desc && <span className="text-[9px] font-normal opacity-60 block">{t.desc}</span>}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {saveError && (
        <div className="mx-5 mt-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
          <span className="flex-1">{saveError}</span>
          <button onClick={() => setSaveError(null)} className="flex-shrink-0 text-red-400 hover:text-red-600">×</button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-10 bg-gray-100 dark:bg-gray-800 rounded" />)}
          </div>
        ) : tab === 'decisions' ? (
          renderDecisions()
        ) : (
          <div className="space-y-6">
            {tab === 'monthly' && (
              <div className="pb-1 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <p className="text-base font-semibold text-gray-800 dark:text-gray-200">
                  {new Date(viewMonth(monthOffset) + '-01T00:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setMonthOffset(o => o - 1)}
                    disabled={viewMonth(monthOffset - 1) < EARLIEST_MONTH}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setMonthOffset(o => o + 1)}
                    disabled={monthOffset >= 0}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
            {categories.map(cat => renderCategorySection(cat))}

            {/* Add category */}
            {addingCat ? (
              <div className="flex gap-2 items-center">
                <input
                  autoFocus
                  className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2.5 py-1.5 text-sm outline-none focus:border-violet-400 placeholder-gray-400"
                  placeholder="Category name…"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') setAddingCat(false) }}
                />
                <button onClick={addCategory} className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-xs px-3 py-1.5 rounded">Add</button>
                <button onClick={() => setAddingCat(false)} className="text-xs text-gray-400 px-1">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setAddingCat(true)}
                className="text-xs text-gray-400 hover:text-violet-500 dark:hover:text-violet-400 transition"
              >
                + Add category
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
