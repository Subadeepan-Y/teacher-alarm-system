import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { SECONDARY_PERIODS, PRIMARY_PERIODS, DAY_NAMES } from '@/lib/periods'
import { applyDailyOverrides, schoolDate, SCHOOL_TZ } from '@/lib/daily-overrides'

// The ESP32 polls this endpoint. Without these four lines Next/Vercel is free
// to cache the GET response, which is one reason edits "never showed up".
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const TZ = SCHOOL_TZ

/**
 * Service-role read. The cookie-based auth client has no session when the
 * request comes from the ESP32, so the device would silently read nothing
 * while the browser read fine.
 *
 * NOTE: `daily_schedules` is RLS-protected per user. If SUPABASE_SERVICE_ROLE_KEY
 * is not set we fall back to the anon key, which can read `slots` (open policy)
 * but historically could NOT read `daily_schedules`. Run
 * supabase-fix-daily-schedules.sql so the fallback works too.
 */
function getReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = service || anon
  if (!url || !key) throw new Error('Missing Supabase credentials')
  return {
    client: createAdminClient(url, key, { auth: { persistSession: false } }),
    usingServiceRole: Boolean(service),
  }
}

/** Wall clock in the school's timezone, not the server's UTC. */
function nowInTz() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value
      return acc
    }, {})

  const hour = Number(parts.hour) % 24
  const minute = Number(parts.minute)
  const second = Number(parts.second)
  const pad = (n: number) => String(n).padStart(2, '0')

  return {
    weekday: parts.weekday,
    hour,
    minute,
    second,
    time: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
  }
}

export async function GET(request: Request) {
  const noStore = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    Pragma: 'no-cache',
  }

  try {
    const { searchParams } = new URL(request.url)
    const structure = searchParams.get('structure') === 'primary' ? 'primary' : 'secondary'
    const periods = structure === 'primary' ? PRIMARY_PERIODS : SECONDARY_PERIODS
    const teacherId = searchParams.get('tid') || ''

    const clock = nowInTz()
    const dayParam = searchParams.get('day')
    const today = dayParam && DAY_NAMES.includes(dayParam) ? dayParam : clock.weekday

    const dateStr = schoolDate()

    const { client: supabase, usingServiceRole } = getReader()

    // 1. Weekly master timetable (the "timetable tab" table).
    const { data, error } = await supabase.from('slots').select('*').eq('day', today)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: noStore })
    }

    const slots = (data || []).reduce<Record<string, string>>((acc, s) => {
      acc[s.period_time] = s.subject
      return acc
    }, {})

    // 2. Periods already marked present today, so the ESP can show "Present"
    //    and skip the alert instead of always flagging late.
    const { data: attData } = await supabase
      .from('attendance')
      .select('period_time')
      .eq('day', today)
    const attendance = (attData || []).map((a) => a.period_time)

    // 3. Overlay TODAY-ONLY changes from the dashboard popup. This never writes
    //    back to `slots`, so the weekly timetable stays untouched.
    const daily = await applyDailyOverrides(supabase, slots, {
      teacherId,
      date: dateStr,
    })

    const schedule = periods.map((p) => ({
      time: p.time,
      type: p.type,
      subject: slots[p.time] || null,
    }))

    return NextResponse.json(
      {
        day: today,
        serverDay: clock.weekday,
        time: clock.time,
        hour: clock.hour,
        minute: clock.minute,
        second: clock.second,
        tz: TZ,
        epoch: Math.floor(Date.now() / 1000),
        structure,
        alarm: false,
        alarm_message: null,
        updatedAt: new Date().toISOString(),
        periods: schedule,
        attendance,
        // --- diagnostics: open this URL in a browser to see why an override
        // --- did or did not reach the device.
        debug: {
          date: daily.date,
          teacherIdSent: teacherId || null,
          dailyOverrideApplied: daily.applied,
          dailyOverrideSource: daily.source,
          dailyOverrideError: daily.error,
          usingServiceRole,
        },
      },
      { headers: noStore },
    )
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500, headers: noStore },
    )
  }
}
