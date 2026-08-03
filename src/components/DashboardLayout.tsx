'use client'

import { useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: "Today's schedule at a glance" },
  '/timetable': { title: 'Timetable', subtitle: 'Edit your weekly schedule' },
  '/profile': { title: 'Profile', subtitle: 'Manage your preferences' },
  '/attendance': { title: 'Attendance', subtitle: 'Punctuality & entry times' },
  '/alarms': { title: 'Alarms', subtitle: 'Configure alarm settings' },
}

interface Props {
  children: ReactNode
}

export default function DashboardLayout({ children }: Props) {
  const pathname = usePathname()
  const info = pageTitles[pathname] || { title: 'Dashboard', subtitle: '' }
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="min-h-screen flex bg-transparent">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col pb-24 md:pb-0 min-w-0">
        <header className="border-b border-[var(--line)]/60 px-4 md:px-8 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="hidden md:flex shrink-0 text-[var(--mut)] hover:text-[var(--sea)] transition-colors cursor-pointer"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sidebarOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-semibold text-[var(--sea)] truncate">{info.title}</h1>
            <p className="text-xs md:text-sm text-[var(--mut)] truncate">{info.subtitle}</p>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  )
}
