'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Timetable', path: '/timetable' },
  { label: 'Attendance', path: '/attendance' },
  { label: 'Profile', path: '/profile' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--panel)]/90 backdrop-blur border-t border-[var(--line)]/60">
      <div className="flex">
        {navItems.map((item) => {
          const active = pathname === item.path
          return (
            <Link
              key={item.label}
              href={item.path}
              className={`flex-1 flex flex-col items-center py-2.5 text-[10px] font-medium transition-colors ${
                active
                  ? 'text-[var(--amber)]'
                  : 'text-[var(--mut)] hover:text-[var(--sea)]'
              }`}
            >
              {item.label}
              {active && <span className="mt-1 h-1 w-1 rounded-full bg-[var(--amber)]" />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
