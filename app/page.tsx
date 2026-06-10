'use client'

import dynamic from 'next/dynamic'

const CalendarWidget = dynamic(() => import('@/components/widgets/CalendarWidget'), { ssr: false })
const AccountsWidget = dynamic(() => import('@/components/widgets/AccountsWidget'), { ssr: false })
const IncomeWidget = dynamic(() => import('@/components/widgets/IncomeWidget'), { ssr: false })
const TodoWidget = dynamic(() => import('@/components/widgets/TodoWidget'), { ssr: false })
const NotesWidget = dynamic(() => import('@/components/widgets/NotesWidget'), { ssr: false })
const HabitWidget = dynamic(() => import('@/components/widgets/HabitWidget'), { ssr: false })
const NetWorthWidget = dynamic(() => import('@/components/widgets/NetWorthWidget'), { ssr: false })

export default function Dashboard() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <main className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting} 👋</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {now.toLocaleDateString("en-AU", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

          {/* Row 1: Net Worth | Calendar (2-col) | Todos */}
          <div className="min-h-[160px]">
            <NetWorthWidget />
          </div>
          <div className="md:col-span-1 xl:col-span-2 min-h-[320px]">
            <CalendarWidget />
          </div>
          <div className="min-h-[320px] md:row-span-2 xl:row-span-2">
            <TodoWidget />
          </div>

          {/* Row 2: Accounts (2-col) | Income */}
          <div className="xl:col-span-2 min-h-[260px]">
            <AccountsWidget />
          </div>
          <div className="min-h-[260px]">
            <IncomeWidget />
          </div>

          {/* Row 3: Habits (3-col) | Notes */}
          <div className="md:col-span-2 xl:col-span-3 min-h-[220px]">
            <HabitWidget />
          </div>
          <div className="min-h-[220px]">
            <NotesWidget />
          </div>
        </div>
      </div>
    </main>
  );
}
