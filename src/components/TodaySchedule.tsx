'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useTimetable, DAY_NAMES } from '../hooks/useTimetable'
import { getCurrentPeriodIndex, parseTimeRange } from '@/lib/period-utils'
import { createClient } from '@/lib/supabase/client'

function fmt(n: number) { return n.toString().padStart(2, '0') }

interface TodayScheduleProps {
  dailySubjects?: Record<string, string> | null
  onDailyEdit?: (periodTime: string, subject: string) => void
}

export default function TodaySchedule({ dailySubjects, onDailyEdit }: TodayScheduleProps) {
  const { timetable, periods, addSlot, editSlot, deleteSlot } = useTimetable()
  const today = DAY_NAMES[new Date().getDay()]
  const [editingCell, setEditingCell] = useState<{ periodTime: string } | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [now, setNow] = useState(new Date())
  const inputRef = useRef<HTMLInputElement>(null)

  // Periods already marked present today (server-side, shared with the ESP32).
  const [attendanceSet, setAttendanceSet] = useState<Set<string>>(new Set())
  const [marking, setMarking] = useState(false)
  // Alert is dismissed after 10s or when the user closes it.
  const [alertHidden, setAlertHidden] = useState(false)

  const refreshAttendance = useCallback(() => {
    fetch(`/api/attendance?day=${today}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setAttendanceSet(new Set(data.map((a: { period_time: string }) => a.period_time)))
        }
      })
      .catch(() => {})
  }, [today])

  useEffect(() => {
    refreshAttendance()
    const t = setInterval(refreshAttendance, 15000)
    return () => clearInterval(t)
  }, [refreshAttendance])

  useEffect(() => {
    if (editingCell) inputRef.current?.focus()
  }, [editingCell])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const currentIndex = getCurrentPeriodIndex(periods)
  const currentPeriod = currentIndex >= 0 ? periods[currentIndex] : null
  const currentSubject = currentPeriod && currentPeriod.type === 'period'
    ? (dailySubjects?.[currentPeriod.time] || timetable.find((s) => s.day === today && s.periodTime === currentPeriod.time)?.subject || '')
    : ''

  // 12-hour clock
  const h12 = ((now.getHours() + 11) % 12) + 1
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM'

  const present = currentPeriod ? attendanceSet.has(currentPeriod.time) : false

  // Escalation - skipped entirely once the teacher marks "I have entered".
  const minsElapsed = currentPeriod && currentPeriod.type === 'period' && currentSubject && !present
    ? now.getHours() * 60 + now.getMinutes() - parseTimeRange(currentPeriod.time).start
    : -1

  let alarmLevel: 'none' | 'active' | 'late' | 'escalated' = 'none'
  if (currentPeriod && currentPeriod.type === 'period' && currentSubject && !present) {
    if (minsElapsed >= 10) alarmLevel = 'escalated'
    else if (minsElapsed >= 5) alarmLevel = 'late'
    else if (minsElapsed >= 0) alarmLevel = 'active'
  }

  // Quick-stats inputs
  const classCount = periods.filter((p) => p.type === 'period' && getSubject(p.time)).length
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nextUp = periods
    .filter((p) => p.type === 'period' && getSubject(p.time) && nowMin < parseTimeRange(p.time).start)
    .sort((a, b) => parseTimeRange(a.time).start - parseTimeRange(b.time).start)[0]
  const nextLabel = nextUp
    ? `${nextUp.time} · ${getSubject(nextUp.time)}`
    : currentSubject
      ? currentSubject
      : '—'

  const statusInfo = present
    ? { label: 'On track', tone: 'var(--jade)' }
    : alarmLevel === 'escalated'
      ? { label: 'Missed', tone: 'var(--ember)' }
      : alarmLevel === 'late'
        ? { label: 'Late', tone: 'var(--ember)' }
        : currentPeriod?.type === 'period' && currentSubject
          ? { label: 'In class', tone: 'var(--amber)' }
          : nextUp
            ? { label: 'On track', tone: 'var(--jade)' }
            : { label: 'Free period', tone: 'var(--mut)' }

  const periodProgress = currentPeriod && currentPeriod.type === 'period'
    ? Math.max(0, Math.min(100, ((nowMin - parseTimeRange(currentPeriod.time).start) / Math.max(1, parseTimeRange(currentPeriod.time).end - parseTimeRange(currentPeriod.time).start)) * 100))
    : 0
  const remainingM = currentPeriod && currentPeriod.type === 'period'
    ? Math.max(0, parseTimeRange(currentPeriod.time).end - nowMin)
    : 0

  // The alert banner lives for 10 seconds max and can be closed manually.
  useEffect(() => {
    if (alarmLevel === 'none') return
    setAlertHidden(false)
    const t = setTimeout(() => setAlertHidden(true), 10000)
    return () => clearTimeout(t)
  }, [alarmLevel])

  function getSubject(periodTime: string) {
    if (dailySubjects) return dailySubjects[periodTime] || ''
    return timetable.find((s) => s.day === today && s.periodTime === periodTime)?.subject || ''
  }

  function commitCell(periodTime: string) {
    const val = editingValue.trim()
    if (onDailyEdit) {
      onDailyEdit(periodTime, val)
    } else {
      const existing = timetable.find((s) => s.day === today && s.periodTime === periodTime)
      if (!val) {
        if (existing) deleteSlot(existing.id)
      } else if (existing) {
        editSlot(existing.id, val)
      } else {
        addSlot({ day: today, periodTime, subject: val })
      }
    }
    setEditingCell(null)
    setEditingValue('')
  }

  async function markPresent() {
    if (!currentPeriod || marking) return
    setMarking(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user?.id || 'web', day: today, periodTime: currentPeriod.time }),
      })
      if (res.ok) {
        setAttendanceSet((prev) => new Set(prev).add(currentPeriod.time))
        setAlertHidden(true)
      }
    } catch { /* ignore */ } finally {
      setMarking(false)
    }
  }

  function isCurrentTime(periodTime: string) {
    const m = now.getHours() * 60 + now.getMinutes()
    const { start, end } = parseTimeRange(periodTime)
    return m >= start && m < end
  }

  const isFixed = (t: string) => t === 'break' || t === 'lunch'

  const alertColors: Record<string, string> = {
    active: 'border-[var(--amber)]/40 bg-[var(--amber)]/10 text-[var(--amber)]',
    late: 'border-[var(--ember)]/40 bg-[var(--ember)]/10 text-[var(--ember)]',
    escalated: 'border-[var(--ember)]/60 bg-[var(--ember)]/15 text-[var(--ember)]',
  }

  const alertLabels: Record<string, string> = {
    active: 'Now',
    late: 'Late',
    escalated: 'Escalated',
  }

  return (
    <div>
      {/* Header: title + digital clock widget */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--sea)]">Today — {today}</h2>
          <p className="text-xs text-[var(--mut)]">Attendance register · school time (IST)</p>
        </div>
        <div className="ld-card flex flex-col gap-1.5 px-4 py-2.5">
          <div className="font-mono text-2xl leading-none text-[var(--amber)] tabular-nums">
            {h12}:{fmt(now.getMinutes())}:{fmt(now.getSeconds())} <span className="text-xs text-[var(--mut)]">{ampm}</span>
          </div>
          {currentPeriod && currentPeriod.type === 'period' && currentSubject ? (
            <div className="flex items-center gap-2">
              <span className="ld-mono text-[10px] uppercase tracking-wider text-[var(--mut)]">{currentPeriod.time}</span>
              <div className="h-1 w-24 overflow-hidden rounded bg-[var(--panel-2)]">
                <div className="h-full rounded bg-[var(--amber)]" style={{ width: `${periodProgress}%` }} />
              </div>
              <span className="ld-mono text-[10px] text-[var(--mut)]">{remainingM}m left</span>
            </div>
          ) : (
            <span className="text-[10px] uppercase tracking-wider text-[var(--mut)]">
              {nextUp ? `Next · ${getSubject(nextUp.time)}` : 'No class right now'}
            </span>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="ld-card px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--mut)]">Classes today</p>
          <p className="mt-0.5 ld-num text-2xl text-[var(--sea)]">{classCount}</p>
        </div>
        <div className="ld-card px-4 py-3 min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--mut)]">{currentPeriod?.type === 'period' && currentSubject ? 'Now' : 'Next up'}</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-[var(--sea)]">{nextLabel}</p>
        </div>
        <div className="ld-card px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--mut)]">Status</p>
          <p className="mt-0.5 ld-pill" style={{ color: statusInfo.tone, background: `color-mix(in srgb, ${statusInfo.tone} 14%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${statusInfo.tone} 28%, transparent)` }}>
            {statusInfo.label}
          </p>
        </div>
      </div>

      {/* Present confirmation (after teacher marks "I have entered") */}
      {present && currentPeriod && currentPeriod.type === 'period' && (
        <div className="mb-4 rounded-lg border border-[var(--jade)]/40 bg-[var(--jade)]/10 px-4 py-2.5 text-sm text-center text-[var(--jade)]">
          <span className="font-semibold">{currentSubject}</span>
          &nbsp;&mdash;&nbsp;{currentPeriod.time}
          <span className="block text-xs mt-0.5 opacity-80">Teacher present — attendance recorded</span>
        </div>
      )}

      {/* Escalation alert (auto-hides after 10s, closable) */}
      {alarmLevel !== 'none' && !alertHidden && (
        <div className={`mb-4 rounded-lg border px-4 py-2.5 text-sm text-center ${alertColors[alarmLevel]}`}>
          <span className="font-semibold">{alertLabels[alarmLevel]}:</span>
          {' '}{currentSubject} &mdash; {currentPeriod?.time}
          {alarmLevel === 'late' && <span className="block text-xs mt-0.5 opacity-80">Teacher hasn&apos;t marked present yet</span>}
          {alarmLevel === 'escalated' && <span className="block text-xs mt-0.5 opacity-80">Office has been notified</span>}
          <div className="mt-2 flex items-center justify-center gap-2">
            <button
              onClick={markPresent}
              disabled={marking}
              className="rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              style={{ background: 'var(--jade)', color: 'var(--ink)' }}
            >
              {marking ? 'Marking...' : "I have entered"}
            </button>
            <button
              onClick={() => setAlertHidden(true)}
              className="ld-ghost px-4 py-1.5 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Active period info */}
      {currentSubject && alarmLevel === 'active' && !present && (
        <div className="mb-4 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-4 py-2.5 text-sm text-[var(--amber)] text-center">
          <span className="font-semibold">{currentSubject}</span>
          &nbsp;&mdash;&nbsp;{currentPeriod?.time}
        </div>
      )}

      {/* Horizontal grid — the day register in a glass card */}
      <div className="ld-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)]/60 px-4 md:px-5 py-3">
          <h3 className="text-sm font-semibold text-[var(--sea)]">Today&apos;s timetable</h3>
          <span className="ld-pill ld-pill--mut">Tap a cell to edit</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[900px]">
            <thead>
              <tr>
                <th className="border border-[var(--line)] px-3 py-2 text-left font-medium text-[var(--mut)] text-xs uppercase tracking-wider w-16">Day</th>
                {periods.map((period) => {
                  const fixed = isFixed(period.type)
                  return (
                    <th
                      key={period.time}
                      className={`border border-[var(--line)] px-2 py-2 text-center text-xs font-medium ${
                        fixed ? 'text-[var(--mut)]' : 'text-[var(--mut)]'
                      } ${isCurrentTime(period.time) ? 'bg-[var(--amber)]/15' : fixed ? 'bg-[var(--panel-2)]/40' : ''}`}
                    >
                      {period.time}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={`border border-[var(--line)] px-3 py-2 text-xs font-medium ${
                  present ? 'text-[var(--jade)]' : alarmLevel === 'escalated' ? 'text-[var(--ember)]' : alarmLevel === 'late' ? 'text-[var(--ember)]' : 'text-[var(--amber)]'
                }`}>
                  {today}
                </td>
                {periods.map((period) => {
                  const fixed = isFixed(period.type)
                  const fixedLabel = period.type === 'break' ? 'Break' : 'Lunch'
                  const subject = getSubject(period.time)
                  const editing = editingCell?.periodTime === period.time
                  const active = isCurrentTime(period.time)
                  const isPresent = attendanceSet.has(period.time)

                  if (fixed) {
                    return (
                      <td key={period.time} className={`border border-[var(--line)] px-2 py-3 text-center bg-[var(--panel-2)]/30 ${active ? 'ld-glow' : ''}`}>
                        <span className="ld-pill ld-pill--mut">{fixedLabel}</span>
                      </td>
                    )
                  }

                  return (
                    <td
                      key={period.time}
                      className={`border border-[var(--line)] px-2 py-2 text-center cursor-pointer hover:bg-[var(--panel-2)]/60 transition-colors min-w-[80px] ${
                        isPresent ? 'bg-[var(--jade)]/10' :
                        active && alarmLevel === 'escalated' ? 'bg-[var(--ember)]/15' :
                        active && alarmLevel === 'late' ? 'bg-[var(--ember)]/10' :
                        active ? 'bg-[var(--amber)]/10' : ''
                      } ${active ? 'ld-glow' : ''}`}
                      onClick={() => {
                        setEditingCell({ periodTime: period.time })
                        setEditingValue(subject || '')
                      }}
                    >
                    {editing ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-[var(--amber)] bg-[var(--panel-2)] px-1.5 py-1 text-xs text-[var(--sea)] text-center outline-none"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitCell(period.time)
                          if (e.key === 'Escape') { setEditingCell(null); setEditingValue('') }
                        }}
                        onBlur={() => commitCell(period.time)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Class"
                        autoFocus
                      />
                    ) : (
                      <span className="flex flex-col items-center gap-1">
                        <span className={`text-xs ${subject ? 'text-[var(--sea)] font-medium' : 'text-[var(--mut)]/60 italic'}`}>
                          {subject || 'Free'}
                        </span>
                        {isPresent && <span className="ld-pill ld-pill--jade">Present</span>}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
