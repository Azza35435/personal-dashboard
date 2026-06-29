'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Section, Todo, Priority, Curricular, CurricularMetric, CurricularLink, CurricularDeadline } from '@/lib/types'
import DeadlinesCalendar from './DeadlinesCalendar'

interface TodoRow extends Todo {
  todo_sections: { section_id: string; position: number }[]
}

const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-red-400',
  medium: 'bg-yellow-400',
  low: 'bg-green-400',
}

const PRIORITY_DOT: Record<Priority, string> = {
  high: 'bg-red-400',
  medium: 'bg-amber-400',
  low: 'bg-green-400',
}

const DEADLINES_TAB = '__deadlines__'

export default function CurricularsWidget() {
  const [curriculars, setCurriculars] = useState<Curricular[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [todos, setTodos] = useState<TodoRow[]>([])
  const [metrics, setMetrics] = useState<CurricularMetric[]>([])
  const [noteContent, setNoteContent] = useState('')
  const [links, setLinks] = useState<CurricularLink[]>([])
  const [deadlines, setDeadlines] = useState<CurricularDeadline[]>([])
  const [loading, setLoading] = useState(true)

  // Add curricular form
  const [addingCurricular, setAddingCurricular] = useState(false)
  const [newCurName, setNewCurName] = useState('')
  const [newCurColor, setNewCurColor] = useState('#7c3aed')
  const [linkMode, setLinkMode] = useState<'new' | 'existing'>('new')
  const [linkSectionId, setLinkSectionId] = useState('')

  // Edit curricular
  const [editingCurricular, setEditingCurricular] = useState(false)
  const [editCurName, setEditCurName] = useState('')
  const [editCurColor, setEditCurColor] = useState('')

  // Add todo form
  const [addingTodo, setAddingTodo] = useState(false)
  const [newTodoTitle, setNewTodoTitle] = useState('')
  const [newTodoPriority, setNewTodoPriority] = useState<Priority>('medium')

  // Add deadline form
  const [addingDeadline, setAddingDeadline] = useState(false)
  const [newDlTitle, setNewDlTitle] = useState('')
  const [newDlModule, setNewDlModule] = useState('')
  const [newDlDate, setNewDlDate] = useState('')
  const [newDlPriority, setNewDlPriority] = useState<Priority>('medium')

  // Add metric form
  const [addingMetric, setAddingMetric] = useState(false)
  const [newMetricLabel, setNewMetricLabel] = useState('')
  const [newMetricValue, setNewMetricValue] = useState('')
  const [newMetricUnit, setNewMetricUnit] = useState('$')

  // Add link form
  const [addingLink, setAddingLink] = useState(false)
  const [newLinkTitle, setNewLinkTitle] = useState('')
  const [newLinkUrl, setNewLinkUrl] = useState('')

  // Inline metric edit
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null)
  const [editingMetricValue, setEditingMetricValue] = useState('')

  // Show completed todos toggle
  const [showCompleted, setShowCompleted] = useState(false)

  const load = useCallback(async () => {
    const [{ data: curs }, { data: secs }] = await Promise.all([
      supabase.from('curriculars').select('*').order('position'),
      supabase.from('sections').select('*').order('position'),
    ])
    const c = (curs ?? []) as Curricular[]
    const s = (secs ?? []) as Section[]
    setCurriculars(c)
    setSections(s)

    if (!selectedId || selectedId === DEADLINES_TAB) {
      if (!selectedId && c.length > 0) setSelectedId(c[0].id)
      else setLoading(false)
      return
    }

    const linked = s.find(sec => sec.curricular_id === selectedId) ?? null
    const [{ data: met }, { data: note }, { data: lnk }, { data: tds }, { data: dls }] = await Promise.all([
      supabase.from('curricular_metrics').select('*').eq('curricular_id', selectedId).order('position'),
      supabase.from('curricular_notes').select('content').eq('curricular_id', selectedId).maybeSingle(),
      supabase.from('curricular_links').select('*').eq('curricular_id', selectedId).order('position'),
      linked
        ? supabase.from('todos').select('*, todo_sections(section_id, position)').order('position')
        : Promise.resolve({ data: [] }),
      supabase.from('curricular_deadlines').select('*').eq('curricular_id', selectedId).order('due_date').order('created_at'),
    ])

    setMetrics((met ?? []) as CurricularMetric[])
    setNoteContent((note as { content?: string | null } | null)?.content ?? '')
    setLinks((lnk ?? []) as CurricularLink[])
    setDeadlines((dls ?? []) as CurricularDeadline[])
    if (linked) {
      const all = (tds ?? []) as TodoRow[]
      setTodos(all.filter(t => t.todo_sections.some(ts => ts.section_id === linked.id)))
    } else {
      setTodos([])
    }
    setLoading(false)
  }, [selectedId])

  useEffect(() => { load() }, [load])

  const selected = curriculars.find(c => c.id === selectedId) ?? null
  const linkedSection = selected ? sections.find(s => s.curricular_id === selected.id) ?? null : null
  const unlinkedSections = sections.filter(s => !s.curricular_id)

  const saveNote = async (id?: string) => {
    const target = id ?? selectedId
    if (!target || target === DEADLINES_TAB) return
    await supabase.from('curricular_notes').upsert({
      curricular_id: target,
      content: noteContent,
      updated_at: new Date().toISOString(),
    })
  }

  const handleTabChange = async (id: string) => {
    if (selectedId && selectedId !== DEADLINES_TAB) await saveNote(selectedId)
    setEditingCurricular(false)
    setSelectedId(id)
  }

  const addCurricular = async () => {
    const name = newCurName.trim()
    if (!name) return
    const { data: cur } = await supabase
      .from('curriculars')
      .insert({ name, color: newCurColor, position: curriculars.length })
      .select()
      .single()
    if (!cur) return
    if (linkMode === 'new') {
      await supabase.from('sections').insert({
        name,
        color: newCurColor,
        position: sections.length,
        curricular_id: cur.id,
      })
    } else if (linkSectionId) {
      await supabase.from('sections').update({ curricular_id: cur.id }).eq('id', linkSectionId)
    }
    setAddingCurricular(false)
    setNewCurName('')
    setNewCurColor('#7c3aed')
    setLinkMode('new')
    setLinkSectionId('')
    setSelectedId(cur.id)
  }

  const saveCurricular = async () => {
    if (!selectedId || !editCurName.trim()) return
    await supabase.from('curriculars').update({
      name: editCurName.trim(),
      color: editCurColor,
    }).eq('id', selectedId)
    // Update linked section colour too
    if (linkedSection) {
      await supabase.from('sections').update({ color: editCurColor }).eq('id', linkedSection.id)
    }
    setEditingCurricular(false)
    load()
  }

  const deleteCurricular = async (id: string) => {
    const linked = sections.find(s => s.curricular_id === id)
    if (linked) {
      await supabase.from('sections').update({ curricular_id: null }).eq('id', linked.id)
    }
    await supabase.from('curriculars').delete().eq('id', id)
    const idx = curriculars.findIndex(c => c.id === id)
    const next = curriculars[idx - 1] ?? curriculars[idx + 1] ?? null
    setSelectedId(next?.id ?? null)
  }

  const addTodo = async () => {
    if (!newTodoTitle.trim() || !linkedSection) return
    const { data: row } = await supabase
      .from('todos')
      .insert({ title: newTodoTitle.trim(), priority: newTodoPriority })
      .select()
      .single()
    if (row) {
      await supabase.from('todo_sections').insert({
        todo_id: row.id,
        section_id: linkedSection.id,
        position: todos.length,
      })
    }
    setNewTodoTitle('')
    setAddingTodo(false)
    load()
  }

  const toggleTodo = async (t: TodoRow) => {
    await supabase.from('todos').update({ completed: !t.completed }).eq('id', t.id)
    load()
  }

  const deleteTodo = async (id: string) => {
    await supabase.from('todos').delete().eq('id', id)
    load()
  }

  const addDeadline = async () => {
    if (!newDlTitle.trim() || !newDlDate || !selectedId) return
    const { data: dl } = await supabase
      .from('curricular_deadlines')
      .insert({
        curricular_id: selectedId,
        title: newDlTitle.trim(),
        module: newDlModule.trim() || null,
        due_date: newDlDate,
        priority: newDlPriority,
        position: deadlines.length,
      })
      .select()
      .single()

    // Auto-create a todo in the linked section
    if (dl && linkedSection) {
      const { data: todo } = await supabase
        .from('todos')
        .insert({
          title: newDlTitle.trim(),
          priority: newDlPriority,
          due_date: newDlDate,
        })
        .select()
        .single()
      if (todo) {
        await supabase.from('todo_sections').insert({
          todo_id: todo.id,
          section_id: linkedSection.id,
          position: todos.length,
        })
        await supabase.from('curricular_deadlines').update({ todo_id: todo.id }).eq('id', dl.id)
      }
    }

    setNewDlTitle('')
    setNewDlModule('')
    setNewDlDate('')
    setNewDlPriority('medium')
    setAddingDeadline(false)
    load()
  }

  const toggleDeadline = async (d: CurricularDeadline) => {
    const next = !d.completed
    await supabase.from('curricular_deadlines').update({ completed: next }).eq('id', d.id)
    if (d.todo_id) {
      await supabase.from('todos').update({ completed: next }).eq('id', d.todo_id)
    }
    load()
  }

  const deleteDeadline = async (d: CurricularDeadline) => {
    if (d.todo_id) await supabase.from('todos').delete().eq('id', d.todo_id)
    await supabase.from('curricular_deadlines').delete().eq('id', d.id)
    load()
  }

  const addMetric = async () => {
    if (!newMetricLabel.trim() || !selectedId) return
    await supabase.from('curricular_metrics').insert({
      curricular_id: selectedId,
      label: newMetricLabel.trim(),
      value: newMetricValue,
      unit: newMetricUnit || null,
      position: metrics.length,
    })
    setNewMetricLabel('')
    setNewMetricValue('')
    setNewMetricUnit('$')
    setAddingMetric(false)
    load()
  }

  const saveMetricValue = async (id: string, value: string) => {
    setEditingMetricId(null)
    await supabase.from('curricular_metrics').update({ value }).eq('id', id)
    load()
  }

  const deleteMetric = async (id: string) => {
    await supabase.from('curricular_metrics').delete().eq('id', id)
    load()
  }

  const addLink = async () => {
    if (!newLinkTitle.trim() || !newLinkUrl.trim() || !selectedId) return
    const url = /^https?:\/\//.test(newLinkUrl) ? newLinkUrl : `https://${newLinkUrl}`
    await supabase.from('curricular_links').insert({
      curricular_id: selectedId,
      title: newLinkTitle.trim(),
      url,
      position: links.length,
    })
    setNewLinkTitle('')
    setNewLinkUrl('')
    setAddingLink(false)
    load()
  }

  const deleteLink = async (id: string) => {
    await supabase.from('curricular_links').delete().eq('id', id)
    load()
  }

  if (loading) {
    return (
      <div className="rounded p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 shadow-sm h-full flex items-center justify-center">
        <div className="space-y-2 w-full max-w-sm">
          {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-8 bg-gray-200 dark:bg-gray-700 rounded" />)}
        </div>
      </div>
    )
  }

  const activeTodos = todos.filter(t => !t.completed)
  const completedTodos = todos.filter(t => t.completed)
  const today = new Date().toISOString().split('T')[0]
  const activeDeadlines = deadlines.filter(d => !d.completed)
  const completedDeadlines = deadlines.filter(d => d.completed)

  return (
    <div className="rounded p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 shadow-sm text-gray-900 dark:text-gray-100 h-full flex flex-col gap-4 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Curriculars</p>
          {linkedSection && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {activeTodos.length} task{activeTodos.length !== 1 ? 's' : ''} · {activeDeadlines.length} deadline{activeDeadlines.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => setAddingCurricular(p => !p)}
          className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-3 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 transition"
        >
          {addingCurricular ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {/* Add curricular form */}
      {addingCurricular && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-2.5 flex-shrink-0 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <label
              className="relative w-8 h-8 rounded-full flex-shrink-0 cursor-pointer border-2 border-gray-300 dark:border-gray-600"
              style={{ backgroundColor: newCurColor }}
            >
              <input
                type="color"
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                value={newCurColor}
                onChange={e => setNewCurColor(e.target.value)}
              />
            </label>
            <input
              autoFocus
              className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
              placeholder="Name (e.g. New Property Group)"
              value={newCurName}
              onChange={e => setNewCurName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCurricular()}
            />
          </div>
          <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-700 rounded p-0.5 border border-gray-200 dark:border-gray-600">
            <button
              onClick={() => setLinkMode('new')}
              className={`flex-1 text-xs py-1.5 rounded transition ${linkMode === 'new' ? 'bg-white dark:bg-gray-900 font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              Create new section
            </button>
            <button
              onClick={() => setLinkMode('existing')}
              className={`flex-1 text-xs py-1.5 rounded transition ${linkMode === 'existing' ? 'bg-white dark:bg-gray-900 font-medium shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              Link existing section
            </button>
          </div>
          {linkMode === 'existing' && (
            <select
              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none"
              value={linkSectionId}
              onChange={e => setLinkSectionId(e.target.value)}
            >
              <option value="">— pick a section —</option>
              {unlinkedSections.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={addCurricular}
            className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm py-1.5 rounded hover:opacity-90 transition"
          >
            Create
          </button>
        </div>
      )}

      {/* Tabs */}
      {curriculars.length === 0 ? (
        <p className="text-sm text-gray-400">No curriculars yet. Add one to get started.</p>
      ) : (
        <>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded p-1 flex-shrink-0 overflow-x-auto border border-gray-200 dark:border-gray-700">
            {/* Deadlines tab */}
            <button
              onClick={() => handleTabChange(DEADLINES_TAB)}
              className={`text-xs px-3 py-1.5 rounded whitespace-nowrap transition font-medium flex-shrink-0 ${
                selectedId === DEADLINES_TAB
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              📅 Deadlines
            </button>
            {/* Separator */}
            <div className="w-px bg-gray-200 dark:bg-gray-700 my-1 flex-shrink-0" />
            {/* Curricular tabs */}
            {curriculars.map(c => (
              <button
                key={c.id}
                onClick={() => handleTabChange(c.id)}
                className={`text-xs px-3 py-1.5 rounded whitespace-nowrap transition font-medium flex-shrink-0 flex items-center gap-1.5 ${
                  selectedId === c.id
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.color ?? '#7c3aed' }}
                />
                {c.name}
              </button>
            ))}
          </div>

          {/* Deadlines tab content */}
          {selectedId === DEADLINES_TAB && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <DeadlinesCalendar curriculars={curriculars} />
            </div>
          )}

          {/* Curricular content */}
          {selected && selectedId !== DEADLINES_TAB && (
            <div className="flex gap-5 flex-1 min-h-0 overflow-hidden">

              {/* Left: Tasks + Deadlines */}
              <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-hidden">

                {/* Edit curricular form */}
                {editingCurricular && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-2 flex-shrink-0 border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <label
                        className="relative w-8 h-8 rounded-full flex-shrink-0 cursor-pointer border-2 border-gray-300 dark:border-gray-600"
                        style={{ backgroundColor: editCurColor }}
                      >
                        <input
                          type="color"
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          value={editCurColor}
                          onChange={e => setEditCurColor(e.target.value)}
                        />
                      </label>
                      <input
                        autoFocus
                        className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                        value={editCurName}
                        onChange={e => setEditCurName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveCurricular()}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveCurricular}
                        className="flex-1 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm py-1.5 rounded hover:opacity-90 transition"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingCurricular(false)}
                        className="px-3 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Tasks section */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Tasks</p>
                    <div className="flex items-center gap-2">
                      {!editingCurricular && (
                        <button
                          onClick={() => {
                            setEditCurName(selected.name)
                            setEditCurColor(selected.color ?? '#7c3aed')
                            setEditingCurricular(true)
                          }}
                          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                          title="Edit name & colour"
                        >
                          ✎ Edit
                        </button>
                      )}
                      {completedTodos.length > 0 && (
                        <button
                          onClick={() => setShowCompleted(p => !p)}
                          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                        >
                          {showCompleted ? 'Hide done' : `${completedTodos.length} done`}
                        </button>
                      )}
                      <button
                        onClick={() => setAddingTodo(p => !p)}
                        disabled={!linkedSection}
                        className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 transition"
                        title={linkedSection ? undefined : 'No todo section linked'}
                      >
                        + Add task
                      </button>
                    </div>
                  </div>

                  {!linkedSection && (
                    <p className="text-xs text-gray-400 italic">
                      No todo section linked. Delete and re-add this curricular to link one.
                    </p>
                  )}

                  {addingTodo && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-2 border border-gray-200 dark:border-gray-700">
                      <input
                        autoFocus
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                        placeholder="Task title"
                        value={newTodoTitle}
                        onChange={e => setNewTodoTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addTodo()}
                      />
                      <div className="flex gap-1">
                        {(['high', 'medium', 'low'] as Priority[]).map(p => (
                          <button
                            key={p}
                            onClick={() => setNewTodoPriority(p)}
                            className={`flex-1 text-xs py-1 rounded capitalize transition border ${
                              newTodoPriority === p
                                ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 font-semibold'
                                : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={addTodo}
                        className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm py-1.5 rounded hover:opacity-90 transition"
                      >
                        Save
                      </button>
                    </div>
                  )}
                </div>

                {/* Task list */}
                <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 pr-0.5 min-h-0">
                  {activeTodos.length === 0 && !addingTodo && (
                    <p className="text-sm text-gray-400">No tasks.</p>
                  )}
                  {activeTodos.map(t => (
                    <div
                      key={t.id}
                      className="flex items-start gap-2.5 rounded px-3 py-2 group bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 select-none"
                    >
                      <button
                        onClick={() => toggleTodo(t)}
                        className="mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center hover:border-gray-400 transition"
                      />
                      <p className="flex-1 text-sm leading-tight">{t.title}</p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[t.priority]}`} />
                        <button
                          onClick={() => deleteTodo(t.id)}
                          className="opacity-0 group-hover:opacity-40 hover:!opacity-80 text-gray-500 text-xs transition"
                        >×</button>
                      </div>
                    </div>
                  ))}
                  {showCompleted && completedTodos.map(t => (
                    <div
                      key={t.id}
                      className="flex items-start gap-2.5 rounded px-3 py-2 group bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 select-none"
                    >
                      <button
                        onClick={() => toggleTodo(t)}
                        className="mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 border-gray-400 bg-gray-200 dark:bg-gray-600 dark:border-gray-500 flex items-center justify-center transition"
                      >
                        <span className="text-gray-500 dark:text-gray-400 text-xs font-bold leading-none">✓</span>
                      </button>
                      <p className="flex-1 text-sm leading-tight text-gray-400 dark:text-gray-500 line-through">{t.title}</p>
                      <button
                        onClick={() => deleteTodo(t.id)}
                        className="opacity-0 group-hover:opacity-40 hover:!opacity-80 text-gray-500 text-xs flex-shrink-0 transition"
                      >×</button>
                    </div>
                  ))}

                  {/* Deadlines section */}
                  <div className="mt-3 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Deadlines</p>
                      <button
                        onClick={() => setAddingDeadline(p => !p)}
                        className="text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 transition"
                      >
                        {addingDeadline ? 'Cancel' : '+ Add deadline'}
                      </button>
                    </div>

                    {addingDeadline && (
                      <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-2 mb-2 border border-gray-200 dark:border-gray-700">
                        <input
                          autoFocus
                          className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                          placeholder="Title (e.g. Essay submission)"
                          value={newDlTitle}
                          onChange={e => setNewDlTitle(e.target.value)}
                        />
                        <input
                          className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                          placeholder="Module / topic (optional)"
                          value={newDlModule}
                          onChange={e => setNewDlModule(e.target.value)}
                        />
                        <input
                          type="date"
                          className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                          value={newDlDate}
                          onChange={e => setNewDlDate(e.target.value)}
                        />
                        <div className="flex gap-1">
                          {(['high', 'medium', 'low'] as Priority[]).map(p => (
                            <button
                              key={p}
                              onClick={() => setNewDlPriority(p)}
                              className={`flex-1 text-xs py-1 rounded capitalize transition border ${
                                newDlPriority === p
                                  ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 font-semibold'
                                  : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={addDeadline}
                          className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm py-1.5 rounded hover:opacity-90 transition"
                        >
                          Save deadline
                        </button>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {activeDeadlines.length === 0 && !addingDeadline && (
                        <p className="text-sm text-gray-400">No deadlines.</p>
                      )}
                      {activeDeadlines.map(d => {
                        const isPast = d.due_date < today
                        return (
                          <div
                            key={d.id}
                            className={`flex items-start gap-2.5 rounded px-3 py-2 group border select-none ${
                              isPast
                                ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                                : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700'
                            }`}
                          >
                            <button
                              onClick={() => toggleDeadline(d)}
                              className="mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 border-gray-300 dark:border-gray-600 flex items-center justify-center hover:border-gray-400 transition"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm leading-tight">{d.title}</p>
                              {d.module && <p className="text-xs text-gray-400 truncate">{d.module}</p>}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[d.priority]}`} />
                              <span className={`text-xs ${isPast ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                                {new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                              </span>
                              <button
                                onClick={() => deleteDeadline(d)}
                                className="opacity-0 group-hover:opacity-40 hover:!opacity-80 text-gray-500 text-xs transition"
                              >×</button>
                            </div>
                          </div>
                        )
                      })}
                      {completedDeadlines.length > 0 && (
                        <div className="space-y-1.5 opacity-40">
                          {completedDeadlines.map(d => (
                            <div
                              key={d.id}
                              className="flex items-start gap-2.5 rounded px-3 py-2 group bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 select-none"
                            >
                              <button
                                onClick={() => toggleDeadline(d)}
                                className="mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 border-gray-400 bg-gray-200 dark:bg-gray-600 dark:border-gray-500 flex items-center justify-center transition"
                              >
                                <span className="text-gray-500 dark:text-gray-400 text-xs font-bold leading-none">✓</span>
                              </button>
                              <p className="flex-1 text-sm leading-tight line-through text-gray-400">{d.title}</p>
                              <button
                                onClick={() => deleteDeadline(d)}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 text-xs transition"
                              >×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 pt-3 border-t border-gray-200 dark:border-gray-700 mt-2">
                    <button
                      onClick={() => deleteCurricular(selected.id)}
                      className="text-xs text-gray-400 hover:text-red-500 transition"
                    >
                      Delete curricular
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Metrics, Notes, Links */}
              <div className="w-60 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">

                {/* Metrics */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Metrics</p>
                    <button
                      onClick={() => setAddingMetric(p => !p)}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                    >
                      {addingMetric ? 'Cancel' : '+ Add'}
                    </button>
                  </div>
                  {addingMetric && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-2 mb-2 border border-gray-200 dark:border-gray-700">
                      <input
                        autoFocus
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                        placeholder="Label (e.g. Revenue)"
                        value={newMetricLabel}
                        onChange={e => setNewMetricLabel(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <select
                          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100 outline-none w-16 flex-shrink-0"
                          value={newMetricUnit}
                          onChange={e => setNewMetricUnit(e.target.value)}
                        >
                          <option value="$">$</option>
                          <option value="hrs">hrs</option>
                          <option value="">none</option>
                        </select>
                        <input
                          className="flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                          placeholder="Value"
                          value={newMetricValue}
                          onChange={e => setNewMetricValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addMetric()}
                        />
                      </div>
                      <button
                        onClick={addMetric}
                        className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm py-1 rounded hover:opacity-90 transition"
                      >
                        Save
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {metrics.map(m => (
                      <div key={m.id} className="bg-gray-50 dark:bg-gray-800 rounded p-2.5 group relative border border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5 truncate">{m.label}</p>
                        {editingMetricId === m.id ? (
                          <input
                            autoFocus
                            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 text-sm font-semibold outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                            value={editingMetricValue}
                            onChange={e => setEditingMetricValue(e.target.value)}
                            onBlur={() => saveMetricValue(m.id, editingMetricValue)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveMetricValue(m.id, editingMetricValue)
                              if (e.key === 'Escape') setEditingMetricId(null)
                            }}
                          />
                        ) : (
                          <p
                            className="text-sm font-semibold cursor-text truncate"
                            onClick={() => { setEditingMetricId(m.id); setEditingMetricValue(m.value) }}
                          >
                            {m.unit === '$' ? `$${m.value}` : m.unit ? `${m.value} ${m.unit}` : m.value || '—'}
                          </p>
                        )}
                        <button
                          onClick={() => deleteMetric(m.id)}
                          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-40 hover:!opacity-80 text-gray-500 text-xs transition leading-none"
                        >×</button>
                      </div>
                    ))}
                    {metrics.length === 0 && !addingMetric && (
                      <p className="text-xs text-gray-400 col-span-2">No metrics yet</p>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Notes</p>
                  <textarea
                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded px-3 py-2.5 text-sm placeholder-gray-400 outline-none resize-none text-gray-800 dark:text-gray-200 focus:border-gray-400 transition"
                    style={{ minHeight: '7rem' }}
                    placeholder="Notes about this curricular..."
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    onBlur={() => saveNote()}
                  />
                </div>

                {/* Links */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Links</p>
                    <button
                      onClick={() => setAddingLink(p => !p)}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                    >
                      {addingLink ? 'Cancel' : '+ Add'}
                    </button>
                  </div>
                  {addingLink && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-2 mb-2 border border-gray-200 dark:border-gray-700">
                      <input
                        autoFocus
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                        placeholder="Title"
                        value={newLinkTitle}
                        onChange={e => setNewLinkTitle(e.target.value)}
                      />
                      <input
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-3 py-1.5 text-sm placeholder-gray-400 outline-none text-gray-900 dark:text-gray-100 focus:border-gray-400 transition"
                        placeholder="URL"
                        value={newLinkUrl}
                        onChange={e => setNewLinkUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addLink()}
                      />
                      <button
                        onClick={addLink}
                        className="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-sm py-1 rounded hover:opacity-90 transition"
                      >
                        Save
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {links.map(l => (
                      <div key={l.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded px-3 py-2 group border border-gray-100 dark:border-gray-700">
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-sm hover:underline truncate text-gray-900 dark:text-gray-100"
                        >
                          {l.title}
                        </a>
                        <button
                          onClick={() => deleteLink(l.id)}
                          className="opacity-0 group-hover:opacity-40 hover:!opacity-80 text-gray-500 text-xs flex-shrink-0 transition"
                        >×</button>
                      </div>
                    ))}
                    {links.length === 0 && !addingLink && (
                      <p className="text-xs text-gray-400">No links yet</p>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
