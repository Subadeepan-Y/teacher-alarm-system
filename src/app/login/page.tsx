'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSent(false)
    setLoading(true)

    const supabase = createClient()
    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/update-password`,
      })
      setLoading(false)
      if (error) {
        setError(error.message)
      } else {
        setSent(true)
      }
      return
    }
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
        <p className="ld-eyebrow text-center mb-1">{mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Join the register' : 'Account recovery'}</p>
        <h1 className="text-2xl font-semibold text-[var(--sea)] text-center mb-6" style={{ fontFamily: 'var(--font-ledger)', fontWeight: 400 }}>
          {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : 'Reset Password'}
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
          {mode !== 'forgot' && (
            <input
              className="ld-field h-11"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
          {error && <p className="text-xs text-[var(--ember)]">{error}</p>}
          {sent && <p className="text-xs text-[var(--jade)]">Reset link sent. Check your email, then open it on this device.</p>}
          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full ld-btn text-sm"
          >
            {loading
              ? 'Please wait...'
              : mode === 'signin'
                ? 'Sign In'
                : mode === 'signup'
                  ? 'Sign Up'
                  : 'Send Reset Link'}
          </button>
        </form>

        <p className="text-xs text-[var(--mut)] text-center mt-4">
          {mode === 'signin' ? (
            <>
              <button
                onClick={() => { setMode('forgot'); setError(''); setSent(false) }}
                className="text-[var(--amber)] hover:underline cursor-pointer"
              >
                Forgot password?
              </button>
              <span className="mx-2">·</span>
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
              Remembered it?{' '}
              <button
                onClick={() => { setMode('signin'); setError(''); setSent(false) }}
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
