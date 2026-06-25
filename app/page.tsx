'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import GridLayout, { type Layout, type LayoutItem } from 'react-grid-layout'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'

const HeroWidget = dynamic(() => import('@/components/dashboard/HeroWidget'), { ssr: false })
const QuoteWidget = dynamic(() => import('@/components/dashboard/QuoteWidget'), { ssr: false })
const HabitsWidget = dynamic(() => import('@/components/dashboard/HabitsWidget'), { ssr: false })
const TodayScheduleWidget = dynamic(() => import('@/components/dashboard/TodayScheduleWidget'), { ssr: false })
const PriorityTodosWidget = dynamic(() => import('@/components/dashboard/PriorityTodosWidget'), { ssr: false })

const GRID_CONFIG = {
  cols: 12,
  rowHeight: 72,
  margin: [12, 12] as [number, number],
  containerPadding: [0, 0] as [number, number],
  maxRows: Infinity,
}

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'hero',     x: 0, y: 0, w: 7, h: 3, minW: 4, minH: 2 },
  { i: 'quote',    x: 7, y: 0, w: 5, h: 3, minW: 3, minH: 2 },
  { i: 'schedule', x: 0, y: 3, w: 4, h: 6, minW: 3, minH: 3 },
  { i: 'habits',   x: 4, y: 3, w: 4, h: 6, minW: 2, minH: 3 },
  { i: 'todos',    x: 8, y: 3, w: 4, h: 6, minW: 3, minH: 3 },
]


function WidgetShell({ id, children, onRemove }: { id: string; children: React.ReactNode; onRemove?: () => void }) {
  return (
    <div className="relative h-full w-full group/shell">
      {/* Drag handle strip at top */}
      <div className="drag-handle absolute inset-x-0 top-0 h-6 z-10 cursor-grab active:cursor-grabbing rounded-t-2xl" />
      {/* Resize indicator (bottom-right corner, shown on hover) */}
      <div className="absolute bottom-1.5 right-1.5 z-10 w-3 h-3 pointer-events-none opacity-0 group-hover/shell:opacity-30 transition">
        <svg viewBox="0 0 12 12" className="text-gray-400 dark:text-gray-500 fill-current">
          <path d="M12 8L8 12H12V8ZM12 4L4 12H6L12 6V4ZM12 0L0 12H2L12 2V0Z" />
        </svg>
      </div>
      {children}
    </div>
  )
}

export default function DashboardPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT)
  const [layoutLoaded, setLayoutLoaded] = useState(false)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Measure container width for GridLayout
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      setWidth(entries[0].contentRect.width)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Load saved layout from Supabase
  useEffect(() => {
    supabase.from('dashboard_layout').select('*').then(({ data }) => {
      if (data && data.length > 0) {
        const saved: LayoutItem[] = data.map(row => ({
          i: row.widget_id,
          x: row.x, y: row.y, w: row.w, h: row.h,
          minW: DEFAULT_LAYOUT.find(d => d.i === row.widget_id)?.minW,
          minH: DEFAULT_LAYOUT.find(d => d.i === row.widget_id)?.minH,
        }))
        const merged = DEFAULT_LAYOUT.map(def => saved.find(s => s.i === def.i) ?? def)
        setLayout(merged)
      }
      setLayoutLoaded(true)
    })
  }, [])

  // Debounce-save layout to Supabase
  const onLayoutChange = useCallback((newLayout: Layout) => {
    setLayout([...newLayout])
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      await Promise.all(
        [...newLayout].map(item =>
          supabase.from('dashboard_layout').upsert({
            widget_id: item.i,
            x: item.x, y: item.y, w: item.w, h: item.h,
          }, { onConflict: 'widget_id' })
        )
      )
    }, 800)
  }, [])

  if (!layoutLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-[#faf9f7] to-[#f0edf8] dark:from-gray-950 dark:to-[#1a1525]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
          <p className="text-sm text-gray-400">Loading dashboard…</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto bg-gradient-to-br from-[#faf9f7] to-[#f0edf8] dark:from-gray-950 dark:to-[#1a1525]">
      {width > 0 && (
          <GridLayout
            layout={layout as Layout}
            width={width}
            gridConfig={GRID_CONFIG}
            dragConfig={{ enabled: true, handle: '.drag-handle' }}
            resizeConfig={{ enabled: true, handles: ['se'] }}
            onLayoutChange={onLayoutChange}
          >
            <div key="hero">
              <WidgetShell id="hero">
                <HeroWidget />
              </WidgetShell>
            </div>
            <div key="quote">
              <WidgetShell id="quote">
                <QuoteWidget />
              </WidgetShell>
            </div>
            <div key="schedule">
              <WidgetShell id="schedule">
                <TodayScheduleWidget />
              </WidgetShell>
            </div>
            <div key="habits">
              <WidgetShell id="habits">
                <HabitsWidget />
              </WidgetShell>
            </div>
            <div key="todos">
              <WidgetShell id="todos">
                <PriorityTodosWidget />
              </WidgetShell>
            </div>
          </GridLayout>
      )}
    </div>
  )
}
