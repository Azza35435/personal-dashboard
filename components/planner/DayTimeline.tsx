'use client'

import { useEffect, useRef, useState } from 'react'
import {
  DAY_END_MIN,
  DAY_START_MIN,
  PLANNER_COLORS,
  clampToDay,
  laneLayout,
  minToLabel,
  minToY,
  snap15,
  yToMin,
  type DayItem,
} from '@/lib/planner'

const CANVAS_HEIGHT = minToY(DAY_END_MIN)

interface Props {
  items: DayItem[]
  isToday: boolean
  placeMode: boolean
  onOpenEditor: (item: DayItem, anchor: DOMRect) => void
  onCreateByDrag: (startMin: number, endMin: number, anchor: DOMRect) => void
  onMoveResize: (item: DayItem, startMin: number, endMin: number) => void
  onToggleDone: (item: DayItem) => void
  onPlace: (startMin: number) => void
}

type DragKind = 'create' | 'move' | 'resize'

interface TimelineDrag {
  kind: DragKind
  item?: DayItem // move/resize
  anchorMin: number // create: drag origin; move: pointer offset from block start
  startMin: number
  endMin: number
  active: boolean
}

export default function DayTimeline({
  items,
  isToday,
  placeMode,
  onOpenEditor,
  onCreateByDrag,
  onMoveResize,
  onToggleDone,
  onPlace,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<TimelineDrag | null>(null)
  const dragRef = useRef<TimelineDrag | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const pointerMin = (clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return yToMin(clientY - rect.top)
  }

  // ── global listeners while dragging ──
  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || !canvasRef.current) return
      const min = pointerMin(e.clientY)
      let next: TimelineDrag
      if (d.kind === 'create') {
        const a = d.anchorMin
        const b = clampToDay(snap15(min))
        next = { ...d, startMin: Math.min(a, b), endMin: Math.max(a, b), active: d.active || Math.abs(b - a) >= 15 }
      } else if (d.kind === 'move') {
        const dur = d.item!.end - d.item!.start
        let s = clampToDay(snap15(min - d.anchorMin))
        if (s + dur > DAY_END_MIN) s = DAY_END_MIN - dur
        next = { ...d, startMin: s, endMin: s + dur, active: d.active || Math.abs(s - d.item!.start) >= 15 }
      } else {
        const e2 = Math.max(d.item!.start + 15, clampToDay(snap15(min)))
        next = { ...d, endMin: e2, active: d.active || Math.abs(e2 - d.item!.end) >= 15 }
      }
      dragRef.current = next
      setDrag(next)
    }
    const up = (e: PointerEvent) => {
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return
      if (d.kind === 'create') {
        if (d.active && d.endMin - d.startMin >= 15) {
          const rect = canvasRef.current!.getBoundingClientRect()
          const anchor = new DOMRect(rect.left + 40, rect.top + minToY(d.startMin), rect.width - 60, minToY(d.endMin) - minToY(d.startMin))
          onCreateByDrag(d.startMin, d.endMin, anchor)
        }
      } else if (d.active) {
        onMoveResize(d.item!, d.startMin, d.endMin)
      } else if (d.kind === 'move') {
        // plain click on a block → open editor
        const el = document
          .elementsFromPoint(e.clientX, e.clientY)
          .find(x => (x as HTMLElement).dataset?.blockKey === d.item!.key) as HTMLElement | undefined
        onOpenEditor(d.item!, (el ?? canvasRef.current!).getBoundingClientRect())
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [!!drag]) // eslint-disable-line react-hooks/exhaustive-deps

  const startCanvasDrag = (e: React.PointerEvent) => {
    if (e.button !== 0 || !canvasRef.current) return
    const min = clampToDay(snap15(pointerMin(e.clientY)))
    if (placeMode) {
      onPlace(min)
      return
    }
    const d: TimelineDrag = { kind: 'create', anchorMin: min, startMin: min, endMin: min, active: false }
    dragRef.current = d
    setDrag(d)
  }

  const startBlockDrag = (item: DayItem, e: React.PointerEvent) => {
    if (e.button !== 0 || item.kind === 'gcal') return
    e.stopPropagation()
    const d: TimelineDrag = {
      kind: 'move',
      item,
      anchorMin: pointerMin(e.clientY) - item.start,
      startMin: item.start,
      endMin: item.end,
      active: false,
    }
    dragRef.current = d
    setDrag(d)
  }

  const startResizeDrag = (item: DayItem, e: React.PointerEvent) => {
    if (e.button !== 0 || item.kind === 'gcal') return
    e.stopPropagation()
    const d: TimelineDrag = { kind: 'resize', item, anchorMin: 0, startMin: item.start, endMin: item.end, active: false }
    dragRef.current = d
    setDrag(d)
  }

  // Apply in-flight drag to the dragged item for live feedback
  const rendered = items.map(it => {
    if (drag?.active && drag.item && it.key === drag.item.key) {
      return { ...it, start: drag.startMin, end: drag.endMin }
    }
    return it
  })
  const lanes = laneLayout(rendered.map(i => ({ key: i.key, start: i.start, end: i.end })))

  const hours = []
  for (let m = DAY_START_MIN; m < DAY_END_MIN; m += 60) hours.push(m)

  const nowMin = now.getHours() * 60 + now.getMinutes()

  return (
    <div className="flex-1 min-h-0 overflow-y-auto rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 border-l-2 border-l-violet-400 shadow-sm">
      <div className="flex px-2 py-3">
        {/* hour labels */}
        <div className="w-12 flex-shrink-0 relative select-none" style={{ height: CANVAS_HEIGHT }}>
          {hours.map(m => (
            <span key={m} className="absolute right-2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-gray-500" style={{ top: minToY(m) }}>
              {minToLabel(m)}
            </span>
          ))}
        </div>

        {/* canvas */}
        <div
          ref={canvasRef}
          data-planner-canvas
          onPointerDown={startCanvasDrag}
          className={`relative flex-1 ${placeMode ? 'cursor-copy' : 'cursor-crosshair'}`}
          style={{ height: CANVAS_HEIGHT }}
        >
          {hours.map(m => (
            <div key={m} className="absolute inset-x-0 border-t border-gray-100 dark:border-gray-800" style={{ top: minToY(m) }} />
          ))}
          {hours.map(m => (
            <div key={`h-${m}`} className="absolute inset-x-0 border-t border-dashed border-gray-50 dark:border-gray-800/50" style={{ top: minToY(m + 30) }} />
          ))}

          {/* current time line */}
          {isToday && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN && (
            <div className="absolute inset-x-0 z-20 pointer-events-none" style={{ top: minToY(nowMin) }}>
              <div className="border-t-2 border-red-400" />
              <div className="w-2 h-2 rounded-full bg-red-400 -mt-[5px]" />
            </div>
          )}

          {/* creation ghost */}
          {drag?.kind === 'create' && drag.active && (
            <div
              className="absolute left-1 right-1 z-10 rounded border-2 border-dashed border-violet-400 bg-violet-100/60 dark:bg-violet-900/30 pointer-events-none px-2 py-0.5"
              style={{ top: minToY(drag.startMin), height: Math.max(12, minToY(drag.endMin) - minToY(drag.startMin)) }}
            >
              <span className="text-[10px] text-violet-600 dark:text-violet-300">
                {minToLabel(drag.startMin)} – {minToLabel(drag.endMin)}
              </span>
            </div>
          )}

          {/* items */}
          {rendered.map(item => {
            const lane = lanes.get(item.key)!
            const width = 100 / lane.lanes
            const c = PLANNER_COLORS[item.color] ?? PLANNER_COLORS.blue
            const top = minToY(Math.max(item.start, DAY_START_MIN))
            const height = Math.max(16, minToY(Math.min(item.end, DAY_END_MIN)) - top)
            const short = height < 34
            const isDragging = drag?.active && drag.item?.key === item.key

            if (item.kind === 'gcal') {
              return (
                <div
                  key={item.key}
                  className="absolute rounded border border-gray-200 dark:border-gray-700 bg-gray-100/90 dark:bg-gray-800/90 px-2 py-0.5 overflow-hidden pointer-events-none"
                  style={{ top, height, left: `${lane.lane * width}%`, width: `calc(${width}% - 4px)` }}
                >
                  <p className={`text-[11px] text-gray-500 dark:text-gray-400 truncate ${short ? '' : 'font-medium'}`}>
                    🔒 {item.title}
                  </p>
                  {!short && (
                    <p className="text-[10px] text-gray-400">
                      {minToLabel(item.start)} – {minToLabel(item.end)}
                    </p>
                  )}
                </div>
              )
            }

            return (
              <div
                key={item.key}
                data-block-key={item.key}
                onPointerDown={e => startBlockDrag(item, e)}
                className={`absolute rounded border-l-[3px] ${c.border} ${c.bg} px-2 py-0.5 overflow-hidden select-none cursor-grab active:cursor-grabbing shadow-sm ${
                  isDragging ? 'opacity-70 z-30 ring-2 ring-violet-300' : 'z-10'
                } ${item.done ? 'opacity-50' : ''} ${item.kind === 'routine' ? 'border border-dashed border-gray-300 dark:border-gray-600' : ''}`}
                style={{ top, height, left: `${lane.lane * width}%`, width: `calc(${width}% - 4px)` }}
              >
                <div className="flex items-start gap-1.5">
                  <input
                    type="checkbox"
                    checked={!!item.done}
                    onChange={() => onToggleDone(item)}
                    onPointerDown={e => e.stopPropagation()}
                    className="mt-0.5 accent-gray-900 dark:accent-white cursor-pointer flex-shrink-0"
                    style={{ width: 12, height: 12 }}
                  />
                  <div className="min-w-0">
                    <p className={`text-[11px] leading-tight truncate ${c.text} ${item.done ? 'line-through' : ''} ${short ? '' : 'font-medium'}`}>
                      {item.todoId != null && '☑ '}
                      {item.kind === 'routine' && '🔁 '}
                      {item.title}
                    </p>
                    {!short && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        {minToLabel(item.start)} – {minToLabel(item.end)}
                        {item.note ? ' · 📝' : ''}
                      </p>
                    )}
                  </div>
                </div>
                {/* resize handle */}
                <div
                  onPointerDown={e => startResizeDrag(item, e)}
                  className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
