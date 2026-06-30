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
    <div className="rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] bg-white dark:bg-gray-900 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Monthly Goals</p>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{monthLabel}</p>
        </div>
        {totalGoals > 0 && (
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{overallPct}<span className="text-sm font-normal text-gray-400">%</span></p>
            <p className="text-[10px] text-gray-400">{completedGoals}/{totalGoals} done</p>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-8 bg-gray-100 dark:bg-gray-800 rounded" />)}
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-4">
            <p className="text-xs text-gray-400 dark:text-gray-500">No monthly goals set yet</p>
            <Link href="/goals" className="text-xs text-violet-500 hover:text-violet-600 font-medium">
              Set goals →
            </Link>
          </div>
        ) : (
          goals.map(goal => {
            const ms = milestones[goal.id] ?? []
            const done = ms.filter(m => m.completed).length
            const total = ms.length
            const pct = total > 0 ? Math.round((done / total) * 100) : null

            return (
              <div key={goal.id} className={`rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-2 ${goal.completed ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-medium flex-1 min-w-0 truncate ${goal.completed ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-200'}`}>
                    {goal.title}
                  </span>
                  {total > 0 && (
                    <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">{done}/{total}</span>
                  )}
                </div>
                {pct !== null && (
                  <div className="mt-1.5 h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-400' : 'bg-violet-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer link */}
      {goals.length > 0 && (
        <div className="px-4 pb-3 flex-shrink-0 border-t border-gray-50 dark:border-gray-800 pt-2">
          <Link href="/goals" className="text-[11px] text-violet-500 hover:text-violet-600 font-medium">
            Full tracker →
          </Link>
        </div>
      )}
    </div>
  )
}
