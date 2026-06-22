'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/finance', label: 'Finance', icon: '💰' },
  { href: '/health', label: 'Health', icon: '💪' },
  { href: '/habits', label: 'Habits', icon: '✓' },
  { href: '/notes', label: 'Notes', icon: '📝' },
  { href: '/curriculars', label: 'Curriculars', icon: '🎓' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-52 flex-shrink-0 h-screen sticky top-0 border-r border-border flex flex-col bg-sidebar">
      <div className="px-5 py-5 border-b border-border">
        <h1 className="font-semibold text-sm tracking-tight text-sidebar-foreground">My Dashboard</h1>
        <p className="text-xs text-sidebar-foreground/50 mt-0.5">
          {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
        </p>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
              }`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
