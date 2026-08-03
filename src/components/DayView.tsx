'use client'

import { useState } from 'react'
import { useTimetable, DAY_NAMES } from '../hooks/useTimetable'
import { getCurrentPeriodIndex } from '@/lib/period-utils'

export default function DayView() {
  const { timetable, days, periods, addSlot, editSlot, deleteSlot } = useTimetable()
  const [selectedDay, setSelectedDay] = useState(DAY_NAMES[new Date().getDay()])
  const [editing, setEditing] = useState<{ periodTime: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  function getSubject(day: string, periodTime: string) {
    return timetable.find((s) => s.day === day && s.periodTime === periodTime)?.subject
  }

  function commit(day: string, periodTime: string) {
    const val = editValue.trim()
    const existing = timetable.find((s) => s.day === day && s.periodTime === periodTime)
    if (!val) {
      if (existing) deleteSlot(existing.id)
    } else if (existing) {
      editSlot(existing.id, val)
    } else {
      addSlot({ day, periodTime, subject: val })
    }
    setEditing(null)
    setEditValue('')
  }

  function statusLabel(period: { time: string; type: string }, day: string) {
    if (period.type === 'break') return 'Break'
    if (period.type === 'lunch') return 'Lunch'
    return getSubject(day, period.time) || 'Free'
  }

  const today = DAY_NAMES[new Date().getDay()]

  return (
    <div className="max-w-lg mx-auto">
      {/* Day selector */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {days.map((d) => {
          const active = d === selectedDay
          return (
            <button
              key={d}
              onClick={() => { setSelectedDay(d); setEditing(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-orange-500/15 text-orange-500 border border-orange-500/30'
                  : d === today
                    ? 'text-orange-400 border border-zinc-700 hover:border-zinc-600'
                    : 'text-zinc-500 border border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {d}
            </button>
          )
        })}
      </div>

      {/* Vertical period list */}
      <div className="space-y-1">
        {periods.map((period) => {
          const isFixed = period.type === 'break' || period.type === 'lunch'
          const subject = getSubject(selectedDay, period.time)
          const isEditing = editing?.periodTime === period.time

          return (
            <div
              key={period.time}
              className={`flex items-center rounded-lg border transition-colors ${
                isEditing ? 'border-orange-500/40' : 'border-zinc-800 bg-zinc-900/50'
              } ${isFixed ? '' : 'cursor-pointer hover:border-zinc-700'}`}
              onClick={() => {
                if (!isFixed && !isEditing) {
                  setEditing({ periodTime: period.time })
                  setEditValue(subject || '')
                }
              }}
            >
              <div className="w-24 shrink-0 px-3 py-2.5 text-xs font-mono text-zinc-500">
                {period.time}
              </div>
              <div className="flex-1 px-3 py-2.5 text-xs">
                {isEditing ? (
                  <input
                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white outline-none focus:border-orange-500"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit(selectedDay, period.time)
                      if (e.key === 'Escape') { setEditing(null); setEditValue('') }
                    }}
                    onBlur={() => commit(selectedDay, period.time)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Class"
                    autoFocus
                  />
                ) : (
                  <span className={
                    isFixed
                      ? 'italic text-zinc-600'
                      : subject
                        ? 'text-white font-medium'
                        : 'text-zinc-700'
                  }>
                    {statusLabel(period, selectedDay)}
                  </span>
                )}
              </div>
              <div className="w-6 shrink-0 pr-3 text-right">
                {period.type === 'period' && (
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                    subject ? 'bg-orange-500' : 'bg-zinc-700'
                  }`} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
