'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function NotesWidget() {
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(true)
  const [loading, setLoading] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase
      .from('notes')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        setContent(data?.content ?? '')
        setLoading(false)
      })
  }, [])

  const save = async (val: string) => {
    await supabase
      .from('notes')
      .upsert({ id: 1, content: val, updated_at: new Date().toISOString() })
    setSaved(true)
  }

  const handleChange = (val: string) => {
    setContent(val)
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(val), 800)
  }

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-2 h-full bg-sky-500 text-white">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold uppercase tracking-wider opacity-80">Notes</p>
        <span className="text-xs opacity-50">{saved ? 'Saved' : 'Saving…'}</span>
      </div>
      {loading ? (
        <div className="animate-pulse flex-1 bg-white/20 rounded-xl" />
      ) : (
        <textarea
          className="flex-1 bg-white/10 rounded-xl p-3 text-sm resize-none outline-none placeholder-white/40 focus:bg-white/20 transition leading-relaxed"
          placeholder="Jot something down…"
          value={content}
          onChange={(e) => handleChange(e.target.value)}
        />
      )}
    </div>
  )
}
