'use client'

import { useState, useRef, useEffect } from 'react'
import { useTimetable, DAY_NAMES } from '../hooks/useTimetable'
import { getCurrentPeriodIndex, parseTimeRange } from '@/lib/period-utils'

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

  // Escalation
  const minsElapsed = currentPeriod && currentPeriod.type === 'period' && currentSubject
    ? now.getHours() * 60 + now.getMinutes() - parseTimeRange(currentPeriod.time).start
    : -1

  let alarmLevel: 'none' | 'active' | 'late' | 'escalated' = 'none'
  if (currentPeriod && currentPeriod.type === 'period' && currentSubject) {
    if (minsElapsed >= 10) alarmLevel = 'escalated'
    else if (minsElapsed >= 5) alarmLevel = 'late'
    else if (minsElapsed >= 0) alarmLevel = 'active'
  }

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

  function isCurrentTime(periodTime: string) {
    const m = now.getHours() * 60 + now.getMinutes()
    const { start, end } = parseTimeRange(periodTime)
    return m >= start && m < end
  }

  const isFixed = (t: string) => t === 'break' || t === 'lunch'

  const alertColors: Record<string, string> = {
    active: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
    late: 'border-red-500/30 bg-red-500/10 text-red-400',
    escalated: 'border-red-600/40 bg-red-600/20 text-red-300',
  }

  const alertLabels: Record<string, string> = {
    active: 'Now',
    late: 'Late',
    escalated: 'Escalated',
  }

  return (
    <div>
      {/* Header with clock */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Today — {today}</h2>
        <div className="font-mono text-xl text-orange-500 tabular-nums">{h12}:{fmt(now.getMinutes())}:{fmt(now.getSeconds())} {ampm}</div>
      </div>

      {/* Escalation alert */}
      {alarmLevel !== 'none' && (
        <div className={`mb-4 rounded-lg border px-4 py-2.5 text-sm text-center ${alertColors[alarmLevel]}`}>
          <span className="font-semibold">{alertLabels[alarmLevel]}:</span>
          {' '}{currentSubject} &mdash; {currentPeriod?.time}
          {alarmLevel === 'late' && <span className="block text-xs mt-0.5 opacity-80">Teacher hasn&apos;t scanned RFID yet</span>}
          {alarmLevel === 'escalated' && <span className="block text-xs mt-0.5 opacity-80">Office has been notified</span>}
        </div>
      )}

      {/* Active period info */}
      {currentSubject && alarmLevel === 'active' && (
        <div className="mb-4 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-sm text-orange-400 text-center">
          <span className="font-semibold text-orange-300">{currentSubject}</span>
          &nbsp;&mdash;&nbsp;{currentPeriod?.time}
        </div>
      )}

      {/* Horizontal grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr>
              <th className="border border-zinc-800 px-3 py-2 text-left font-medium text-zinc-500 text-xs uppercase tracking-wider w-16">Day</th>
              {periods.map((period) => {
                const fixed = isFixed(period.type)
                return (
                  <th
                    key={period.time}
                    className={`border border-zinc-800 px-2 py-2 text-center text-xs font-medium ${
                      fixed ? 'text-zinc-600' : 'text-zinc-400'
                    } ${isCurrentTime(period.time) ? 'bg-orange-500/15' : fixed ? 'bg-zinc-900/30' : ''}`}
                  >
                    {period.time}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`border border-zinc-800 px-3 py-2 text-xs font-medium ${
                alarmLevel === 'escalated' ? 'text-red-500' : alarmLevel === 'late' ? 'text-red-400' : 'text-orange-500'
              }`}>
                {today}
              </td>
              {periods.map((period) => {
                const fixed = isFixed(period.type)
                const fixedLabel = period.type === 'break' ? 'Break' : 'Lunch'
                const subject = getSubject(period.time)
                const editing = editingCell?.periodTime === period.time
                const active = isCurrentTime(period.time)

                if (fixed) {
                  return (
                    <td key={period.time} className="border border-zinc-800 px-2 py-3 text-center text-xs italic text-zinc-600 bg-zinc-900/20">
                      {fixedLabel}
                    </td>
                  )
                }

                return (
                  <td
                    key={period.time}
                    className={`border border-zinc-800 px-2 py-2 text-center cursor-pointer hover:bg-zinc-900/50 transition-colors min-w-[80px] ${
                      active && alarmLevel === 'escalated' ? 'bg-red-600/15' :
                      active && alarmLevel === 'late' ? 'bg-red-500/10' :
                      active ? 'bg-orange-500/10' : ''
                    }`}
                    onClick={() => {
                      setEditingCell({ periodTime: period.time })
                      setEditingValue(subject || '')
                    }}
                  >
                    {editing ? (
                      <input
                        ref={inputRef}
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-white text-center outline-none focus:border-orange-500"
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
                      <span className={`text-xs ${subject ? 'text-white font-medium' : 'text-zinc-700'}`}>
                        {subject || 'Free'}
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
  )
}
