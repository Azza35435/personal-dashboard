'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Todo } from '@/lib/types'

const todayStr = () => new Date().toISOString().split('T')[0]

const PRIORITY_COLOR: Record<string, string> = {
  high: 'bg-rose-400',
  medium: 'bg-amber-400',
  low: 'bg-gray-300 dark:bg-gray-600',
}

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
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] border border-gray-100 dark:border-gray-800 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Priority Tasks</p>
          <span className="text-xs text-gray-400">{todos.length} left</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))
        ) : todos.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-gray-400">All clear — no priority tasks</p>
          </div>
        ) : todos.map(todo => {
          const isDueToday = todo.due_date === today
          return (
            <div
              key={todo.id}
              className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 group"
            >
              <button
                onClick={() => toggle(todo)}
                className="mt-0.5 w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0 hover:border-gray-500 dark:hover:border-gray-400 transition flex items-center justify-center group-hover:border-gray-400"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{todo.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_COLOR[todo.priority]}`} />
                  <p className="text-[10px] text-gray-400 capitalize">{todo.priority}</p>
                  {isDueToday && (
                    <span className="text-[10px] text-rose-400 font-medium">Due today</span>
                  )}
                  {todo.due_date && !isDueToday && (
                    <span className="text-[10px] text-gray-400">
                      {new Date(todo.due_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
