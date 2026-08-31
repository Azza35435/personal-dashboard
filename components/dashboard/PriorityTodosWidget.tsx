'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Todo } from '@/lib/types'

const todayStr = () => new Date().toISOString().split('T')[0]

export default function PriorityTodosWidget() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const today = todayStr()
    const { data } = await supabase
      .from('todos')
      .select('*')
      .eq('completed', false)
      .or(`priority.eq.high,due_date.eq.${today}`)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(20)
    setTodos(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (todo: Todo) => {
    await supabase.from('todos').update({ completed: true }).eq('id', todo.id)
    setTodos(prev => prev.filter(t => t.id !== todo.id))
  }

  const today = todayStr()

  return (
    <div className="h-full flex flex-col border hairline overflow-hidden" style={{ background: 'var(--paper-raised)', borderColor: 'var(--rule)' }}>
      <div className="px-6 pt-6 pb-3 flex-shrink-0 flex items-baseline justify-between">
        <p className="eyebrow">Priority Todos</p>
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>{todos.length} open</span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-5">
        {loading ? (
          <div className="space-y-2 pt-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 rounded animate-pulse" style={{ background: 'var(--rule)' }} />
            ))}
          </div>
        ) : todos.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>All clear — no priority tasks</p>
          </div>
        ) : (
          <div>
            {todos.map((todo, idx) => {
              const isDueToday = todo.due_date === today
              return (
                <div
                  key={todo.id}
                  className="flex items-start gap-3 py-2.5 group"
                  style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--rule)' }}
                >
                  <button
                    onClick={() => toggle(todo)}
                    className="mt-[5px] w-3.5 h-3.5 rounded-full border flex-shrink-0 transition"
                    style={{ borderColor: 'var(--ink-faint)', borderWidth: 1.5 }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug" style={{ color: 'var(--ink)' }}>{todo.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: todo.priority === 'high' ? 'var(--oxblood)' : 'var(--ink-faint)' }}
                      />
                      <p className="text-[10px] capitalize" style={{ color: 'var(--ink-faint)' }}>{todo.priority}</p>
                      {isDueToday && (
                        <span className="text-[10px] font-medium" style={{ color: 'var(--oxblood)' }}>Due today</span>
                      )}
                      {todo.due_date && !isDueToday && (
                        <span className="text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                          {new Date(todo.due_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
