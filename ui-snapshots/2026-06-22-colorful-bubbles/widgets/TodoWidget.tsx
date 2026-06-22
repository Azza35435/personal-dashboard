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

interface DragState {
  todoId: string
  groupKey: string
  sourceIndex: number
  overIndex: number
  items: TodoRow[]
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

interface EditingCard {
  todoId: string
  title: string
  priority: Priority
  dueDate: string
  sectionIds: string[]
  anchorRight: number  // right edge of the ··· button (viewport coords)
  anchorBottom: number // bottom edge of the ··· button (viewport coords)
}

interface SectionDragState {
  sectionId: string
  sectionName: string
  sectionColor: string | null
  sourceIndex: number
  overIndex: number
  capturedSections: Section[]
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

const toRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
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
  const [newSectionColor, setNewSectionColor] = useState('#6366f1')
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [editingSectionName, setEditingSectionName] = useState('')
  const [editingTodo, setEditingTodo] = useState<string | null>(null)
  const [editingTodoTitle, setEditingTodoTitle] = useState('')
  const [newTodo, setNewTodo] = useState({
    title: '',
    due_date: '',
    priority: 'medium' as Priority,
    sectionIds: [] as string[],
  })
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [sectionDrag, setSectionDrag] = useState<SectionDragState | null>(null)
  const [editingCard, setEditingCard] = useState<EditingCard | null>(null)

