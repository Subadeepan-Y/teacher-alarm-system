import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { SECONDARY_PERIODS, PRIMARY_PERIODS, DAY_NAMES } from '@/lib/periods'

// The ESP32 polls this endpoint. Without these three lines Next/Vercel is free
// to cache the GET response, which is one reason edits "never showed up".
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const TZ = 'Asia/Kolkata'

/**
 * Service-role read. The old version used the cookie-based auth client, which
 * has no session when the request comes from the ESP32, so the device could
 * silently read nothing while the browser read fine.
 */
function getReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase credentials')
  return createAdminClient(url, key, { auth: { persistSession: false } })
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

  // hourCycle h23 can emit "24" for midnight; normalise it.
  const hour = Number(parts.hour) % 24
  const minute = Number(parts.minute)
  const second = Number(parts.second)
  const pad = (n: number) => String(n).padStart(2, '0')

  return {
    weekday: parts.weekday, // Sun..Sat, matches DAY_NAMES
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
    const today =
      dayParam && DAY_NAMES.includes(dayParam) ? dayParam : clock.weekday

    // Current date in school timezone (YYYY-MM-DD)
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ })

    const supabase = getReader()
    const { data, error } = await supabase.from('slots').select('*').eq('day', today)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: noStore })
    }

    const slots = (data || []).reduce<Record<string, string>>((acc, s) => {
      acc[s.period_time] = s.subject
      return acc
    }, {})

    // Merge daily overrides. Prefer the teacherId if sent; otherwise fall back
    // to the most recently saved daily schedule for today so a single-teacher
    // setup works without configuring a teacher ID on the device.
    if (teacherId) {
      const { data: dailyData } = await supabase
        .from('daily_schedules')
        .select('periods')
        .eq('user_id', teacherId)
        .eq('date', dateStr)
        .maybeSingle()

      if (dailyData && dailyData.periods) {
        for (const p of dailyData.periods as { periodTime: string; subject: string }[]) {
          if (p.subject) {
            slots[p.periodTime] = p.subject
          } else {
            delete slots[p.periodTime]
          }
        }
      }
    } else {
      const { data: dailyList } = await supabase
        .from('daily_schedules')
        .select('periods')
        .eq('date', dateStr)
        .order('reviewed_at', { ascending: false })
        .limit(1)

      const dailyData = dailyList && dailyList.length > 0 ? dailyList[0] : null
      if (dailyData && dailyData.periods) {
        for (const p of dailyData.periods as { periodTime: string; subject: string }[]) {
          if (p.subject) {
            slots[p.periodTime] = p.subject
          } else {
            delete slots[p.periodTime]
          }
        }
      }
    }

    const schedule = periods.map((p) => ({
      time: p.time,
      type: p.type,
      subject: slots[p.time] || null,
    }))

    return NextResponse.json(
      {
        day: today,
        serverDay: clock.weekday,
        time: clock.time, // always HH:MM:SS, zero padded
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