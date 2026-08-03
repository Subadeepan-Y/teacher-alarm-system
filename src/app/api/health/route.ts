import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Diagnostic endpoint: open /api/health in the browser.
 *
 * It never returns key material - only the shape of each key and the real
 * error text coming back from Supabase, so a failing save can be identified
 * without guessing.
 */

type KeyKind = 'missing' | 'legacy-jwt' | 'new-publishable' | 'new-secret' | 'unknown'

function classify(key?: string): { kind: KeyKind; length: number; role?: string; ref?: string; expired?: boolean } {
  if (!key) return { kind: 'missing', length: 0 }
  if (key.startsWith('sb_publishable_')) return { kind: 'new-publishable', length: key.length }
  if (key.startsWith('sb_secret_')) return { kind: 'new-secret', length: key.length }
  if (key.startsWith('eyJ')) {
    try {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString())
      return {
        kind: 'legacy-jwt',
        length: key.length,
        role: payload.role,
        ref: payload.ref,
        expired: payload.exp ? payload.exp * 1000 < Date.now() : undefined,
      }
    } catch {
      return { kind: 'legacy-jwt', length: key.length }
    }
  }
  return { kind: 'unknown', length: key.length }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const serviceKey = classify(service)
  const anonKey = classify(anon)

  const checks: Record<string, unknown> = {
    supabaseUrl: url ? 'set' : 'MISSING',
    anonKey,
    serviceKey,
  }

  const problems: string[] = []

  if (!url) problems.push('NEXT_PUBLIC_SUPABASE_URL is not set in this environment.')
  if (serviceKey.kind === 'missing') {
    problems.push('SUPABASE_SERVICE_ROLE_KEY is not set in this environment. Every write will fail.')
  }
  if (serviceKey.kind === 'legacy-jwt' && serviceKey.role !== 'service_role') {
    problems.push(`SUPABASE_SERVICE_ROLE_KEY has role "${serviceKey.role}", expected "service_role".`)
  }
  if (serviceKey.expired) problems.push('SUPABASE_SERVICE_ROLE_KEY is expired.')

  // Mixing key generations is the classic cause of "reads work, writes 401":
  // enabling the new publishable/secret keys can disable the legacy JWT keys.
  if (anonKey.kind === 'new-publishable' && serviceKey.kind === 'legacy-jwt') {
    problems.push(
      'Key mismatch: the anon key is a NEW-style sb_publishable_ key but the service key is a LEGACY JWT. ' +
        'If legacy API keys are disabled for this project, every server write returns 401 Invalid API key. ' +
        'Replace SUPABASE_SERVICE_ROLE_KEY with the new sb_secret_... key from Supabase > Project Settings > API Keys.',
    )
  }

  // Live round-trip against the slots table.
  if (url && service) {
    const headers = {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
    }

    try {
      const read = await fetch(`${url}/rest/v1/slots?select=day,period_time,subject&limit=5`, {
        headers,
        cache: 'no-store',
      })
      const readBody = await read.text()
      checks.readSlots = { status: read.status, ok: read.ok, body: readBody.slice(0, 400) }
      if (!read.ok) problems.push(`Reading the slots table failed with HTTP ${read.status}: ${readBody.slice(0, 200)}`)
    } catch (e) {
      checks.readSlots = { error: String(e) }
      problems.push(`Could not reach Supabase at all: ${String(e)}`)
    }

    try {
      const write = await fetch(`${url}/rest/v1/slots?on_conflict=day,period_time`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([
          { day: '__healthcheck__', period_time: '00:00-00:00', subject: 'ok', updated_at: new Date().toISOString() },
        ]),
        cache: 'no-store',
      })
      const writeBody = await write.text()
      checks.writeTest = { status: write.status, ok: write.ok, body: writeBody.slice(0, 400) }

      if (!write.ok) {
        problems.push(`Writing to the slots table failed with HTTP ${write.status}: ${writeBody.slice(0, 300)}`)
        if (writeBody.includes('42P10') || writeBody.includes('ON CONFLICT')) {
          problems.push('Missing unique index on slots(day, period_time). Run supabase-fix-slots.sql in the Supabase SQL editor.')
        }
        if (write.status === 401) {
          problems.push('401 means the service key is being rejected. Generate a fresh secret key in Supabase and update the env var.')
        }
      } else {
        await fetch(`${url}/rest/v1/slots?day=eq.__healthcheck__`, { method: 'DELETE', headers, cache: 'no-store' })
      }
    } catch (e) {
      checks.writeTest = { error: String(e) }
    }
  }

  return NextResponse.json(
    {
      ok: problems.length === 0,
      problems: problems.length > 0 ? problems : ['No problems detected. Saves should be reaching Supabase.'],
      checks,
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
