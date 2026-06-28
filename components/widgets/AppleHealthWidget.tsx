'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { AppleHealthLog } from '@/lib/types'

function fmtMins(min: number | null) {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  if (dateStr === today) return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

interface StatProps { label: string; value: string; unit?: string; icon: string }
function Stat({ label, value, unit, icon }: StatProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-lg">{icon}</span>
      <span className="text-base font-semibold tabular-nums">
        {value}
        {unit && <span className="text-xs font-normal text-gray-400 ml-0.5">{unit}</span>}
      </span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  )
}

export default function AppleHealthWidget() {
  const [log, setLog] = useState<AppleHealthLog | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('apple_health_logs')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .single()
    setLog(data ?? null)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-rose-400 rounded shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Apple Health</h2>
        <Link
          href="/apple-health"
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          Full view →
        </Link>
      </div>

      <div className="flex-1 px-4 py-4">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        ) : !log ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-6 text-center">
            <span className="text-3xl">♡</span>
            <p className="text-sm text-gray-500">No data yet</p>
            <p className="text-xs text-gray-400">Set up your iOS Shortcut to start syncing</p>
            <Link
              href="/apple-health"
              className="mt-2 text-xs px-3 py-1.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded"
            >
              Setup guide →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-400">{fmtDate(log.date)}</p>
            <div className="grid grid-cols-2 gap-4">
              <Stat icon="🌙" label="Sleep" value={fmtMins(log.sleep_total_min)} />
              <Stat icon="❤️" label="Resting HR" value={log.resting_hr?.toFixed(0) ?? '—'} unit="bpm" />
              <Stat icon="📊" label="HRV" value={log.hrv_ms?.toFixed(0) ?? '—'} unit="ms" />
              <Stat icon="👣" label="Steps" value={log.steps?.toLocaleString() ?? '—'} />
              <Stat icon="🔥" label="Energy" value={log.active_energy_kcal?.toFixed(0) ?? '—'} unit="kcal" />
              <Stat icon="🏃" label="Exercise" value={log.exercise_min?.toString() ?? '—'} unit="min" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
