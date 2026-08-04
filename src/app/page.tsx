'use client'

import { useRouter } from 'next/navigation'

export default function Welcome() {
  const router = useRouter()

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
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
    </div>
  )
}