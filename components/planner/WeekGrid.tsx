'use client'

import {
  DAY_END_MIN,
  DAY_START_MIN,
  PLANNER_COLORS,
  laneLayout,
  minToLabel,
  localDateStr,
  type DayItem,
} from '@/lib/planner'

const GRID_PX_PER_HOUR = 30
const gridY = (min: number) => ((min - DAY_START_MIN) / 60) * GRID_PX_PER_HOUR
const GRID_HEIGHT = gridY(DAY_END_MIN)

interface Props {
  days: Date[] // Mon–Sun
  itemsByDate: Map<string, DayItem[]>
  onSelectDay: (d: Date) => void
}

export default function WeekGrid({ days, itemsByDate, onSelectDay }: Props) {
  const todayStr = localDateStr(new Date())

  const hours: number[] = []
  for (let m = DAY_START_MIN; m < DAY_END_MIN; m += 120) hours.push(m)

  return (
    <div className="flex-1 min-h-0 overflow-y-auto rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 shadow-sm">
      {/* day headers */}
      <div className="flex sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="w-10 flex-shrink-0" />
        {days.map(d => {
          const ds = localDateStr(d)
          const isToday = ds === todayStr
          const items = itemsByDate.get(ds) ?? []
          const blockedMin = items.filter(i => i.kind !== 'gcal').reduce((s, i) => s + (i.end - i.start), 0)
          return (
            <button
              key={ds}
              onClick={() => onSelectDay(d)}
              className="flex-1 min-w-0 py-2 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              title="Open day"
            >
              <p className={`text-[10px] uppercase tracking-wider ${isToday ? 'text-violet-500 font-semibold' : 'text-gray-400'}`}>
                {d.toLocaleDateString('en-AU', { weekday: 'short' })}
              </p>
              <p className={`text-sm ${isToday ? 'text-violet-600 dark:text-violet-400 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                {d.getDate()}
              </p>
              <p className="text-[9px] text-gray-400">
                {blockedMin > 0 ? `${(blockedMin / 60).toFixed(blockedMin % 60 === 0 ? 0 : 1)}h planned` : '—'}
              </p>
            </button>
          )
        })}
      </div>

      {/* grid */}
      <div className="flex px-0 py-2">
        <div className="w-10 flex-shrink-0 relative select-none" style={{ height: GRID_HEIGHT }}>
          {hours.map(m => (
            <span key={m} className="absolute right-1.5 -translate-y-1/2 text-[9px] text-gray-400 dark:text-gray-500" style={{ top: gridY(m) }}>
              {minToLabel(m)}
            </span>
          ))}
        </div>
        {days.map(d => {
          const ds = localDateStr(d)
          const items = itemsByDate.get(ds) ?? []
          const lanes = laneLayout(items.map(i => ({ key: i.key, start: i.start, end: i.end })))
          return (
            <div
              key={ds}
              onClick={() => onSelectDay(d)}
              className={`relative flex-1 min-w-0 border-l border-gray-100 dark:border-gray-800 cursor-pointer ${
                ds === todayStr ? 'bg-violet-50/40 dark:bg-violet-950/10' : ''
              }`}
              style={{ height: GRID_HEIGHT }}
            >
              {hours.map(m => (
                <div key={m} className="absolute inset-x-0 border-t border-gray-100 dark:border-gray-800" style={{ top: gridY(m) }} />
              ))}
              {items.map(item => {
                const lane = lanes.get(item.key)!
                const width = 100 / lane.lanes
                const top = gridY(Math.max(item.start, DAY_START_MIN))
                const height = Math.max(10, gridY(Math.min(item.end, DAY_END_MIN)) - top)
                const c = PLANNER_COLORS[item.color] ?? PLANNER_COLORS.blue
                return item.kind === 'gcal' ? (
                  <div
                    key={item.key}
                    className="absolute rounded-sm bg-gray-100/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 px-1 overflow-hidden"
                    style={{ top, height, left: `${lane.lane * width}%`, width: `calc(${width}% - 2px)` }}
                  >
                    <p className="text-[8px] text-gray-500 dark:text-gray-400 truncate leading-tight">{item.title}</p>
                  </div>
                ) : (
                  <div
                    key={item.key}
                    className={`absolute rounded-sm ${c.bg} border-l-2 ${c.border} px-1 overflow-hidden ${item.done ? 'opacity-50' : ''}`}
                    style={{ top, height, left: `${lane.lane * width}%`, width: `calc(${width}% - 2px)` }}
                  >
                    <p className={`text-[8px] truncate leading-tight ${c.text} ${item.done ? 'line-through' : ''}`}>{item.title}</p>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
