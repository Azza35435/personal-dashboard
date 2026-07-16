// Shared planner maths + palette. Times are minutes-from-midnight integers
// (avoids timezone arithmetic entirely — a block is always local to its date).

export const DAY_START_MIN = 5 * 60 // timeline starts 05:00
export const DAY_END_MIN = 24 * 60 // ends midnight
export const PX_PER_HOUR = 52

export const snap15 = (min: number) => Math.round(min / 15) * 15

export const clampToDay = (min: number) => Math.max(DAY_START_MIN, Math.min(DAY_END_MIN, min))

export const minToY = (min: number) => ((min - DAY_START_MIN) / 60) * PX_PER_HOUR

export const yToMin = (y: number) => DAY_START_MIN + (y / PX_PER_HOUR) * 60

export function minToLabel(min: number): string {
  const h24 = Math.floor(min / 60) % 24
  const m = min % 60
  const ampm = h24 < 12 ? 'am' : 'pm'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`
}

// "HH:MM" <-> minutes, for <input type="time">
export const minToTimeInput = (min: number) =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
export const timeInputToMin = (v: string) => {
  const [h, m] = v.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Monday-first weekday index (0=Mon … 6=Sun), matching habit/calendar convention
export const mondayIndex = (d: Date) => (d.getDay() + 6) % 7

// Same palette as gym sessions
export const PLANNER_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  blue:    { bg: 'bg-blue-100 dark:bg-blue-900/40',       border: 'border-blue-400',    text: 'text-blue-900 dark:text-blue-200',       dot: 'bg-blue-400' },
  violet:  { bg: 'bg-violet-100 dark:bg-violet-900/40',   border: 'border-violet-400',  text: 'text-violet-900 dark:text-violet-200',   dot: 'bg-violet-400' },
  rose:    { bg: 'bg-rose-100 dark:bg-rose-900/40',       border: 'border-rose-400',    text: 'text-rose-900 dark:text-rose-200',       dot: 'bg-rose-400' },
  orange:  { bg: 'bg-orange-100 dark:bg-orange-900/40',   border: 'border-orange-400',  text: 'text-orange-900 dark:text-orange-200',   dot: 'bg-orange-400' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', border: 'border-emerald-400', text: 'text-emerald-900 dark:text-emerald-200', dot: 'bg-emerald-400' },
  amber:   { bg: 'bg-amber-100 dark:bg-amber-900/40',     border: 'border-amber-400',   text: 'text-amber-900 dark:text-amber-200',     dot: 'bg-amber-400' },
  teal:    { bg: 'bg-teal-100 dark:bg-teal-900/40',       border: 'border-teal-400',    text: 'text-teal-900 dark:text-teal-200',       dot: 'bg-teal-400' },
  slate:   { bg: 'bg-slate-200 dark:bg-slate-700/60',     border: 'border-slate-400',   text: 'text-slate-800 dark:text-slate-200',     dot: 'bg-slate-400' },
}
export const COLOR_KEYS = Object.keys(PLANNER_COLORS)

// Unified render item for the timeline/week grid: a real block, a virtual
// routine occurrence (no row yet), or a read-only Google Calendar event.
export interface DayItem {
  key: string
  kind: 'block' | 'routine' | 'gcal'
  blockId?: string
  routineId?: string
  todoId?: string | null
  title: string
  start: number
  end: number
  color: string
  note?: string | null
  done?: boolean
}

// Greedy lane assignment so overlapping items render side-by-side.
export interface LaneItem {
  key: string
  start: number
  end: number
}
export function laneLayout(items: LaneItem[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end)
  const laneEnds: number[] = [] // end time of last item in each lane
  const assigned = new Map<string, { lane: number; lanes: number }>()
  // cluster = run of transitively-overlapping items; lanes reset per cluster
  let cluster: string[] = []
  let clusterMaxLane = 0
  let clusterEnd = -1
  const flush = () => {
    for (const k of cluster) assigned.get(k)!.lanes = clusterMaxLane + 1
    cluster = []
    clusterMaxLane = 0
    laneEnds.length = 0
  }
  for (const it of sorted) {
    if (cluster.length > 0 && it.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex(end => end <= it.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(it.end)
    } else {
      laneEnds[lane] = it.end
    }
    assigned.set(it.key, { lane, lanes: 1 })
    cluster.push(it.key)
    clusterMaxLane = Math.max(clusterMaxLane, lane)
    clusterEnd = Math.max(clusterEnd, it.end)
  }
  flush()
  return assigned
}
