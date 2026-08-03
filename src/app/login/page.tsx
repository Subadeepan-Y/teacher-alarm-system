'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      setLoading(false)
      if (error) {
        setError(error.message)
      } else if (data.session) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setError('Check your email for the confirmation link.')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) {
        setError(error.message)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm ld-card p-6">
        <p className="ld-eyebrow text-center mb-1">{mode === 'signin' ? 'Welcome back' : 'Join the register'}</p>
        <h1 className="text-2xl font-semibold text-[var(--sea)] text-center mb-6" style={{ fontFamily: 'var(--font-ledger)', fontWeight: 400 }}>
          {mode === 'signin' ? 'Sign In' : 'Sign Up'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="ld-field h-11"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="ld-field h-11"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-xs text-[var(--ember)]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full ld-btn text-sm"
          >
            {loading
              ? 'Please wait...'
              : mode === 'signin'
                ? 'Sign In'
                : 'Sign Up'}
          </button>
        </form>

        <p className="text-xs text-[var(--mut)] text-center mt-4">
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button
                onClick={() => { setMode('signup'); setError('') }}
                className="text-[var(--amber)] hover:underline cursor-pointer"
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('signin'); setError('') }}
                className="text-[var(--amber)] hover:underline cursor-pointer"
              >
                Sign In
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
