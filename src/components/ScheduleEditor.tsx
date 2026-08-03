'use client'

import { useState, useRef, useEffect } from 'react'
import { useTimetable, DAY_NAMES } from '../hooks/useTimetable'
import DayView from './DayView'

export default function ScheduleEditor() {
  const { timetable, days, periods, addSlot, editSlot, deleteSlot, addDay, removeDay, syncStatus } = useTimetable()
  const [view, setView] = useState<'grid' | 'day'>('grid')
  const [editingCell, setEditingCell] = useState<{ day: string; periodTime: string } | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [showNewDay, setShowNewDay] = useState(false)
  const [newDayName, setNewDayName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingCell) inputRef.current?.focus()
  }, [editingCell])

  function getSubject(day: string, periodTime: string) {
    return timetable.find((s) => s.day === day && s.periodTime === periodTime)?.subject
  }

  function commitCell(day: string, periodTime: string) {
    const val = editingValue.trim()
    const existing = timetable.find((s) => s.day === day && s.periodTime === periodTime)
    if (!val) {
      if (existing) deleteSlot(existing.id)
    } else if (existing) {
      editSlot(existing.id, val)
    } else {
      addSlot({ day, periodTime, subject: val })
    }
    setEditingCell(null)
    setEditingValue('')
  }

  const todayName = DAY_NAMES[new Date().getDay()]

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-zinc-800 p-0.5">
          {(['grid', 'day'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                view === v
                  ? 'bg-orange-500/15 text-orange-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {v === 'grid' ? 'Grid' : 'Day'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {syncStatus.state !== 'idle' && (
            <span className={`text-[11px] ${
              syncStatus.state === 'saving'
                ? 'text-zinc-400'
                : syncStatus.state === 'saved'
                  ? 'text-green-500'
                  : syncStatus.state === 'offline'
                    ? 'text-amber-500'
                    : 'text-red-500'
            }`}>
              {syncStatus.state === 'saving' && 'Saving…'}
              {syncStatus.state === 'saved' && 'Saved ✓'}
              {syncStatus.state === 'offline' && 'Offline — will sync later'}
              {syncStatus.state === 'error' && `Not saved (retrying): ${syncStatus.message}`}
            </span>
          )}
        {view === 'grid' && (
          <button
            onClick={() => { setShowNewDay(true); setNewDayName('') }}
            className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded transition-colors cursor-pointer"
          >
            + Day
          </button>
        )}
        </div>
      </div>

      {view === 'day' ? (
        <DayView />
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr>
              <th className="border border-zinc-800 px-3 py-2 text-left font-medium text-zinc-500 text-xs uppercase tracking-wider w-16">
                Day
              </th>
              {periods.map((period) => {
                const isFixed = period.type === 'break' || period.type === 'lunch'
                return (
                  <th
                    key={period.time}
                    className={`border border-zinc-800 px-2 py-2 text-center text-xs font-medium ${
                      isFixed ? 'text-zinc-600' : 'text-zinc-400'
                    } ${period.time === '10:40-10:50' || period.time === '12:50-1:20' || period.time === '2:40-2:50' ? 'bg-zinc-900/30' : ''}`}
                  >
                    {period.time}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d}>
                <td className={`border border-zinc-800 px-3 py-2 text-xs font-medium ${
                  d === todayName ? 'text-orange-500' : 'text-zinc-400'
                }`}>
                  {d}
                </td>
                {periods.map((period) => {
                  const isFixed = period.type === 'break' || period.type === 'lunch'
                  const fixedLabel = period.type === 'break' ? 'Break' : 'Lunch'
                  const subject = getSubject(d, period.time)
                  const isEditing = editingCell?.day === d && editingCell?.periodTime === period.time

                  if (isFixed) {
                    return (
                      <td
                        key={period.time}
                        className={`border border-zinc-800 px-2 py-3 text-center text-xs italic ${
                          period.type === 'break' ? 'text-zinc-600' : 'text-zinc-500'
                        } bg-zinc-900/20`}
                      >
                        {fixedLabel}
                      </td>
                    )
                  }

                  return (
                    <td
                      key={period.time}
                      className="border border-zinc-800 px-2 py-2 text-center cursor-pointer hover:bg-zinc-900/50 transition-colors min-w-[80px]"
                      onClick={() => {
                        setEditingCell({ day: d, periodTime: period.time })
                        setEditingValue(subject || '')
                      }}
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-white text-center outline-none focus:border-orange-500"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitCell(d, period.time)
                            if (e.key === 'Escape') { setEditingCell(null); setEditingValue('') }
                          }}
                          onBlur={() => commitCell(d, period.time)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Class"
                          autoFocus
                        />
                      ) : (
                        <span className={`text-xs ${
                          subject ? 'text-white font-medium' : 'text-zinc-700'
                        }`}>
                          {subject || 'Free'}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {showNewDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowNewDay(false)}>
          <div className="w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">New Day</h2>
              <button onClick={() => setShowNewDay(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <input
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white outline-none focus:border-orange-500 mb-4"
              placeholder="e.g. Saturday"
              value={newDayName}
              onChange={(e) => setNewDayName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { addDay(newDayName); setShowNewDay(false); setNewDayName('') }
                if (e.key === 'Escape') setShowNewDay(false)
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewDay(false)}
                className="flex-1 h-9 rounded-lg border border-zinc-700 text-sm font-medium text-zinc-400 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { addDay(newDayName); setShowNewDay(false); setNewDayName('') }}
                className="flex-1 h-9 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