  const load = async () => {
    const [{ data: secs }, { data: tds }] = await Promise.all([
      supabase.from('sections').select('*').order('position'),
      supabase.from('todos').select('*, todo_sections(section_id, position)').order('position', { ascending: true }),
    ])
    setSections((secs ?? []) as Section[])
    setTodos((tds ?? []) as TodoRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Pointer-event drag system — subscribes once per drag, uses a mutable local ref
  useEffect(() => {
    if (!dragging) return

    let cur = dragging
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    const onMove = (e: PointerEvent) => {
      let newOver = cur.overIndex
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        if (!(el instanceof HTMLElement) || el.dataset.dragFloat) continue
        const gk = el.dataset.groupKey
        const idxStr = el.dataset.index
        if (gk === cur.groupKey && idxStr !== undefined) {
          const idx = parseInt(idxStr)
          if (!isNaN(idx)) {
            const rect = el.getBoundingClientRect()
            newOver = e.clientY <= rect.top + rect.height / 2 ? idx : idx + 1
            break
          }
        }
      }
      cur = { ...cur, x: e.clientX, y: e.clientY, overIndex: newOver }
      setDragging(cur)
    }

    const onUp = () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setDragging(null)
      commitDrop(cur)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [!!dragging]) // eslint-disable-line react-hooks/exhaustive-deps

  // Section drag — same pointer-event pattern, detects data-section-index on section wrappers
  useEffect(() => {
    if (!sectionDrag) return

    let cur = sectionDrag
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    const onMove = (e: PointerEvent) => {
      let newOver = cur.overIndex
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        if (!(el instanceof HTMLElement) || el.dataset.dragFloat) continue
        const idxStr = el.dataset.sectionIndex
        if (idxStr !== undefined) {
          const idx = parseInt(idxStr)
          if (!isNaN(idx)) {
            const rect = el.getBoundingClientRect()
            newOver = e.clientY <= rect.top + rect.height / 2 ? idx : idx + 1
            break
          }
        }
      }
      cur = { ...cur, x: e.clientX, y: e.clientY, overIndex: newOver }
      setSectionDrag(cur)
    }

    const onUp = () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      setSectionDrag(null)
      commitSectionDrop(cur)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [!!sectionDrag]) // eslint-disable-line react-hooks/exhaustive-deps

  const commitSectionDrop = async (d: SectionDragState) => {
    const adjusted = d.overIndex > d.sourceIndex ? d.overIndex - 1 : d.overIndex
    if (adjusted === d.sourceIndex) return
    const reordered = [...d.capturedSections]
    const [moved] = reordered.splice(d.sourceIndex, 1)
    reordered.splice(adjusted, 0, moved)
    await Promise.all(reordered.map((s, i) =>
      supabase.from('sections').update({ position: i }).eq('id', s.id)
    ))
    load()
  }

  const commitDrop = async (d: DragState) => {
    const adjusted = d.overIndex > d.sourceIndex ? d.overIndex - 1 : d.overIndex
    if (adjusted === d.sourceIndex) return
    const reordered = [...d.items]
    const [moved] = reordered.splice(d.sourceIndex, 1)
    reordered.splice(adjusted, 0, moved)
    const isPriorityGroup = (['high', 'medium', 'low'] as string[]).includes(d.groupKey)
    if (isPriorityGroup) {
      await Promise.all(reordered.map((t, i) =>
        supabase.from('todos').update({ position: i }).eq('id', t.id)
      ))
    } else {
      await Promise.all(reordered.map((t, i) =>
        supabase.from('todo_sections').update({ position: i }).eq('todo_id', t.id).eq('section_id', d.groupKey)
      ))
    }
    load()
  }

  const toggle = async (t: TodoRow) => {
    await supabase.from('todos').update({ completed: !t.completed }).eq('id', t.id)
    load()
  }

  const remove = async (id: string) => {
    await supabase.from('todos').delete().eq('id', id)
    load()
  }

  const openEdit = (e: React.MouseEvent, todo: TodoRow) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setEditingCard({
      todoId: todo.id,
      title: todo.title,
      priority: todo.priority,
      dueDate: todo.due_date ?? '',
      sectionIds: todo.todo_sections.map(ts => ts.section_id),
      anchorRight: rect.right,
      anchorBottom: rect.bottom,
    })
  }

  const saveEdit = async () => {
    if (!editingCard || !editingCard.title.trim()) return
    const { todoId, title, priority, dueDate, sectionIds } = editingCard
    await supabase.from('todos').update({ title: title.trim(), priority, due_date: dueDate || null }).eq('id', todoId)
    await supabase.from('todo_sections').delete().eq('todo_id', todoId)
    if (sectionIds.length > 0) {
      await supabase.from('todo_sections').insert(
        sectionIds.map((sid, pos) => ({ todo_id: todoId, section_id: sid, position: pos }))
      )
    }
    setEditingCard(null)
    load()
  }

  useEffect(() => {
    if (!editingCard) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditingCard(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [!!editingCard]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateTodoTitle = async (id: string, title: string) => {
    const t = title.trim()
    setEditingTodo(null)
    if (!t) return
    await supabase.from('todos').update({ title: t }).eq('id', id)
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
    await supabase.from('sections').insert({ name, color: newSectionColor, position: sections.length })
    setNewSectionColor('#6366f1')
    load()
  }

  const renameSection = async (id: string) => {
    const name = editingSectionName.trim()
    setEditingSection(null)
    if (!name) return
    await supabase.from('sections').update({ name }).eq('id', id)
    load()
  }

  const updateSectionColor = async (id: string, color: string) => {
    await supabase.from('sections').update({ color }).eq('id', id)
    setSections(prev => prev.map(s => s.id === id ? { ...s, color } : s))
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

  const resolveCardStyle = (todo: TodoRow, sectionId: string | null) => {
    const sectionColor = sectionId ? sections.find(s => s.id === sectionId)?.color ?? null : null
    const firstSectionColor = view === 'priority' && todo.todo_sections.length > 0
      ? sections.find(s => s.id === todo.todo_sections[0].section_id)?.color ?? null
      : null
    const c = sectionColor ?? firstSectionColor
    return c
      ? { backgroundColor: toRgba(c, 0.3), border: `1px solid ${toRgba(c, 0.5)}` }
      : { backgroundColor: 'rgba(255,255,255,0.1)' }
  }

  const toggleSectionPick = (id: string) =>
    setNewTodo(p => ({
      ...p,
      sectionIds: p.sectionIds.includes(id) ? p.sectionIds.filter(s => s !== id) : [...p.sectionIds, id],
    }))

  const renderItem = (todo: TodoRow, sectionId: string | null, groupKey: string | null, idx: number, items: TodoRow[]) => {
    const isDragSource = dragging?.todoId === todo.id
    const canDrag = groupKey !== null && !editingTodo

    return (
      <div
        key={todo.id}
        data-todo-id={todo.id}
        data-group-key={groupKey ?? ''}
        data-index={String(idx)}
        onPointerDown={canDrag ? (e) => {
          if (e.button !== 0) return
          e.preventDefault()
          const rect = e.currentTarget.getBoundingClientRect()
          setDragging({
            todoId: todo.id,
            groupKey: groupKey!,
            sourceIndex: idx,
            overIndex: idx,
            items,
            x: e.clientX,
            y: e.clientY,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            width: rect.width,
            height: rect.height,
          })
        } : undefined}
        className={[
          'flex items-start gap-2.5 rounded-xl px-3 py-2 group select-none',
          'transition-opacity duration-150',
          isDragSource ? 'opacity-30 pointer-events-none' : '',
          canDrag && !dragging ? 'cursor-grab' : '',
        ].join(' ')}
        style={resolveCardStyle(todo, sectionId)}
      >
        <button
          onClick={() => toggle(todo)}
          onPointerDown={e => e.stopPropagation()}
          className={`mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 border-white/50 flex items-center justify-center transition
            ${todo.completed ? 'bg-white/60' : 'hover:bg-white/20'}`}
        >
          {todo.completed && <span className="text-rose-500 text-xs font-bold">✓</span>}
        </button>
        <div className="flex-1 min-w-0">
          {editingTodo === todo.id ? (
            <input
              autoFocus
              className="w-full bg-white/20 rounded px-1.5 py-0.5 text-sm outline-none"
              value={editingTodoTitle}
              onChange={e => setEditingTodoTitle(e.target.value)}
              onBlur={() => updateTodoTitle(todo.id, editingTodoTitle)}
              onKeyDown={e => {
                if (e.key === 'Enter') updateTodoTitle(todo.id, editingTodoTitle)
                if (e.key === 'Escape') setEditingTodo(null)
              }}
            />
          ) : (
            <p
              className={`text-sm leading-tight ${todo.completed ? 'line-through' : ''} cursor-text`}
              onDoubleClick={() => { setEditingTodo(todo.id); setEditingTodoTitle(todo.title) }}
            >
              {todo.title}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {view === 'priority' && todo.todo_sections.map(ts => {
              const sec = sections.find(s => s.id === ts.section_id)
              if (!sec) return null
              return (
                <span
                  key={ts.section_id}
                  className="text-xs px-1.5 py-0.5 rounded-full leading-none"
                  style={sec.color
                    ? { backgroundColor: toRgba(sec.color, 0.35), border: `1px solid ${toRgba(sec.color, 0.6)}` }
                    : { backgroundColor: 'rgba(255,255,255,0.2)' }
                  }
                >
                  {sec.name}
                </span>
              )
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
          <button
            onClick={(e) => openEdit(e, todo)}
            onPointerDown={e => e.stopPropagation()}
            className="text-white/50 hover:text-white/90 text-sm leading-none transition px-0.5"
            title="Edit task"
          >
            ···
          </button>
          <button
            onClick={() => remove(todo.id)}
            onPointerDown={e => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs transition"
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  // Renders items for a group, injecting a gap spacer at the hover position
  const renderGroup = (items: TodoRow[], sectionId: string | null, groupKey: string | null) => {
    const active = dragging?.groupKey === groupKey
    const over = active ? dragging!.overIndex : -1
    const src = active ? dragging!.sourceIndex : -1
    // Don't show gap when item would stay in the same spot
    const gapAt = active && over !== src && over !== src + 1 ? over : -1

    const nodes: React.ReactNode[] = []
    for (let i = 0; i <= items.length; i++) {
      if (gapAt === i) {
        nodes.push(
          <div
            key="__gap__"
            className="rounded-xl transition-all duration-200 ease-out"
            style={{ height: dragging!.height }}
          />
        )
      }
      if (i < items.length) {
        nodes.push(renderItem(items[i], sectionId, groupKey, i, items))
      }
    }
    return nodes
  }

  const renderSectionsView = (): React.ReactNode[] => {
    const sd = sectionDrag
    const sOver = sd?.overIndex ?? -1
    const sSrc = sd?.sourceIndex ?? -1
    const sGapAt = sd && sOver !== sSrc && sOver !== sSrc + 1 ? sOver : -1

    const nodes: React.ReactNode[] = []

    for (let i = 0; i <= sections.length; i++) {
      if (sGapAt === i) {
        nodes.push(
          <div key="__sec-gap__" className="rounded-xl transition-all duration-200 ease-out" style={{ height: sd!.height }} />
        )
      }
      if (i < sections.length) {
        const sec = sections[i]
        const items = getSectionTodos(sec.id)
        const isCollapsed = collapsed[sec.id]
        const isFaded = sd?.sectionId === sec.id
        nodes.push(
          <div
            key={sec.id}
            data-section-index={String(i)}
            className={`transition-opacity duration-150 ${isFaded ? 'opacity-30 pointer-events-none' : ''}`}
          >
            <div
              className="flex items-center gap-2 mb-1.5 group/sec select-none cursor-grab"
              onPointerDown={(e) => {
                if (e.button !== 0 || editingSection === sec.id) return
                e.preventDefault()
                const wrapper = e.currentTarget.closest('[data-section-index]') as HTMLElement
                const rect = (wrapper ?? e.currentTarget).getBoundingClientRect()
                setSectionDrag({
                  sectionId: sec.id,
                  sectionName: sec.name,
                  sectionColor: sec.color ?? null,
                  sourceIndex: i,
                  overIndex: i,
                  capturedSections: sections,
                  x: e.clientX,
                  y: e.clientY,
                  offsetX: e.clientX - rect.left,
                  offsetY: e.clientY - rect.top,
                  width: rect.width,
                  height: rect.height,
                })
              }}
            >
              <button
                onClick={() => setCollapsed(p => ({ ...p, [sec.id]: !p[sec.id] }))}
                onPointerDown={e => e.stopPropagation()}
                className="text-xs opacity-50 hover:opacity-100 w-3 text-left leading-none"
              >
                {isCollapsed ? '▶' : '▼'}
              </button>
              <label
                className="relative w-3 h-3 rounded-full flex-shrink-0 cursor-pointer"
                style={{ backgroundColor: sec.color ?? '#9ca3af' }}
                title="Change colour"
                onPointerDown={e => e.stopPropagation()}
              >
                <input
                  type="color"
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  value={sec.color ?? '#9ca3af'}
                  onChange={e => updateSectionColor(sec.id, e.target.value)}
                />
              </label>
              {editingSection === sec.id ? (
                <input
                  autoFocus
                  className="flex-1 bg-white/20 rounded px-2 py-0.5 text-sm font-semibold outline-none"
                  value={editingSectionName}
                  onChange={e => setEditingSectionName(e.target.value)}
                  onBlur={() => renameSection(sec.id)}
                  onPointerDown={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') renameSection(sec.id)
                    if (e.key === 'Escape') setEditingSection(null)
                  }}
                />
              ) : (
                <span
                  className="text-sm font-semibold hover:opacity-80 transition"
                  onDoubleClick={() => { setEditingSection(sec.id); setEditingSectionName(sec.name) }}
                >
                  {sec.name}
                </span>
              )}
              <span className="text-xs opacity-40">{items.length}</span>
              <button
                onClick={() => deleteSection(sec.id)}
                onPointerDown={e => e.stopPropagation()}
                className="ml-auto opacity-0 group-hover/sec:opacity-40 hover:!opacity-100 text-sm transition"
              >
                ×
              </button>
            </div>
            {!isCollapsed && (
              <div
                className="flex flex-col gap-1.5 rounded-xl p-2 min-h-[2.5rem]"
                style={sec.color ? {
                  backgroundColor: toRgba(sec.color, 0.08),
                  border: `1px solid ${toRgba(sec.color, 0.25)}`,
                } : {
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {items.length === 0 && !dragging
                  ? <p className="text-xs opacity-40 px-1">No tasks</p>
                  : renderGroup(items, sec.id, sec.id)}
              </div>
            )}
          </div>
        )
      }
    }

    // No Section group
    const noSectionItems = getSectionTodos(null)
    if (noSectionItems.length > 0) {
      nodes.push(
        <div key="__no-section__">
          <div className="flex items-center gap-2 mb-1.5">
            <button
              onClick={() => setCollapsed(p => ({ ...p, __none__: !p.__none__ }))}
              className="text-xs opacity-40 hover:opacity-80 w-3 text-left leading-none"
            >
              {collapsed.__none__ ? '▶' : '▼'}
            </button>
            <span className="text-xs font-semibold uppercase tracking-wider opacity-40">No Section</span>
            <span className="text-xs opacity-30">{noSectionItems.length}</span>
          </div>
          {!collapsed.__none__ && (
            <div className="flex flex-col gap-1.5">
              {renderGroup(noSectionItems, null, null)}
            </div>
          )}
        </div>
      )
    }

    // Add section button
    nodes.push(
      <div key="__add-section__" className="pt-1">
        {addingSection ? (
          <div className="flex items-center gap-2">
            <label
              className="relative w-6 h-6 rounded-full flex-shrink-0 cursor-pointer"
              style={{ backgroundColor: newSectionColor }}
              title="Pick colour"
            >
              <input
                type="color"
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                value={newSectionColor}
                onChange={e => setNewSectionColor(e.target.value)}
              />
            </label>
            <input
              autoFocus
              className="flex-1 bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
              placeholder="Section name — press Enter to save"
              value={newSectionName}
              onChange={e => setNewSectionName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addSection()
                if (e.key === 'Escape') { setAddingSection(false); setNewSectionName('') }
              }}
            />
          </div>
        ) : (
          <button
            onClick={() => setAddingSection(true)}
            className="text-xs opacity-50 hover:opacity-100 transition"
          >
            + Add section
          </button>
        )}
      </div>
    )

    return nodes
  }

  const visibleTodos = showCompleted ? todos : todos.filter(t => !t.completed)
  const draggingTodo = dragging ? todos.find(t => t.id === dragging.todoId) ?? null : null

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3 h-full bg-rose-500 text-white">

      {/* Floating section header during section drag */}
      {sectionDrag && (
        <div
          data-drag-float="true"
          className="fixed z-50 pointer-events-none rounded-xl px-3 py-2 flex items-center gap-2 shadow-2xl ring-1 ring-white/20 select-none"
          style={{
            left: sectionDrag.x - sectionDrag.offsetX,
            top: sectionDrag.y - sectionDrag.offsetY,
            width: sectionDrag.width,
            backgroundColor: sectionDrag.sectionColor ? toRgba(sectionDrag.sectionColor, 0.4) : 'rgba(255,255,255,0.15)',
            border: sectionDrag.sectionColor ? `1px solid ${toRgba(sectionDrag.sectionColor, 0.6)}` : '1px solid rgba(255,255,255,0.2)',
          }}
        >
          {sectionDrag.sectionColor && (
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: sectionDrag.sectionColor }} />
          )}
          <span className="text-sm font-semibold truncate">{sectionDrag.sectionName}</span>
        </div>
      )}

      {/* Edit popover */}
      {editingCard && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setEditingCard(null)} />
          <div
            className="fixed z-50 w-56 rounded-2xl p-3 flex flex-col gap-2.5 shadow-2xl"
            style={{
              right: window.innerWidth - editingCard.anchorRight,
              top: editingCard.anchorBottom + 6,
              backgroundColor: '#9f1239',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            {/* Title */}
            <input
              autoFocus
              className="w-full bg-white/15 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/40 outline-none"
              placeholder="Task title"
              value={editingCard.title}
              onChange={e => setEditingCard(p => p ? { ...p, title: e.target.value } : p)}
              onKeyDown={e => e.key === 'Enter' && saveEdit()}
            />

            {/* Priority */}
            <div className="flex gap-1">
              {(['high', 'medium', 'low'] as Priority[]).map(p => (
                <button
                  key={p}
                  onClick={() => setEditingCard(prev => prev ? { ...prev, priority: p } : prev)}
                  className={`flex-1 text-xs py-1 rounded-lg capitalize transition font-medium
                    ${editingCard.priority === p ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20'}`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Due date */}
            <input
              type="date"
              className="w-full bg-white/15 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
              value={editingCard.dueDate}
              onChange={e => setEditingCard(p => p ? { ...p, dueDate: e.target.value } : p)}
            />

            {/* Sections */}
            {sections.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {sections.map(s => {
                  const active = editingCard.sectionIds.includes(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => setEditingCard(prev => {
                        if (!prev) return prev
                        const ids = active
                          ? prev.sectionIds.filter(id => id !== s.id)
                          : [...prev.sectionIds, s.id]
                        return { ...prev, sectionIds: ids }
                      })}
                      className="text-xs px-2 py-0.5 rounded-full transition border"
                      style={active && s.color
                        ? { backgroundColor: toRgba(s.color, 0.4), borderColor: toRgba(s.color, 0.7), fontWeight: 600 }
                        : active
                          ? { backgroundColor: 'rgba(255,255,255,0.25)', borderColor: 'rgba(255,255,255,0.4)', fontWeight: 600 }
                          : { borderColor: 'rgba(255,255,255,0.2)' }}
                    >
                      {s.name}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Save */}
            <button
              onClick={saveEdit}
              className="w-full bg-white text-rose-700 font-semibold text-sm py-1.5 rounded-lg hover:bg-white/90 transition"
            >
              Save
            </button>
          </div>
        </>
      )}

      {/* Floating card that follows the cursor */}
      {dragging && draggingTodo && (
        <div
          data-drag-float="true"
          className="fixed z-50 pointer-events-none rounded-xl px-3 py-2 flex items-start gap-2.5 shadow-2xl ring-1 ring-white/20"
          style={{
            left: dragging.x - dragging.offsetX,
            top: dragging.y - dragging.offsetY,
            width: dragging.width,
            ...resolveCardStyle(draggingTodo, view === 'sections' ? dragging.groupKey : null),
          }}
        >
          <div className="mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 border-white/50" />
          <p className="flex-1 text-sm leading-tight truncate min-w-0">{draggingTodo.title}</p>
          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${PRIORITY_COLORS[draggingTodo.priority]}`} />
        </div>
      )}

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
                  style={s.color && newTodo.sectionIds.includes(s.id) ? { backgroundColor: s.color, color: 'white', borderColor: s.color } : {}}
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
        <div className="overflow-y-auto flex-1 pr-0.5 flex flex-col gap-4">

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
                    <div
                      className="flex flex-col gap-1.5 rounded-xl p-2 min-h-[2.5rem]"
                      style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      {renderGroup(group, null, p)}
                    </div>
                  </div>
                )
              })
          )}

          {/* ── Sections view ── */}
          {view === 'sections' && renderSectionsView()}

        </div>
      )}
    </div>
  )
}
