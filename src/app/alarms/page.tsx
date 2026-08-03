'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useTimetable } from '@/hooks/useTimetable'
import { istClock } from '@/lib/ist-time'
import { parseTimeRange } from '@/lib/period-utils'

export default function AlarmsPage() {
  const { timetable, periods } = useTimetable()
  const [attendance, setAttendance] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(() => istClock())

  useEffect(() => {
    const load = () => {
      fetch('/api/attendance', { cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setAttendance(new Set(data.map((a: any) => a.period_time)))
          }
        })
        .catch(() => {})
    }
    load()
    const t = setInterval(load, 15000)
    const clock = setInterval(() => setNow(istClock()), 30000)
    return () => {
      clearInterval(t)
      clearInterval(clock)
    }
  }, [])

  function getSubject(periodTime: string) {
    const today = now.weekday
    return timetable.find((s) => s.day === today && s.periodTime === periodTime)?.subject
  }

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto space-y-3">
        <h2 className="ld-num text-lg font-semibold text-[var(--sea)] mb-4">{now.weekday} — Attendance</h2>

        {periods.map((period) => {
          const isFixed = period.type === 'break' || period.type === 'lunch'
          const subject = getSubject(period.time)
          const scanned = attendance.has(period.time)
          const ended = now.minutes >= parseTimeRange(period.time).end

          if (isFixed) return null

          return (
            <div
              key={period.time}
              className="flex items-center rounded-lg border border-[var(--line)] bg-[var(--panel)]/50 px-4 py-3"
            >
              <div className="w-24 shrink-0 text-xs ld-mono text-[var(--mut)]">{period.time}</div>
              <div className="flex-1 text-sm text-[var(--sea)] font-medium">{subject || <span className="text-[var(--mut)] font-normal">Free</span>}</div>
              <div className="shrink-0 text-xs">
                {!subject ? (
                  <span className="text-[var(--mut)]">—</span>
                ) : scanned ? (
                  <span className="text-[var(--jade)] flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                    Present
                  </span>
                ) : ended ? (
                  <span className="text-[var(--ember)]">Absent</span>
                ) : (
                  <span className="text-[var(--mut)]">Pending</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </DashboardLayout>
  )
}
