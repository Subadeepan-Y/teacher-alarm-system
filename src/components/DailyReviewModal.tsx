'use client'

import { useState } from 'react'

interface DailyReviewModalProps {
  periods: { time: string; type: string }[]
  baseSubjects: Record<string, string>
  onConfirm: (subjects: Record<string, string>) => void
  onSkip: () => void
}

export default function DailyReviewModal({ periods, baseSubjects, onConfirm, onSkip }: DailyReviewModalProps) {
  const [subjects, setSubjects] = useState<Record<string, string>>(baseSubjects)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="ld-card p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
        <h2 className="ld-num text-lg font-semibold text-[var(--sea)]">Review Today's Schedule</h2>
        <p className="text-sm text-[var(--mut)] mt-1 mb-4">
          Are there any changes for <span className="text-[var(--sea)]">{new Date().toLocaleDateString()}</span>?
        </p>

        <div className="space-y-2 overflow-y-auto flex-1">
          {periods.map((p) => {
            const isBreak = p.type === 'break' || p.type === 'lunch'
            return (
              <div key={p.time} className="flex items-center gap-3">
                <span className="w-24 text-xs ld-mono text-[var(--mut)] shrink-0">{p.time}</span>
                {isBreak ? (
                  <span className="text-xs text-[var(--mut)] italic">
                    {p.type === 'break' ? 'Break' : 'Lunch'}
                  </span>
                ) : (
                  <input
                    className="ld-field flex-1 px-2.5 py-1.5 text-sm"
                    value={subjects[p.time] || ''}
                    onChange={(e) => setSubjects((prev) => ({ ...prev, [p.time]: e.target.value }))}
                    placeholder="Class"
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-3 mt-6 shrink-0">
          <button
            onClick={() => onConfirm(subjects)}
            className="ld-btn flex-1 px-4 py-2 text-sm font-semibold cursor-pointer"
          >
            Save & Confirm
          </button>
          <button
            onClick={onSkip}
            className="ld-ghost px-4 py-2 text-sm cursor-pointer"
          >
            No Changes
          </button>
        </div>
      </div>
    </div>
  )
}
