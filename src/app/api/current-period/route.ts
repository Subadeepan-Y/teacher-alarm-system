import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { SECONDARY_PERIODS, PRIMARY_PERIODS, DAY_NAMES } from '@/lib/periods'
import { getCurrentPeriodIndex, parseTimeRange } from '@/lib/period-utils'
import { applyDailyOverrides, schoolDate } from '@/lib/daily-overrides'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function getReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase credentials')
  return createAdminClient(url, key, { auth: { persistSession: false } })
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
    const structure = searchParams.get('structure') || 'secondary'
    const periods = structure === 'primary' ? PRIMARY_PERIODS : SECONDARY_PERIODS
    const teacherId = searchParams.get('tid') || ''

    const supabase = getReader()
    const today = DAY_NAMES[new Date().getDay()]
    const dateStr = schoolDate()

    const [slotRes, attRes] = await Promise.all([
      supabase.from('slots').select('*').eq('day', today),
      supabase.from('attendance').select('*').eq('day', today),
    ])

    const slots = (slotRes.data || []).reduce<Record<string, string>>((acc, s) => {
      acc[s.period_time] = s.subject
      return acc
    }, {})

    // Same today-only overlay as /api/status, so the dashboard, this endpoint
    // and the ESP32 can never disagree about what is happening right now.
    const daily = await applyDailyOverrides(supabase, slots, { teacherId, date: dateStr })

    const scannedPeriods = new Set((attRes.data || []).map((a) => a.period_time))

    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    const index = getCurrentPeriodIndex(periods)
    const currentPeriod = index >= 0 ? periods[index] : null
    const subject =
      currentPeriod && currentPeriod.type === 'period' ? slots[currentPeriod.time] || '' : ''
    const elapsed = currentPeriod ? currentMinutes - parseTimeRange(currentPeriod.time).start : 0
    const attendanceRecorded = currentPeriod ? scannedPeriods.has(currentPeriod.time) : false

    let alarmStatus = 'ok'
    let alarmMessage = ''
    if (currentPeriod && currentPeriod.type === 'period' && subject) {
      if (attendanceRecorded) {
        alarmStatus = 'ok'
        alarmMessage = `Attendance recorded for ${subject}`
      } else if (elapsed >= 10) {
        alarmStatus = 'escalated'
        alarmMessage = `Late to ${subject} - Office notified!`
      } else if (elapsed >= 5) {
        alarmStatus = 'late'
        alarmMessage = `Late to ${subject}!`
      } else {
        alarmStatus = 'active'
        alarmMessage = `${subject} starting now`
      }
    }

    return NextResponse.json(
      {
        day: today,
        date: dateStr,
        server_time: now.toLocaleTimeString('en-US', { hour12: false }),
        period_index: index,
        period_time: currentPeriod?.time || null,
        period_type: currentPeriod?.type || null,
        subject: subject || null,
        is_active: index >= 0,
        subject_assigned: !!subject,
        elapsed_minutes: elapsed,
        attendance_recorded: attendanceRecorded,
        alarm_status: alarmStatus,
        alarm_message: alarmMessage,
        daily_override_applied: daily.applied,
        daily_override_error: daily.error,
      },
      { headers: noStore },
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore })
  }
}
