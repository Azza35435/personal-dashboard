'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface Goal {
  id: string
  title: string
  completed: boolean
  month: string | null
}

interface Milestone {
  id: string
  goal_id: string
  completed: boolean
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function GoalsDashboardWidget() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [milestones, setMilestones] = useState<Record<string, Milestone[]>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const cm = currentMonth()
    const { data: goalsData } = await supabase
      .from('goals')
      .select('id, title, completed, month')
      .eq('horizon', 'monthly')
      .order('position')
      .order('created_at')

    const all = (goalsData ?? []) as Goal[]
    const filtered = all.filter(g => g.month === cm || (g.month && g.month < cm && !g.completed))
    setGoals(filtered)

    if (filtered.length > 0) {
      const ids = filtered.map(g => g.id)
      const { data: ms } = await supabase
        .from('goal_milestones')
        .select('id, goal_id, completed')
        .in('goal_id', ids)
      const grouped: Record<string, Milestone[]> = {}
      for (const m of (ms ?? []) as Milestone[]) {
        if (!grouped[m.goal_id]) grouped[m.goal_id] = []
        grouped[m.goal_id].push(m)
      }
      setMilestones(grouped)
    }

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const totalGoals = goals.length
  const completedGoals = goals.filter(g => g.completed).length
  const overallPct = totalGoals === 0 ? 0 : Math.round((completedGoals / totalGoals) * 100)

  const d = new Date()
  const monthLabel = d.toLocaleDateString('en-AU', { month: 'long' })

  return (
    <div className="h-full flex flex-col border hairline overflow-hidden" style={{ background: 'var(--paper-raised)', borderColor: 'var(--rule)' }}>
      <div className="px-6 pt-6 pb-3 flex-shrink-0 flex items-baseline justify-between">
        <div>
          <p className="eyebrow">Goals — {monthLabel}</p>
        </div>
        {totalGoals > 0 && (
          <div className="text-right">
            <p
              className="num"
              style={{ fontFamily: 'var(--font-newsreader)', fontSize: 22, color: 'var(--oxblood)' }}
            >
              {overallPct}%
            </p>
            <p className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>{completedGoals}/{totalGoals} done</p>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-5">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-6 rounded" style={{ background: 'var(--rule)' }} />)}
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-4">
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>No monthly goals set yet</p>
            <Link href="/goals" className="text-xs font-medium" style={{ color: 'var(--oxblood)' }}>
              Set goals →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            {goals.map(goal => {
              const ms = milestones[goal.id] ?? []
              const done = ms.filter(m => m.completed).length
              const total = ms.length
              const pct = total > 0 ? Math.round((done / total) * 100) : null

              return (
                <div key={goal.id} className={goal.completed ? 'opacity-50' : ''}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="text-sm flex-1 min-w-0 truncate"
                      style={goal.completed
                        ? { color: 'var(--ink-faint)', textDecoration: 'line-through' }
                        : { color: 'var(--ink)' }}
                    >
                      {goal.title}
                    </span>
                    {total > 0 && (
                      <span
                        className="num flex-shrink-0"
                        style={{ fontFamily: 'var(--font-newsreader)', fontSize: 14, color: 'var(--oxblood)' }}
                      >
                        {pct}%
                      </span>
                    )}
                  </div>
                  {pct !== null && (
                    <div className="mt-2 h-[2px] relative" style={{ background: 'var(--rule-strong)' }}>
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{ width: `${pct}%`, background: 'var(--sage)' }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {goals.length > 0 && (
        <div className="px-6 pb-4 flex-shrink-0 pt-2" style={{ borderTop: '1px solid var(--rule)' }}>
          <Link href="/goals" className="text-[11px] font-medium" style={{ color: 'var(--ink-faint)' }}>
            Full tracker →
          </Link>
        </div>
      )}
    </div>
  )
}
