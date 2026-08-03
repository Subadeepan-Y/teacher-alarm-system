import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SECONDARY_PERIODS, PRIMARY_PERIODS, DAY_NAMES } from '@/lib/periods'
import { getCurrentPeriodIndex, parseTimeRange } from '@/lib/period-utils'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const structure = searchParams.get('structure') || 'secondary'
    const periods = structure === 'primary' ? PRIMARY_PERIODS : SECONDARY_PERIODS

    const supabase = await createClient()
    const today = DAY_NAMES[new Date().getDay()]

    const [slotRes, attRes] = await Promise.all([
      supabase.from('slots').select('*').eq('day', today),
      supabase.from('attendance').select('*').eq('day', today),
    ])

    const slots = (slotRes.data || []).reduce<Record<string, string>>((acc, s) => {
      acc[s.period_time] = s.subject
      return acc
    }, {} as Record<string, string>)

    const scannedPeriods = new Set((attRes.data || []).map((a) => a.period_time))

    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    const index = getCurrentPeriodIndex(periods)
    const currentPeriod = index >= 0 ? periods[index] : null
    const subject = currentPeriod && currentPeriod.type === 'period' ? (slots[currentPeriod.time] || '') : ''
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

    return NextResponse.json({
      day: today,
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
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
