'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

const navItems = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Timetable',
    path: '/timetable',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: 'Attendance',
    path: '/attendance',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: 'Profile',
    path: '/profile',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div
      className={`hidden md:block transition-all duration-200 overflow-hidden shrink-0 ${
        open ? 'w-56' : 'w-0'
      }`}
    >
      <aside className="w-56 text-[var(--sea)] flex flex-col h-full border-r border-[var(--line)]/60 bg-[var(--panel)]/60 backdrop-blur">
        <div className="px-5 py-5 border-b border-[var(--line)]/60">
          <p className="ld-eyebrow">Teacher System</p>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.path}
              onClick={onClose}
              className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname === item.path
                  ? 'bg-[var(--amber)]/10 text-[var(--amber)]'
                  : 'text-[var(--mut)] hover:text-[var(--sea)] hover:bg-[var(--panel-2)]'
              }`}
            >
              <span className="transition-transform group-hover:translate-x-0.5">{item.icon}</span>
              {item.label}
              {pathname === item.path && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
              )}
            </Link>
          ))}
        </nav>

        <div className="border-t border-[var(--line)]/60 px-4 py-3 space-y-2">
          {user && (
            <p className="ld-mono text-[11px] text-[var(--mut)] truncate" title={user.email}>
              {user.email}
            </p>
          )}
          <button
            onClick={handleSignOut}
            className="w-full text-left text-xs text-[var(--mut)] hover:text-[var(--ember)] transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </aside>
    </div>
  )
}
