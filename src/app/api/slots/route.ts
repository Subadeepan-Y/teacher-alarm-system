import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Missing Supabase server credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment (and in your hosting provider\'s env vars).',
    )
  }
  return createAdminClient(url, key)
}

/** subject === '' means "clear this cell". */
type IncomingSlot = { day: string; periodTime: string; subject: string }

function parseChanges(body: unknown): IncomingSlot[] {
  const b = (body ?? {}) as Record<string, unknown>
  const raw: unknown[] = Array.isArray(b.changes)
    ? b.changes
    : Array.isArray(b.slots)
      ? b.slots
      : [b]

  const out: IncomingSlot[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { day, periodTime, period_time, subject } = item as Record<string, unknown>
    const d = typeof day === 'string' ? day.trim() : ''
    const p =
      typeof periodTime === 'string'
        ? periodTime.trim()
        : typeof period_time === 'string'
          ? period_time.trim()
          : ''
    if (!d || !p) continue
    const s = typeof subject === 'string' ? subject.trim() : ''
    const key = `${d}\u0000${p}`
    // Last write for a given cell wins.
    if (seen.has(key)) out.splice(out.findIndex((x) => `${x.day}\u0000${x.periodTime}` === key), 1)
    seen.add(key)
    out.push({ day: d, periodTime: p, subject: s })
  }
  return out
}

/** Postgres error raised when ON CONFLICT has no matching unique index. */
const NO_UNIQUE_CONSTRAINT = '42P10'

const MISSING_INDEX_HINT =
  'The slots table has no unique index on (day, period_time). Run supabase-fix-slots.sql in the Supabase SQL editor.'

/**
 * Write one cell. Uses an upsert when the unique index exists, and falls back to
 * an explicit select + update/insert when it does not, so a half-applied schema
 * cannot silently swallow every save.
 */
async function writeSlot(admin: SupabaseClient, slot: IncomingSlot) {
  const row = {
    day: slot.day,
    period_time: slot.periodTime,
    subject: slot.subject,
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin.from('slots').upsert(row, { onConflict: 'day,period_time' })
  if (!error) return null

  if ((error as { code?: string }).code !== NO_UNIQUE_CONSTRAINT) return error.message

  console.warn(MISSING_INDEX_HINT)
  const { data: existing, error: selErr } = await admin
    .from('slots')
    .select('id')
    .eq('day', slot.day)
    .eq('period_time', slot.periodTime)
    .limit(1)
  if (selErr) return selErr.message

  if (existing && existing.length > 0) {
    const { error: updErr } = await admin.from('slots').update(row).eq('id', existing[0].id)
    return updErr ? updErr.message : null
  }
  const { error: insErr } = await admin.from('slots').insert(row)
  return insErr ? insErr.message : null
}

async function clearSlot(admin: SupabaseClient, slot: IncomingSlot) {
  const { error } = await admin
    .from('slots')
    .delete()
    .eq('day', slot.day)
    .eq('period_time', slot.periodTime)
  return error ? error.message : null
}

export async function GET() {
  try {
    const admin = getAdmin()
    const { data, error } = await admin.from('slots').select('*').order('day').order('period_time')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(
      { slots: data ?? [] },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const changes = parseChanges(body)
    if (changes.length === 0) {
      return NextResponse.json(
        { error: 'No valid slots in payload. Each entry needs a day and periodTime.' },
        { status: 400 },
      )
    }

    try {
      const supabase = await createAuthClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) console.warn('slots write without a confirmed user session')
    } catch (e) {
      console.error('Auth check failed (continuing):', e)
    }

    const admin = getAdmin()

    const written: IncomingSlot[] = []
    const cleared: IncomingSlot[] = []
    const failures: Array<{ slot: IncomingSlot; error: string }> = []

    for (const slot of changes) {
      const err = slot.subject ? await writeSlot(admin, slot) : await clearSlot(admin, slot)
      if (err) {
        failures.push({ slot, error: err })
      } else if (slot.subject) {
        written.push(slot)
      } else {
        cleared.push(slot)
      }
    }

    if (failures.length > 0) {
      // Report a failure so the client keeps the change queued and retries it
      // instead of dropping the user's input.
      return NextResponse.json(
        {
          error: failures[0].error,
          failed: failures,
          written: written.length,
          cleared: cleared.length,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, written: written.length, cleared: cleared.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
