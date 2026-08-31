import type { Habit, HabitPeriod } from './types'

export type RotatingPeriod = Exclude<HabitPeriod, 'anytime'>

export const PERIOD_INFO: Record<RotatingPeriod, { label: string; range: string }> = {
  morning: { label: 'Morning', range: '5am–12pm' },
  afternoon: { label: 'Afternoon', range: '12pm–9pm' },
  evening: { label: 'Evening', range: '9pm–5am' },
}

export const ROTATING_PERIODS: RotatingPeriod[] = ['morning', 'afternoon', 'evening']

// Boundaries: morning 5am–12pm, afternoon 12pm–9pm, evening 9pm–5am (wraps midnight).
export function getCurrentPeriod(d: Date = new Date()): RotatingPeriod {
  const hour = d.getHours()
  if (hour < 5) return 'evening'
  if (hour < 12) return 'morning'
  if (hour < 21) return 'afternoon'
  return 'evening'
}

export function habitVisibleInPeriod(h: Pick<Habit, 'period'>, period: RotatingPeriod): boolean {
  return h.period === 'anytime' || h.period === period
}
