'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { AppleHealthLog } from '@/lib/types'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ── helpers ────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0]

function isoDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

function fmtMins(min: number | null) {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function fmtDay(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function fmtShort(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function getMonthBounds(offset: number) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  return { first, last, year: first.getFullYear(), month: first.getMonth() }
}

function buildMonthGrid(year: number, month: number): (string | null)[][] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const numDays = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= numDays; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function sleepColor(min: number | null): string {
  if (min == null) return ''
  const hrs = min / 60
  if (hrs >= 7) return 'bg-emerald-400'
  if (hrs >= 6) return 'bg-amber-400'
  return 'bg-rose-400'
}

// ── metric card ────────────────────────────────────────────────────────────

interface MetricCardProps {
  icon: string
  label: string
  value: string
  unit?: string
  sub?: string
  accent?: string
}

function MetricCard({ icon, label, value, unit, sub, accent = 'border-l-gray-200 dark:border-l-gray-700' }: MetricCardProps) {
  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 ${accent} rounded shadow-sm px-4 py-3 flex flex-col gap-1`}>
      <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold uppercase tracking-widest">
        <span>{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">
        {value}
        {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  )
}

// ── trend chart ────────────────────────────────────────────────────────────

interface TrendChartProps {
  data: { date: string; value: number | null }[]
  color: string
  unit: string
  label: string
}

function TrendChart({ data, color, unit, label }: TrendChartProps) {
  const chartData = data.map(d => ({
    date: fmtShort(d.date),
    value: d.value,
  }))

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-sm px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">{label}</p>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb' }}
            formatter={(v) => [`${v} ${unit}`, label]}
            labelStyle={{ color: '#6b7280' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── setup guide ────────────────────────────────────────────────────────────

function SetupGuide() {
  const [open, setOpen] = useState(false)
  const url = typeof window !== 'undefined' ? window.location.origin : 'https://your-dashboard.vercel.app'

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">📱</span>
          <div>
            <p className="text-sm font-semibold">iOS Shortcut setup</p>
            <p className="text-xs text-gray-400">How to sync Apple Health data to this dashboard</p>
          </div>
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 space-y-5 text-sm">

          {/* Step 1 */}
          <div className="pt-4">
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Step 1 — Add the secret to Vercel</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-500 text-xs leading-relaxed">
              <li>Go to your Vercel project → Settings → Environment Variables</li>
              <li>Add a new variable named <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">HEALTH_SYNC_SECRET</code></li>
              <li>Set its value to any strong random string (e.g. from <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">openssl rand -base64 32</code>)</li>
              <li>Redeploy for the change to take effect</li>
            </ol>
          </div>

          {/* Step 2 */}
          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Step 2 — Build the iOS Shortcut</p>
            <p className="text-xs text-gray-500 mb-3">Open the <strong>Shortcuts</strong> app on your iPhone and create a new shortcut with these actions in order:</p>

            <div className="space-y-2 text-xs">
              {[
                { n: 1, title: 'Calculate date', detail: 'Date: "Current Date" → Adjust: subtract 1 day → Set variable "SyncDate"' },
                { n: 2, title: 'Get Health Samples — Steps', detail: 'Type: Steps · Start: SyncDate (start of day) · End: SyncDate (end of day) · Aggregate: Sum → Set variable "Steps"' },
                { n: 3, title: 'Get Health Samples — Active Energy', detail: 'Type: Active Energy Burned · Same date range · Aggregate: Sum → Set variable "Energy"' },
                { n: 4, title: 'Get Health Samples — Resting HR', detail: 'Type: Resting Heart Rate · Same date range · Aggregate: Average → Set variable "RestHR"' },
                { n: 5, title: 'Get Health Samples — HRV', detail: 'Type: Heart Rate Variability · Same date range · Aggregate: Average → Set variable "HRV"' },
                { n: 6, title: 'Get Health Samples — Sleep', detail: 'Type: Sleep · Start: SyncDate (start of day) · End: SyncDate + 1 (end of day) · Aggregate: Sum → Set variable "SleepMins" (value in hours × 60)' },
                { n: 7, title: 'Get Health Samples — Blood Oxygen', detail: 'Type: Blood Oxygen Saturation · Same range · Aggregate: Average → Set variable "SpO2"' },
                { n: 8, title: 'Get Health Samples — Respiratory Rate', detail: 'Type: Respiratory Rate · Same range · Aggregate: Average → Set variable "RespRate"' },
                { n: 9, title: 'Get Health Samples — VO2 Max', detail: 'Type: VO2 Max · Same range · Aggregate: Latest → Set variable "VO2"' },
                { n: 10, title: 'Get Health Samples — Exercise Minutes', detail: 'Type: Exercise Time · Same range · Aggregate: Sum → Set variable "ExMin"' },
                { n: 11, title: 'Get Health Samples — Stand Hours', detail: 'Type: Apple Stand Time · Same range · Aggregate: Sum → Set variable "StandHrs"' },
                { n: 12, title: 'Get Contents of URL (POST)', detail: `URL: ${url}/api/health-sync\nMethod: POST\nHeaders: Authorization → Bearer YOUR_SECRET_HERE\nBody (JSON): {"records":[{"date": SyncDate,"steps": Steps,"active_energy_kcal": Energy,"resting_hr": RestHR,"hrv_ms": HRV,"sleep_total_min": SleepMins,"blood_oxygen_pct": SpO2,"respiratory_rate": RespRate,"vo2_max": VO2,"exercise_min": ExMin,"stand_hours": StandHrs}]}` },
              ].map(step => (
                <div key={step.n} className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 flex-shrink-0 flex items-center justify-center font-medium text-xs">
                    {step.n}
                  </span>
                  <div>
                    <p className="font-medium text-gray-700 dark:text-gray-300">{step.title}</p>
                    <p className="text-gray-400 whitespace-pre-wrap leading-relaxed">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Step 3 */}
          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Step 3 — Automate it</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-500 text-xs leading-relaxed">
              <li>In Shortcuts → Automation → tap <strong>+</strong> → Personal Automation</li>
              <li>Choose <strong>Time of Day</strong> → set to 8:00 AM daily</li>
              <li>Add action: <strong>Run Shortcut</strong> → select your new shortcut</li>
              <li>Disable "Ask Before Running" so it fires silently</li>
            </ol>
          </div>

          {/* Step 4 — backfill */}
          <div>
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Step 4 — Initial 30-day backfill (optional)</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              In the Shortcut, temporarily change the date offset from <strong>−1 day</strong> to <strong>−30 days</strong>,
              run it manually, then change it back to <strong>−1 day</strong>. Each run syncs one day,
              so run it 30 times — or change step 1 to loop through a date range.
            </p>
          </div>

          {/* Note on sleep stages */}
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            <strong>Note on sleep stages:</strong> iOS Shortcuts can retrieve total sleep time but extracting Deep/REM/Core breakdowns
            requires computing segment durations which is complex in Shortcuts. For full sleep stage data,
            use the <strong>Health Auto Export</strong> app ($4 on the App Store) pointed at{' '}
            <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">{url}/api/health-sync</code>.
          </div>
        </div>
      )}
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────────

export default function AppleHealthTracker() {
  const [logs, setLogs] = useState<AppleHealthLog[]>([])
  const [monthLogs, setMonthLogs] = useState<AppleHealthLog[]>([])
  const [loading, setLoading] = useState(true)
  const [monthOffset, setMonthOffset] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // most recent log for snapshot
  const latest = logs[0] ?? null

  // 7-day window ending today
  const sevenDays = (() => {
    const end = todayStr()
    const days: string[] = []
    for (let i = 6; i >= 0; i--) days.push(addDays(end, -i))
    return days
  })()

  const load7Day = useCallback(async () => {
    setLoading(true)
    const from = addDays(todayStr(), -29)
    const { data } = await supabase
      .from('apple_health_logs')
      .select('*')
      .gte('date', from)
      .order('date', { ascending: false })
    setLogs((data as AppleHealthLog[]) ?? [])
    setLoading(false)
  }, [])

  const loadMonth = useCallback(async () => {
    const { first, last } = getMonthBounds(monthOffset)
    const { data } = await supabase
      .from('apple_health_logs')
      .select('*')
      .gte('date', isoDate(first))
      .lte('date', isoDate(last))
    setMonthLogs((data as AppleHealthLog[]) ?? [])
  }, [monthOffset])

  useEffect(() => { load7Day() }, [load7Day])
  useEffect(() => { loadMonth() }, [loadMonth])

  const logByDate = Object.fromEntries(logs.map(l => [l.date, l]))
  const monthLogByDate = Object.fromEntries(monthLogs.map(l => [l.date, l]))

  function trendData(key: keyof AppleHealthLog) {
    return sevenDays.map(date => ({
      date,
      value: logByDate[date]?.[key] as number | null ?? null,
    }))
  }

  const { first, last, year, month } = getMonthBounds(monthOffset)
  const calGrid = buildMonthGrid(year, month)
  const monthLabel = first.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  const selectedLog = selectedDate ? (monthLogByDate[selectedDate] ?? logByDate[selectedDate] ?? null) : null

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-xl font-semibold">Apple Health</h1>

      {/* ── Snapshot ─────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          {latest ? `Latest · ${fmtDay(latest.date)}` : 'No data yet'}
        </p>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        ) : !latest ? (
          <p className="text-sm text-gray-400">Sync your first record using the setup guide below.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <MetricCard icon="🌙" label="Sleep" value={fmtMins(latest.sleep_total_min)} accent="border-l-violet-400"
              sub={latest.sleep_deep_min != null
                ? `Deep ${fmtMins(latest.sleep_deep_min)} · REM ${fmtMins(latest.sleep_rem_min)}`
                : undefined} />
            <MetricCard icon="❤️" label="Resting HR" value={latest.resting_hr?.toFixed(0) ?? '—'} unit="bpm" accent="border-l-rose-400" />
            <MetricCard icon="📊" label="HRV" value={latest.hrv_ms?.toFixed(1) ?? '—'} unit="ms" accent="border-l-blue-400" />
            <MetricCard icon="👣" label="Steps" value={latest.steps?.toLocaleString() ?? '—'} accent="border-l-emerald-400" />
            <MetricCard icon="🔥" label="Active Energy" value={latest.active_energy_kcal?.toFixed(0) ?? '—'} unit="kcal" accent="border-l-orange-400" />
            <MetricCard icon="🏃" label="Exercise" value={latest.exercise_min?.toString() ?? '—'} unit="min" accent="border-l-teal-400" />
            <MetricCard icon="🫁" label="Blood Oxygen" value={latest.blood_oxygen_pct?.toFixed(1) ?? '—'} unit="%" accent="border-l-sky-400" />
            <MetricCard icon="💨" label="Resp. Rate" value={latest.respiratory_rate?.toFixed(1) ?? '—'} unit="br/min" accent="border-l-indigo-400" />
            <MetricCard icon="🧬" label="VO2 Max" value={latest.vo2_max?.toFixed(1) ?? '—'} unit="mL/kg" accent="border-l-lime-400" />
            <MetricCard icon="🧍" label="Stand Hours" value={latest.stand_hours?.toString() ?? '—'} unit="h" accent="border-l-amber-400" />
            {latest.weight_kg != null && (
              <MetricCard icon="⚖️" label="Weight" value={latest.weight_kg.toFixed(1)} unit="kg" accent="border-l-slate-400" />
            )}
            {latest.sleep_deep_min != null && (
              <MetricCard icon="🟣" label="Deep Sleep" value={fmtMins(latest.sleep_deep_min)} accent="border-l-purple-400" />
            )}
          </div>
        )}
      </div>

      {/* ── 7-day trends ─────────────────────────────────────────────── */}
      {!loading && latest && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">7-day trends</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <TrendChart data={trendData('sleep_total_min')} color="#a78bfa" unit="min" label="Sleep (min)" />
            <TrendChart data={trendData('resting_hr')} color="#fb7185" unit="bpm" label="Resting HR" />
            <TrendChart data={trendData('hrv_ms')} color="#60a5fa" unit="ms" label="HRV" />
            <TrendChart data={trendData('steps')} color="#34d399" unit="steps" label="Steps" />
            <TrendChart data={trendData('active_energy_kcal')} color="#fb923c" unit="kcal" label="Active Energy" />
            <TrendChart data={trendData('exercise_min')} color="#2dd4bf" unit="min" label="Exercise" />
          </div>
        </div>
      )}

      {/* ── Monthly calendar ─────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Monthly</p>
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setMonthOffset(o => o - 1)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 text-sm"
            >
              ‹
            </button>
            <span className="text-xs text-gray-500 w-32 text-center">{monthLabel}</span>
            <button
              onClick={() => setMonthOffset(o => o + 1)}
              disabled={monthOffset >= 0}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 text-sm disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-sm overflow-hidden">
          {/* Column headers */}
          <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-gray-400">{d}</div>
            ))}
          </div>

          {/* Calendar rows */}
          {calGrid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800 last:border-0">
              {week.map((dateStr, di) => {
                if (!dateStr) return <div key={di} className="h-16 bg-gray-50 dark:bg-gray-800/30" />
                const log = monthLogByDate[dateStr]
                const isToday = dateStr === todayStr()
                const isSelected = dateStr === selectedDate
                return (
                  <button
                    key={di}
                    onClick={() => setSelectedDate(d => d === dateStr ? null : dateStr)}
                    className={`h-16 p-1.5 flex flex-col items-start relative hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isSelected ? 'bg-gray-50 dark:bg-gray-800/60' : ''}`}
                  >
                    <span className={`text-xs font-medium mb-auto ${isToday ? 'bg-rose-500 text-white w-5 h-5 rounded-full flex items-center justify-center' : 'text-gray-500'}`}>
                      {parseInt(dateStr.split('-')[2])}
                    </span>
                    {log && (
                      <div className={`w-full h-1.5 rounded-full ${sleepColor(log.sleep_total_min) || 'bg-gray-200'}`} />
                    )}
                    {log && (
                      <span className="text-xs text-gray-400 mt-0.5 leading-none">
                        {fmtMins(log.sleep_total_min)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-2 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />≥7h sleep</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />6–7h</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />&lt;6h</span>
        </div>

        {/* Day detail panel */}
        {selectedDate && selectedLog && (
          <div className="mt-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded shadow-sm px-5 py-4">
            <p className="text-sm font-semibold mb-3">{fmtDay(selectedDate)}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-sm">
              {[
                { icon: '🌙', label: 'Sleep', value: fmtMins(selectedLog.sleep_total_min) },
                { icon: '❤️', label: 'Resting HR', value: selectedLog.resting_hr ? `${selectedLog.resting_hr.toFixed(0)} bpm` : '—' },
                { icon: '📊', label: 'HRV', value: selectedLog.hrv_ms ? `${selectedLog.hrv_ms.toFixed(1)} ms` : '—' },
                { icon: '👣', label: 'Steps', value: selectedLog.steps?.toLocaleString() ?? '—' },
                { icon: '🔥', label: 'Energy', value: selectedLog.active_energy_kcal ? `${selectedLog.active_energy_kcal.toFixed(0)} kcal` : '—' },
                { icon: '🏃', label: 'Exercise', value: selectedLog.exercise_min ? `${selectedLog.exercise_min} min` : '—' },
                { icon: '🫁', label: 'SpO2', value: selectedLog.blood_oxygen_pct ? `${selectedLog.blood_oxygen_pct.toFixed(1)}%` : '—' },
                { icon: '💨', label: 'Resp.', value: selectedLog.respiratory_rate ? `${selectedLog.respiratory_rate.toFixed(1)} br/min` : '—' },
                { icon: '🧬', label: 'VO2 Max', value: selectedLog.vo2_max ? `${selectedLog.vo2_max.toFixed(1)} mL/kg` : '—' },
                { icon: '🧍', label: 'Stand', value: selectedLog.stand_hours ? `${selectedLog.stand_hours}h` : '—' },
              ].map(item => (
                <div key={item.label} className="flex flex-col gap-0.5">
                  <span className="text-gray-400 text-xs">{item.icon} {item.label}</span>
                  <span className="font-medium tabular-nums">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {selectedDate && !selectedLog && (
          <div className="mt-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded px-5 py-4 text-sm text-gray-400">
            No data for {fmtDay(selectedDate)}.
          </div>
        )}
      </div>

      {/* ── Setup guide ──────────────────────────────────────────────── */}
      <SetupGuide />
    </div>
  )
}
