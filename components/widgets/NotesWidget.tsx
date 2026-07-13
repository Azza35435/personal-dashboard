'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function NotesWidget() {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(true)
  const [loading, setLoading] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // RLS scopes this to the signed-in user's single row
    supabase
      .from('notes')
      .select('*')
      .maybeSingle()
      .then(({ data }) => {
        setContent(data?.content ?? '')
        setLoading(false)
      })
  }, [])

  const save = async (val: string) => {
    await supabase
      .from('notes')
      .upsert({ content: val, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    setSaved(true)
  }

  const handleChange = (val: string) => {
    setContent(val)
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(val), 800)
  }

  return (
    <div className="rounded p-5 flex flex-col gap-2 h-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-slate-400 shadow-sm text-gray-900 dark:text-gray-100">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">Notes</p>
        <span className="text-xs text-gray-400 dark:text-gray-500">{saved ? 'Saved' : 'Saving…'}</span>
      </div>
      {loading ? (
        <div className="animate-pulse flex-1 bg-gray-200 dark:bg-gray-700 rounded" />
      ) : (
        <textarea
          className="flex-1 bg-gray-50 dark:bg-gray-800 rounded p-3 text-sm resize-none outline-none placeholder-gray-400 focus:bg-gray-100 dark:focus:bg-gray-700 border border-gray-100 dark:border-gray-700 transition leading-relaxed text-gray-800 dark:text-gray-200"
          placeholder="Jot something down…"
          value={content}
          onChange={(e) => handleChange(e.target.value)}
        />
      )}
    </div>
  )
}
