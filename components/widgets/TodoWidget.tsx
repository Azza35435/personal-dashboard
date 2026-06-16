'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate, isPast } from '@/lib/utils'
import type { Todo, Priority, Section } from '@/lib/types'

const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-red-400',
  medium: 'bg-yellow-400',
  low: 'bg-green-400',
}
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

type View = 'priority' | 'sections'

interface TodoRow extends Todo {
  todo_sections: { section_id: string; position: number }[]
}

export default function TodoWidget() {
  const [todos, setTodos] = useState<TodoRow[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('priority')
  const [showCompleted, setShowCompleted] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [adding, setAdding] = useState(false)
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editingSectionName, setEditingSectionName] = useState('')
  const [newTodo, setNewTodo] = useState({
    title: '',
    due_date: '',
    priority: 'medium' as Priority,
    sectionIds: [] as string[],
  })
  const [drag, setDrag] = useState<{ todoId: string; sectionId: string; overIdx: number } | null>(null)

  const load = async () => {
    const [{ data: secs }, { data: tds }] = await Promise.all([
      supabase.from('sections').select('*').order('position'),
      supabase.from('todos').select('*, todo_sections(section_id, position)').order('created_at', { ascending: false }),
    ])
    setSections((secs ?? []) as Section[])
    setTodos((tds ?? []) as TodoRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggle = async (t: TodoRow) => {
    await supabase.from('todos').update({ completed: !t.completed }).eq('id', t.id)
    load()
  }

  const remove = async (id: string) => {
    await supabase.from('todos').delete().eq('id', id)
    load()
  }

  const addTodo = async () => {
    if (!newTodo.title.trim()) return
    const { data: row } = await supabase
      .from('todos')
      .insert({ title: newTodo.title.trim(), due_date: newTodo.due_date || null, priority: newTodo.priority })
      .select()
      .single()
    if (row && newTodo.sectionIds.length > 0) {
      const junctions = newTodo.sectionIds.map((sid) => {
        const inSection = todos.filter(t => !t.completed && t.todo_sections.some(ts => ts.section_id === sid))
        const pos = inSection.filter(t => PRIORITY_ORDER[t.priority] < PRIORITY_ORDER[newTodo.priority]).length
        return { todo_id: row.id, section_id: sid, position: pos }
      })
      await supabase.from('todo_sections').insert(junctions)
    }
    setAdding(false)
    setNewTodo({ title: '', due_date: '', priority: 'medium', sectionIds: [] })
    load()
  }

  const addSection = async () => {
    const name = newSectionName.trim()
    setAddingSection(false)
    setNewSectionName('')
    if (!name) return
    await supabase.from('sections').insert({ name, position: sections.length })
    load()
  }

  const renameSection = async (id: string) => {
    const name = editingSectionName.trim()
    setEditingSection(null)
    if (!name) return
    await supabase.from('sections').update({ name }).eq('id', id)
    load()
  }

  const deleteSection = async (id: string) => {
    await supabase.from('sections').delete().eq('id', id)
    load()
  }

  const getSectionTodos = (sectionId: string | null): TodoRow[] => {
    const filtered = sectionId
      ? todos.filter(t => t.todo_sections.some(ts => ts.section_id === sectionId))
      : todos.filter(t => t.todo_sections.length === 0)
    const visible = showCompleted ? filtered : filtered.filter(t => !t.completed)
    if (sectionId) {
      return [...visible].sort((a, b) => {
        const ap = a.todo_sections.find(ts => ts.section_id === sectionId)?.position ?? 999
        const bp = b.todo_sections.find(ts => ts.section_id === sectionId)?.position ?? 999
        return ap - bp
      })
    }
    return [...visible].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  }

  const onDrop = async (sectionId: string) => {
    if (!drag || drag.sectionId !== sectionId || drag.overIdx < 0) { setDrag(null); return }
    const items = getSectionTodos(sectionId)
    const fromIdx = items.findIndex(t => t.id === drag.todoId)
    if (fromIdx < 0 || fromIdx === drag.overIdx) { setDrag(null); return }
    const reordered = [...items]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(drag.overIdx, 0, moved)
    await Promise.all(
      reordered.map((t, i) =>
        supabase.from('todo_sections').update({ position: i }).eq('todo_id', t.id).eq('section_id', sectionId)
      )
    )
    setDrag(null)
    load()
  }

  const toggleSectionPick = (id: string) =>
    setNewTodo(p => ({
      ...p,
      sectionIds: p.sectionIds.includes(id) ? p.sectionIds.filter(s => s !== id) : [...p.sectionIds, id],
    }))

  const renderItem = (todo: TodoRow, sectionId: string | null, idx: number) => {
    const isDragging = drag?.todoId === todo.id
    const isOver = drag?.sectionId === sectionId && drag.overIdx === idx && drag.todoId !== todo.id
    const draggable = view === 'sections' && sectionId !== null
    return (
      <div
        key={todo.id}
        draggable={draggable}
        onDragStart={() => sectionId && setDrag({ todoId: todo.id, sectionId, overIdx: idx })}
        onDragOver={(e) => { e.preventDefault(); sectionId && drag && setDrag(p => p ? { ...p, overIdx: idx } : p) }}
        onDragEnd={() => setDrag(null)}
        className={[
          'flex items-start gap-2.5 bg-white/10 rounded-xl px-3 py-2 group transition',
          todo.completed ? 'opacity-50' : '',
          isDragging ? 'opacity-30 scale-95' : '',
          isOver ? 'border-t-2 border-white/60' : '',
          draggable ? 'cursor-grab active:cursor-grabbing' : '',
        ].join(' ')}
      >
        <button
          onClick={() => toggle(todo)}
          className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 border-white/50 flex items-center justify-center transition
            ${todo.completed ? 'bg-white/60' : 'hover:bg-white/20'}`}
        >
          {todo.completed && <span className="text-rose-500 text-xs font-bold">✓</span>}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-tight ${todo.completed ? 'line-through' : ''}`}>{todo.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {view === 'priority' && todo.todo_sections.map(ts => {
              const sec = sections.find(s => s.id === ts.section_id)
              return sec ? (
                <span key={ts.section_id} className="text-xs bg-white/20 px-1.5 py-0.5 rounded-full leading-none">{sec.name}</span>
              ) : null
            })}
            {todo.due_date && (
              <span className={`text-xs ${!todo.completed && isPast(todo.due_date) ? 'text-red-200 font-semibold' : 'opacity-60'}`}>
                {formatDate(todo.due_date)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLORS[todo.priority]}`} />
          <button onClick={() => remove(todo.id)} className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs transition">×</button>
        </div>
      </div>
    )
  }

  const visibleTodos = showCompleted ? todos : todos.filter(t => !t.completed)

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 h-full bg-rose-500 text-white">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider opacity-80">To-Do</p>
          <p className="text-xs opacity-60">{todos.filter(t => !t.completed).length} remaining</p>
        </div>
        <div className="flex gap-1.5 items-center">
          <button
            onClick={() => setShowCompleted(p => !p)}
            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition"
          >
            {showCompleted ? 'Hide done' : 'Show done'}
          </button>
          <button
            onClick={() => setAdding(p => !p)}
            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition"
          >
            + Add
          </button>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-0.5 bg-white/10 rounded-full p-0.5 self-start">
        {(['priority', 'sections'] as View[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`text-xs capitalize px-3 py-1 rounded-full transition
              ${view === v ? 'bg-white text-rose-500 font-bold' : 'hover:bg-white/20'}`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Add task form */}
      {adding && (
        <div className="bg-white/10 rounded-xl p-3 space-y-2">
          <input
            autoFocus
            className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
            placeholder="Task title"
            value={newTodo.title}
            onChange={e => setNewTodo(p => ({ ...p, title: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addTodo()}
          />
          <div className="flex gap-2">
            <select
              className="flex-1 bg-white/20 rounded-lg px-2 py-1.5 text-sm outline-none"
              value={newTodo.priority}
              onChange={e => setNewTodo(p => ({ ...p, priority: e.target.value as Priority }))}
            >
              <option value="high" className="text-black">High</option>
              <option value="medium" className="text-black">Medium</option>
              <option value="low" className="text-black">Low</option>
            </select>
            <input
              type="date"
              className="flex-1 bg-white/20 rounded-lg px-3 py-1.5 text-sm outline-none"
              value={newTodo.due_date}
              onChange={e => setNewTodo(p => ({ ...p, due_date: e.target.value }))}
            />
          </div>
          {sections.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sections.map(s => (
                <button
                  key={s.id}
                  onClick={() => toggleSectionPick(s.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition
                    ${newTodo.sectionIds.includes(s.id)
                      ? 'bg-white text-rose-500 border-white font-semibold'
                      : 'border-white/40 hover:bg-white/20'}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          <button onClick={addTodo} className="w-full bg-white text-rose-500 font-semibold text-sm py-1.5 rounded-lg">
            Save
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-8 bg-white/20 rounded-lg" />)}
        </div>
      ) : (
        <div className="overflow-y-auto flex-1 space-y-4 pr-0.5">

          {/* ── Priority view ── */}
          {view === 'priority' && (
            visibleTodos.length === 0
              ? <p className="text-sm opacity-60">No tasks. Great work!</p>
              : (['high', 'medium', 'low'] as Priority[]).map(p => {
                const group = visibleTodos.filter(t => t.priority === p)
                if (group.length === 0) return null
                return (
                  <div key={p}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[p]}`} />
                      <span className="text-xs font-semibold uppercase tracking-wider opacity-70">{p}</span>
                    </div>
                    <div className="space-y-1.5">
                      {group.map((t, i) => renderItem(t, null, i))}
                    </div>
                  </div>
                )
              })
          )}

          {/* ── Sections view ── */}
          {view === 'sections' && (
            <>
              {sections.map(sec => {
                const items = getSectionTodos(sec.id)
                const isCollapsed = collapsed[sec.id]
                return (
                  <div key={sec.id}>
                    <div className="flex items-center gap-2 mb-1.5 group/sec">
                      <button
                        onClick={() => setCollapsed(p => ({ ...p, [sec.id]: !p[sec.id] }))}
                        className="text-xs opacity-50 hover:opacity-100 w-3 text-left leading-none"
                      >
                        {isCollapsed ? '▶' : '▼'}
                      </button>
                      {editingSection === sec.id ? (
                        <input
                          autoFocus
                          className="flex-1 bg-white/20 rounded px-2 py-0.5 text-sm font-semibold outline-none"
                          value={editingSectionName}
                          onChange={e => setEditingSectionName(e.target.value)}
                          onBlur={() => renameSection(sec.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameSection(sec.id)
                            if (e.key === 'Escape') setEditingSection(null)
                          }}
                        />
                      ) : (
                        <span
                          className="text-sm font-semibold cursor-pointer hover:opacity-80 transition"
                          onDoubleClick={() => { setEditingSection(sec.id); setEditingSectionName(sec.name) }}
                        >
                          {sec.name}
                        </span>
                      )}
                      <span className="text-xs opacity-40">{items.length}</span>
                      <button
                        onClick={() => deleteSection(sec.id)}
                        className="ml-auto opacity-0 group-hover/sec:opacity-40 hover:!opacity-100 text-sm transition"
                      >
                        ×
                      </button>
                    </div>
                    {!isCollapsed && (
                      <div
                        className="space-y-1.5 min-h-[1.5rem]"
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => onDrop(sec.id)}
                      >
                        {items.length === 0
                          ? <p className="text-xs opacity-40 px-3">No tasks</p>
                          : items.map((t, i) => renderItem(t, sec.id, i))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* No Section group */}
              {(() => {
                const items = getSectionTodos(null)
                if (items.length === 0) return null
                return (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <button
                        onClick={() => setCollapsed(p => ({ ...p, __none__: !p.__none__ }))}
                        className="text-xs opacity-40 hover:opacity-80 w-3 text-left leading-none"
                      >
                        {collapsed.__none__ ? '▶' : '▼'}
                      </button>
                      <span className="text-xs font-semibold uppercase tracking-wider opacity-40">No Section</span>
                      <span className="text-xs opacity-30">{items.length}</span>
                    </div>
                    {!collapsed.__none__ && (
                      <div className="space-y-1.5">
                        {items.map((t, i) => renderItem(t, null, i))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Add section */}
              <div className="pt-1">
                {addingSection ? (
                  <input
                    autoFocus
                    className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
                    placeholder="Section name — press Enter to save"
                    value={newSectionName}
                    onChange={e => setNewSectionName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') addSection()
                      if (e.key === 'Escape') { setAddingSection(false); setNewSectionName('') }
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setAddingSection(true)}
                    className="text-xs opacity-50 hover:opacity-100 transition"
                  >
                    + Add section
                  </button>
                )}
              </div>
            </>
          )}

        </div>
      )}
    </div>
  )
}
