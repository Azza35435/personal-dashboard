'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate, isPast } from '@/lib/utils'
import type { Todo, Priority } from '@/lib/types'

const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-red-400',
  medium: 'bg-yellow-400',
  low: 'bg-green-400',
}

const PROJECTS = ['Personal', 'Work', 'Swimming', 'Business', 'Finance']

export default function TodoWidget() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<string | null>(null)
  const [newTodo, setNewTodo] = useState({
    title: '',
    project: 'Personal',
    due_date: '',
    priority: 'medium' as Priority,
  })

  const load = () =>
    supabase
      .from('todos')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setTodos(data ?? [])
        setLoading(false)
      })

  useEffect(() => { load() }, [])

  const toggle = async (todo: Todo) => {
    await supabase.from('todos').update({ completed: !todo.completed }).eq('id', todo.id)
    load()
  }

  const deleteTodo = async (id: string) => {
    await supabase.from('todos').delete().eq('id', id)
    load()
  }

  const addTodo = async () => {
    if (!newTodo.title.trim()) return
    await supabase.from('todos').insert({
      ...newTodo,
      due_date: newTodo.due_date || null,
    })
    setAdding(false)
    setNewTodo({ title: '', project: 'Personal', due_date: '', priority: 'medium' })
    load()
  }

  const projects = Array.from(new Set(todos.map((t) => t.project).filter(Boolean))) as string[]
  const displayed = filter ? todos.filter((t) => t.project === filter) : todos

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 h-full bg-rose-500 text-white">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider opacity-80">To-Do</p>
          <p className="text-xs opacity-60">
            {todos.filter((t) => !t.completed).length} remaining
          </p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition"
        >
          + Add
        </button>
      </div>

      {projects.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilter(null)}
            className={`text-xs px-2.5 py-1 rounded-full transition ${!filter ? 'bg-white text-rose-500 font-bold' : 'bg-white/20 hover:bg-white/30'}`}
          >
            All
          </button>
          {projects.map((p) => (
            <button
              key={p}
              onClick={() => setFilter(p === filter ? null : p)}
              className={`text-xs px-2.5 py-1 rounded-full transition ${filter === p ? 'bg-white text-rose-500 font-bold' : 'bg-white/20 hover:bg-white/30'}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {adding && (
        <div className="bg-white/10 rounded-xl p-3 space-y-2">
          <input
            autoFocus
            className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
            placeholder="Task title"
            value={newTodo.title}
            onChange={(e) => setNewTodo({ ...newTodo, title: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') addTodo() }}
          />
          <div className="flex gap-2">
            <select
              className="flex-1 bg-white/20 rounded-lg px-2 py-1.5 text-sm outline-none"
              value={newTodo.project}
              onChange={(e) => setNewTodo({ ...newTodo, project: e.target.value })}
            >
              {PROJECTS.map((p) => <option key={p} value={p} className="text-black">{p}</option>)}
            </select>
            <select
              className="flex-1 bg-white/20 rounded-lg px-2 py-1.5 text-sm outline-none"
              value={newTodo.priority}
              onChange={(e) => setNewTodo({ ...newTodo, priority: e.target.value as Priority })}
            >
              <option value="high" className="text-black">High</option>
              <option value="medium" className="text-black">Medium</option>
              <option value="low" className="text-black">Low</option>
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              className="flex-1 bg-white/20 rounded-lg px-3 py-1.5 text-sm outline-none"
              value={newTodo.due_date}
              onChange={(e) => setNewTodo({ ...newTodo, due_date: e.target.value })}
            />
            <button onClick={addTodo} className="bg-white text-rose-500 font-semibold text-sm px-3 py-1.5 rounded-lg">Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="animate-pulse h-8 bg-white/20 rounded-lg" />)}
        </div>
      ) : displayed.length === 0 ? (
        <p className="text-sm opacity-60">No tasks. Great work!</p>
      ) : (
        <div className="space-y-1.5 overflow-y-auto flex-1">
          {displayed.map((todo) => (
            <div
              key={todo.id}
              className={`flex items-start gap-2.5 bg-white/10 rounded-xl px-3 py-2 group ${todo.completed ? 'opacity-50' : ''}`}
            >
              <button
                onClick={() => toggle(todo)}
                className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 border-white/50 flex items-center justify-center transition ${todo.completed ? 'bg-white/60' : 'hover:bg-white/20'}`}
              >
                {todo.completed && <span className="text-rose-500 text-xs font-bold">✓</span>}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-tight ${todo.completed ? 'line-through' : ''}`}>{todo.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {todo.project && <span className="text-xs opacity-60">{todo.project}</span>}
                  {todo.due_date && (
                    <span className={`text-xs ${!todo.completed && isPast(todo.due_date) ? 'text-red-200 font-semibold' : 'opacity-60'}`}>
                      {formatDate(todo.due_date)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[todo.priority]}`} />
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs transition"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
