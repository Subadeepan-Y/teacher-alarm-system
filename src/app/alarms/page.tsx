'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useTimetable, DAY_NAMES } from '@/hooks/useTimetable'

export default function AlarmsPage() {
  const { timetable, periods } = useTimetable()
  const today = DAY_NAMES[new Date().getDay()]
  const [attendance, setAttendance] = useState<Set<string>>(new Set())

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
    return () => clearInterval(t)
  }, [])

  function getSubject(periodTime: string) {
    return timetable.find((s) => s.day === today && s.periodTime === periodTime)?.subject
  }

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto space-y-3">
        <h2 className="text-lg font-semibold text-white mb-4">{today} — Attendance</h2>

        {periods.map((period) => {
          const isFixed = period.type === 'break' || period.type === 'lunch'
          const subject = getSubject(period.time)
          const scanned = attendance.has(period.time)

          if (isFixed) return null

          return (
            <div
              key={period.time}
              className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
            >
              <div className="w-24 shrink-0 text-xs font-mono text-zinc-500">{period.time}</div>
              <div className="flex-1 text-sm text-white font-medium">{subject || <span className="text-zinc-700 font-normal">Free</span>}</div>
              <div className="shrink-0 text-xs">
                {!subject ? (
                  <span className="text-zinc-700">—</span>
                ) : scanned ? (
                  <span className="text-green-500 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                    Present
                  </span>
                ) : (
                  <span className="text-zinc-600">Pending</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </DashboardLayout>
  )
}
