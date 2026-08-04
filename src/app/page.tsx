'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import WifiModal from '@/components/WifiModal'

export default function Welcome() {
  const router = useRouter()
  const [wifiOpen, setWifiOpen] = useState(false)

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      {/* WiFi — the device's network settings, just like a phone */}
      <button
        onClick={() => setWifiOpen(true)}
        className="absolute top-5 right-5 flex items-center gap-2 rounded-xl border border-[var(--line)]/60 bg-[var(--panel)]/70 px-3.5 py-2.5 text-[var(--mut)] hover:text-[var(--amber)] hover:border-[var(--amber)]/40 transition-colors cursor-pointer"
        aria-label="Open WiFi settings"
        title="WiFi settings"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.07a9.5 9.5 0 0114.14 0M4.929 8.99a14.5 14.5 0 0114.142 0" />
        </svg>
        <span className="text-xs font-medium">WiFi</span>
      </button>

      <div className="text-center max-w-md">
        <p className="ld-eyebrow mb-4">Teacher Schedule System</p>
        <h1
          className="text-5xl md:text-6xl leading-none text-[var(--sea)]"
          style={{ fontFamily: 'var(--font-ledger)' }}
        >
          The school day,
          <br />
          <span className="text-[var(--amber)]">on time.</span>
        </h1>
        <p className="mt-4 text-sm text-[var(--mut)]">
          Your timetable, your attendance, and every time you step into class —
          held to account by the bell.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="ld-btn mt-8 px-8 py-3 text-sm font-semibold"
        >
          Get Started
        </button>
      </div>

      <WifiModal open={wifiOpen} onClose={() => setWifiOpen(false)} />
    </div>
  )
}