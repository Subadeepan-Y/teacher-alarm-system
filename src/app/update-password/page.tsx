'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function UpdatePasswordPage() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // The recovery email links here (?code=... or #access_token=...).
  // Establish the session first, then the user may set a new password.
  useEffect(() => {
    const supabase = createClient()
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    ;(async () => {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) throw error
        }
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('This reset link is invalid or expired. Request a new one from the login page.')
        setReady(true)
      } catch (e) {
        setError((e as Error).message)
      }
    })()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setDone(true)
      setTimeout(() => router.push('/dashboard'), 1200)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm ld-card p-6">
        <p className="ld-eyebrow text-center mb-1">Account recovery</p>
        <h1 className="text-2xl font-semibold text-[var(--sea)] text-center mb-6" style={{ fontFamily: 'var(--font-ledger)', fontWeight: 400 }}>
          New Password
        </h1>

        {error && <p className="text-xs text-[var(--ember)] text-center mb-4">{error}</p>}
        {done && <p className="text-xs text-[var(--jade)] text-center mb-4">Password updated. Taking you to the dashboard…</p>}

        {ready && !done && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              className="ld-field h-11"
              type="password"
              placeholder="New password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <button type="submit" disabled={loading} className="h-11 w-full ld-btn text-sm">
              {loading ? 'Please wait...' : 'Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
