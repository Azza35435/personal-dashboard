'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppleHealthCheckin } from '@/lib/types'
import { currentStreak, longestStreak } from '@/lib/healthScore'

const todayStr = () => new Date().toISOString().split('T')[0]
const MOODS = [
  { value: 1, emoji: '😞' },
  { value: 2, emoji: '🙁' },
  { value: 3, emoji: '😐' },
  { value: 4, emoji: '🙂' },
  { value: 5, emoji: '😄' },
]

interface CheckInProps {
  variant?: 'compact' | 'full'
}

export default function CheckIn({ variant = 'full' }: CheckInProps) {
  const [checkins, setCheckins] = useState<AppleHealthCheckin[]>([])
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [mood, setMood] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('apple_health_checkins')
      .select('*')
      .order('date', { ascending: false })
      .limit(400)
    setCheckins((data as AppleHealthCheckin[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const dates = new Set(checkins.map(c => c.date))
  const doneToday = dates.has(todayStr())
  const streak = currentStreak(dates)
  const best = longestStreak(checkins.map(c => c.date))

  async function submit() {
    setSaving(true)
    await supabase.from('apple_health_checkins').upsert(
      { date: todayStr(), mood, note: note.trim() || null },
      { onConflict: 'user_id,date' },
    )
    setSaving(false)
    setPicking(false)
    setMood(null)
    setNote('')
    load()
  }

  if (loading) {
    return <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
  }

  const flame = (
    <span className="flex items-center gap-1 text-sm font-semibold tabular-nums">
      🔥 {streak}
      {variant === 'full' && <span className="text-xs font-normal text-gray-400">day streak</span>}
    </span>
  )

  const trigger = doneToday ? (
    <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 font-medium">
      ✓ Checked in
    </span>
  ) : (
    <button
      onClick={() => setPicking(p => !p)}
      className="text-xs px-2.5 py-1 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium"
    >
      Check in
    </button>
  )

  return (
    <div className={variant === 'full' ? 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-sm px-4 py-3 flex flex-col gap-2' : 'flex flex-col gap-1.5'}>
      <div className="flex items-center justify-between gap-2">
        {flame}
        {trigger}
      </div>
      {variant === 'full' && best > streak && (
        <p className="text-xs text-gray-400">Best streak: {best} days</p>
      )}

      {picking && (
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2">
            {MOODS.map(m => (
              <button
                key={m.value}
                onClick={() => setMood(m.value)}
                className={`w-8 h-8 flex items-center justify-center rounded-full text-lg transition-colors ${mood === m.value ? 'bg-gray-900 dark:bg-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                {m.emoji}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded placeholder-gray-400 text-sm px-2.5 py-1.5"
          />
          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={saving}
              className="text-xs px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setPicking(false)} className="text-xs px-3 py-1.5 text-gray-400">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
