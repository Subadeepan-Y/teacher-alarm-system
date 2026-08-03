import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { SECONDARY_PERIODS, PRIMARY_PERIODS, DAY_NAMES } from '@/lib/periods'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const TZ = 'Asia/Kolkata'

const noStore = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache',
}

/**
 * Service-role reader so the ESP32 (which has no browser session) can mark
 * itself present, exactly like /api/status. Falls back to the anon key if
 * SUPABASE_SERVICE_ROLE_KEY is missing; the attendance table has an open
 * policy so both keys can read/write it.
 */
function getReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase credentials')
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

/** Wall clock in the school's timezone. */
function nowInTz() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value
      return acc
    }, {})
  return {
    weekday: parts.weekday,
    minute: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  }
}

/** Current period time range in IST, or null if none is running right now. */
function currentPeriodInTz(structure: 'primary' | 'secondary'): string | null {
  const periods = structure === 'primary' ? PRIMARY_PERIODS : SECONDARY_PERIODS
  const { minute } = nowInTz()
  for (const p of periods) {
    const [start, end] = p.time.split('-')
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const s = sh * 60 + sm
    const e = eh * 60 + em
    if (minute >= s && minute < e) return p.time
  }
  return null
}

/** Today's attendance records for the IST weekday. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const day = searchParams.get('day') || nowInTz().weekday

    const supabase = getReader()
    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .eq('day', day)
      .order('period_time')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: noStore })
    }
    return NextResponse.json(data ?? [], { headers: noStore })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore })
  }
}

/**
 * Mark the current period as attended. Works from the website (uid = user id)
 * or the ESP32 (uid = teacherId or "esp32"). periodTime/day are optional and
 * default to the IST current period / IST weekday, so a caller only needs to
 * send a uid.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const uid = typeof body?.uid === 'string' ? body.uid.trim() : ''
    if (!uid) {
      return NextResponse.json({ error: 'Missing uid' }, { status: 400, headers: noStore })
    }

    const structure = body.structure === 'primary' ? 'primary' : 'secondary'
    const day =
      typeof body.day === 'string' && DAY_NAMES.includes(body.day)
        ? body.day
        : nowInTz().weekday
    const periodTime =
      typeof body.periodTime === 'string' && body.periodTime
        ? body.periodTime
        : currentPeriodInTz(structure)

    const supabase = getReader()

    // Remove any previous record for the same cell so re-taps don't pile up,
    // then insert the fresh one.
    if (periodTime) {
      const { error: delErr } = await supabase
        .from('attendance')
        .delete()
        .eq('day', day)
        .eq('period_time', periodTime)
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500, headers: noStore })
      }
    }

    const { data, error } = await supabase
      .from('attendance')
      .insert({ uid, day, period_time: periodTime ?? 'unknown' })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: noStore })
    }

    return NextResponse.json(
      { success: true, record: data, day, periodTime },
      { headers: noStore },
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore })
  }
}
