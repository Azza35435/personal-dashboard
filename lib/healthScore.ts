import type { AppleHealthLog } from './types'

// Bevel-style composite "day score" ring: how close today's Apple Health
// metrics are to personal targets, averaged across whichever metrics were
// actually synced that day. Shared by AppleHealthWidget (Health page) and
// AppleHealthTracker (/apple-health) so both rings agree.

const TARGETS_KEY = 'health_score_targets'

export interface HealthScoreTargets {
  steps: number
  exercise_min: number
  active_energy_kcal: number
  stand_hours: number
  sleep_total_min: number
}

export const DEFAULT_HEALTH_SCORE_TARGETS: HealthScoreTargets = {
  steps: 10000,
  exercise_min: 30,
  active_energy_kcal: 500,
  stand_hours: 12,
  sleep_total_min: 420, // 7h
}

export function loadHealthScoreTargets(): HealthScoreTargets {
  if (typeof window === 'undefined') return DEFAULT_HEALTH_SCORE_TARGETS
  try {
    const raw = localStorage.getItem(TARGETS_KEY)
    if (!raw) return DEFAULT_HEALTH_SCORE_TARGETS
    return { ...DEFAULT_HEALTH_SCORE_TARGETS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_HEALTH_SCORE_TARGETS
  }
}

export function saveHealthScoreTargets(targets: HealthScoreTargets) {
  localStorage.setItem(TARGETS_KEY, JSON.stringify(targets))
}

const SCORE_METRICS: (keyof HealthScoreTargets)[] = [
  'steps', 'exercise_min', 'active_energy_kcal', 'stand_hours', 'sleep_total_min',
]

export function computeHealthScore(
  log: Pick<AppleHealthLog, keyof HealthScoreTargets> | null | undefined,
  targets: HealthScoreTargets = loadHealthScoreTargets(),
): number | null {
  if (!log) return null
  const ratios: number[] = []
  for (const key of SCORE_METRICS) {
    const value = log[key]
    if (value == null) continue
    const target = targets[key]
    if (!target) continue
    ratios.push(Math.min(value / target, 1))
  }
  if (ratios.length === 0) return null
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
  return Math.round(avg * 100)
}

export function scoreColor(score: number | null): string {
  if (score == null) return '#9ca3af' // gray-400
  if (score >= 80) return '#34d399' // emerald-400
  if (score >= 50) return '#fbbf24' // amber-400
  return '#fb7185' // rose-400
}

// ── Check-in streaks ────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0]

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// Current streak: consecutive check-in dates walking back from today (or
// yesterday, so the streak doesn't reset to 0 first thing in the morning
// before today's check-in has happened).
export function currentStreak(checkinDates: Set<string>): number {
  let streak = 0
  let cursor = checkinDates.has(todayStr()) ? todayStr() : addDays(todayStr(), -1)
  while (checkinDates.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function longestStreak(checkinDates: string[]): number {
  const sorted = [...checkinDates].sort()
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const date of sorted) {
    if (prev && addDays(prev, 1) === date) {
      run++
    } else {
      run = 1
    }
    longest = Math.max(longest, run)
    prev = date
  }
  return longest
}
