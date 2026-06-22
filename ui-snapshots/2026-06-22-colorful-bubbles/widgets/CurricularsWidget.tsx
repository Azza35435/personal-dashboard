'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Section, Todo, Priority, Curricular, CurricularMetric, CurricularLink } from '@/lib/types'

interface TodoRow extends Todo {
  todo_sections: { section_id: string; position: number }[]
}

const PRIORITY_COLORS: Record<Priority, string> = {
  high: 'bg-red-400',
  medium: 'bg-yellow-400',
  low: 'bg-green-400',
}

export default function CurricularsWidget() {
  const [curriculars, setCurriculars] = useState<Curricular[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [todos, setTodos] = useState<TodoRow[]>([])
  const [metrics, setMetrics] = useState<CurricularMetric[]>([])
  const [noteContent, setNoteContent] = useState('')
  const [links, setLinks] = useState<CurricularLink[]>([])
  const [loading, setLoading] = useState(true)

  // Add curricular form
  const [addingCurricular, setAddingCurricular] = useState(false)
  const [newCurName, setNewCurName] = useState('')
  const [newCurColor, setNewCurColor] = useState('#7c3aed')
  const [linkMode, setLinkMode] = useState<'new' | 'existing'>('new')
  const [linkSectionId, setLinkSectionId] = useState('')

  // Add todo form
  const [addingTodo, setAddingTodo] = useState(false)
  const [newTodoTitle, setNewTodoTitle] = useState('')
  const [newTodoPriority, setNewTodoPriority] = useState<Priority>('medium')

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

    if (!selectedId) {
      if (c.length > 0) setSelectedId(c[0].id)
      else setLoading(false)
      return
    }

    const linked = s.find(sec => sec.curricular_id === selectedId) ?? null
    const [{ data: met }, { data: note }, { data: lnk }, { data: tds }] = await Promise.all([
      supabase.from('curricular_metrics').select('*').eq('curricular_id', selectedId).order('position'),
      supabase.from('curricular_notes').select('content').eq('curricular_id', selectedId).maybeSingle(),
      supabase.from('curricular_links').select('*').eq('curricular_id', selectedId).order('position'),
      linked
        ? supabase.from('todos').select('*, todo_sections(section_id, position)').order('position')
        : Promise.resolve({ data: [] }),
    ])

    setMetrics((met ?? []) as CurricularMetric[])
    setNoteContent((note as { content?: string | null } | null)?.content ?? '')
    setLinks((lnk ?? []) as CurricularLink[])
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
    if (!target) return
    await supabase.from('curricular_notes').upsert({
      curricular_id: target,
      content: noteContent,
      updated_at: new Date().toISOString(),
    })
  }

  const handleTabChange = async (id: string) => {
    if (selectedId) await saveNote(selectedId)
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
      <div className="rounded-2xl p-5 bg-violet-600 text-white h-full flex items-center justify-center">
        <div className="space-y-2 w-full max-w-sm">
          {[1, 2, 3].map(i => <div key={i} className="animate-pulse h-8 bg-white/20 rounded-lg" />)}
        </div>
      </div>
    )
  }

  const activeTodos = todos.filter(t => !t.completed)
  const completedTodos = todos.filter(t => t.completed)

  return (
    <div className="rounded-2xl p-5 bg-violet-600 text-white h-full flex flex-col gap-4 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Curriculars</p>
          {linkedSection && (
            <p className="text-xs opacity-50">
              {activeTodos.length} task{activeTodos.length !== 1 ? 's' : ''} remaining
            </p>
          )}
        </div>
        <button
          onClick={() => setAddingCurricular(p => !p)}
          className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition"
        >
          {addingCurricular ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {/* Add curricular form */}
      {addingCurricular && (
        <div className="bg-white/10 rounded-xl p-3 space-y-2.5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <label
              className="relative w-8 h-8 rounded-full flex-shrink-0 cursor-pointer border-2 border-white/30"
              style={{ backgroundColor: newCurColor }}
              title="Pick colour"
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
              className="flex-1 bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
              placeholder="Name (e.g. New Property Group)"
              value={newCurName}
              onChange={e => setNewCurName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCurricular()}
            />
          </div>
          <div className="flex gap-0.5 bg-white/10 rounded-lg p-0.5">
            <button
              onClick={() => setLinkMode('new')}
              className={`flex-1 text-xs py-1.5 rounded-md transition ${linkMode === 'new' ? 'bg-white/25 font-medium' : 'hover:bg-white/10'}`}
            >
              Create new section
            </button>
            <button
              onClick={() => setLinkMode('existing')}
              className={`flex-1 text-xs py-1.5 rounded-md transition ${linkMode === 'existing' ? 'bg-white/25 font-medium' : 'hover:bg-white/10'}`}
            >
              Link existing section
            </button>
          </div>
          {linkMode === 'existing' && (
            <select
              className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm outline-none"
              value={linkSectionId}
              onChange={e => setLinkSectionId(e.target.value)}
            >
              <option value="" className="text-black">— pick a section —</option>
              {unlinkedSections.map(s => (
                <option key={s.id} value={s.id} className="text-black">{s.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={addCurricular}
            className="w-full bg-white text-violet-700 font-semibold text-sm py-1.5 rounded-lg hover:bg-white/90 transition"
          >
            Create
          </button>
        </div>
      )}

      {/* Tabs */}
      {curriculars.length === 0 ? (
        <p className="text-sm opacity-60">No curriculars yet. Add one to get started.</p>
      ) : (
        <>
          <div className="flex gap-1 bg-white/10 rounded-xl p-1 flex-shrink-0 overflow-x-auto">
            {curriculars.map(c => (
              <button
                key={c.id}
                onClick={() => handleTabChange(c.id)}
                className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition font-medium flex-shrink-0
                  ${selectedId === c.id ? 'bg-white text-violet-700' : 'hover:bg-white/20'}`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Content */}
          {selected && (
            <div className="flex gap-5 flex-1 min-h-0 overflow-hidden">

              {/* Left: Tasks */}
              <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-hidden">
                <div className="flex items-center justify-between flex-shrink-0">
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Tasks</p>
                  <div className="flex items-center gap-2">
                    {completedTodos.length > 0 && (
                      <button
                        onClick={() => setShowCompleted(p => !p)}
                        className="text-xs opacity-50 hover:opacity-100 transition"
                      >
                        {showCompleted ? 'Hide done' : `${completedTodos.length} done`}
                      </button>
                    )}
                    <button
                      onClick={() => setAddingTodo(p => !p)}
                      disabled={!linkedSection}
                      className="text-xs bg-white/20 hover:bg-white/30 disabled:opacity-30 px-2.5 py-1 rounded-full transition"
                      title={linkedSection ? undefined : 'No todo section linked to this curricular'}
                    >
                      + Add task
                    </button>
                  </div>
                </div>

                {!linkedSection && (
                  <p className="text-xs opacity-50 italic">
                    No todo section linked. Delete and re-add this curricular to link one.
                  </p>
                )}

                {addingTodo && (
                  <div className="bg-white/10 rounded-xl p-3 space-y-2 flex-shrink-0">
                    <input
                      autoFocus
                      className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
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
                          className={`flex-1 text-xs py-1 rounded-lg capitalize transition
                            ${newTodoPriority === p ? 'bg-white/30 font-semibold' : 'bg-white/10 hover:bg-white/20'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={addTodo}
                      className="w-full bg-white text-violet-700 font-semibold text-sm py-1.5 rounded-lg hover:bg-white/90 transition"
                    >
                      Save
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 pr-0.5">
                  {activeTodos.length === 0 && !addingTodo && (
                    <p className="text-sm opacity-50">No tasks. Add one above.</p>
                  )}
                  {activeTodos.map(t => (
                    <div
                      key={t.id}
                      className="flex items-start gap-2.5 rounded-xl px-3 py-2 group bg-white/10 select-none"
                    >
                      <button
                        onClick={() => toggleTodo(t)}
                        className="mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 border-white/50 flex items-center justify-center hover:bg-white/20 transition"
                      />
                      <p className="flex-1 text-sm leading-tight">{t.title}</p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[t.priority]}`} />
                        <button
                          onClick={() => deleteTodo(t.id)}
                          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs transition"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                  {showCompleted && completedTodos.map(t => (
                    <div
                      key={t.id}
                      className="flex items-start gap-2.5 rounded-xl px-3 py-2 group bg-white/5 select-none"
                    >
                      <button
                        onClick={() => toggleTodo(t)}
                        className="mt-0.5 w-4 h-4 rounded flex-shrink-0 border-2 border-white/50 flex items-center justify-center bg-white/30 transition"
                      >
                        <span className="text-violet-300 text-xs font-bold leading-none">✓</span>
                      </button>
                      <p className="flex-1 text-sm leading-tight opacity-50 line-through">{t.title}</p>
                      <button
                        onClick={() => deleteTodo(t.id)}
                        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs flex-shrink-0 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex-shrink-0 pt-2 border-t border-white/10">
                  <button
                    onClick={() => deleteCurricular(selected.id)}
                    className="text-xs opacity-30 hover:opacity-70 transition"
                  >
                    Delete curricular
                  </button>
                </div>
              </div>

              {/* Right: Metrics, Notes, Links */}
              <div className="w-60 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">

                {/* Metrics */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Metrics</p>
                    <button
                      onClick={() => setAddingMetric(p => !p)}
                      className="text-xs opacity-50 hover:opacity-100 transition"
                    >
                      {addingMetric ? 'Cancel' : '+ Add'}
                    </button>
                  </div>
                  {addingMetric && (
                    <div className="bg-white/10 rounded-xl p-3 space-y-2 mb-2">
                      <input
                        autoFocus
                        className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
                        placeholder="Label (e.g. Revenue)"
                        value={newMetricLabel}
                        onChange={e => setNewMetricLabel(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <select
                          className="bg-white/20 rounded-lg px-2 py-1.5 text-xs outline-none w-16 flex-shrink-0"
                          value={newMetricUnit}
                          onChange={e => setNewMetricUnit(e.target.value)}
                        >
                          <option value="$" className="text-black">$</option>
                          <option value="hrs" className="text-black">hrs</option>
                          <option value="" className="text-black">none</option>
                        </select>
                        <input
                          className="flex-1 bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
                          placeholder="Value"
                          value={newMetricValue}
                          onChange={e => setNewMetricValue(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addMetric()}
                        />
                      </div>
                      <button
                        onClick={addMetric}
                        className="w-full bg-white text-violet-700 font-semibold text-sm py-1 rounded-lg hover:bg-white/90 transition"
                      >
                        Save
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {metrics.map(m => (
                      <div key={m.id} className="bg-white/10 rounded-xl p-2.5 group relative">
                        <p className="text-xs opacity-60 mb-0.5 truncate">{m.label}</p>
                        {editingMetricId === m.id ? (
                          <input
                            autoFocus
                            className="w-full bg-white/20 rounded px-1 py-0.5 text-sm font-semibold outline-none"
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
                          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-50 hover:!opacity-100 text-xs transition leading-none"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {metrics.length === 0 && !addingMetric && (
                      <p className="text-xs opacity-40 col-span-2">No metrics yet</p>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-2">Notes</p>
                  <textarea
                    className="w-full bg-white/10 rounded-xl px-3 py-2.5 text-sm placeholder-white/40 outline-none resize-none"
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
                    <p className="text-xs font-semibold uppercase tracking-wider opacity-70">Links</p>
                    <button
                      onClick={() => setAddingLink(p => !p)}
                      className="text-xs opacity-50 hover:opacity-100 transition"
                    >
                      {addingLink ? 'Cancel' : '+ Add'}
                    </button>
                  </div>
                  {addingLink && (
                    <div className="bg-white/10 rounded-xl p-3 space-y-2 mb-2">
                      <input
                        autoFocus
                        className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
                        placeholder="Title"
                        value={newLinkTitle}
                        onChange={e => setNewLinkTitle(e.target.value)}
                      />
                      <input
                        className="w-full bg-white/20 rounded-lg px-3 py-1.5 text-sm placeholder-white/50 outline-none"
                        placeholder="URL (e.g. docs.google.com/…)"
                        value={newLinkUrl}
                        onChange={e => setNewLinkUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addLink()}
                      />
                      <button
                        onClick={addLink}
                        className="w-full bg-white text-violet-700 font-semibold text-sm py-1 rounded-lg hover:bg-white/90 transition"
                      >
                        Save
                      </button>
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {links.map(l => (
                      <div key={l.id} className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 group">
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-sm hover:underline truncate"
                        >
                          {l.title}
                        </a>
                        <button
                          onClick={() => deleteLink(l.id)}
                          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-xs flex-shrink-0 transition"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {links.length === 0 && !addingLink && (
                      <p className="text-xs opacity-40">No links yet</p>
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
