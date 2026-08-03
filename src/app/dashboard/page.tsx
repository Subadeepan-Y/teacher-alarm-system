'use client'

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import TodaySchedule from '@/components/TodaySchedule'
import DailyReviewModal from '@/components/DailyReviewModal'
import { useDailySchedule } from '@/hooks/useDailySchedule'
import { useTimetable, DAY_NAMES } from '@/hooks/useTimetable'

export default function Dashboard() {
  const todayName = DAY_NAMES[new Date().getDay()]
  const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const { dailySubjects, loading, exists, save } = useDailySchedule(dateStr)
  const { timetable, periods } = useTimetable()
  const [showReview, setShowReview] = useState(false)

  useEffect(() => {
    if (!loading) {
      setShowReview(!exists)
    }
  }, [loading, exists])

  const baseSubjects: Record<string, string> = {}
  for (const slot of timetable) {
    if (slot.day === todayName) {
      baseSubjects[slot.periodTime] = slot.subject
    }
  }

  const activeSubjects = dailySubjects ?? baseSubjects

  function handleDailyEdit(periodTime: string, subject: string) {
    const next = { ...activeSubjects, [periodTime]: subject }
    save(next)
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-zinc-500 text-sm">Loading schedule...</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      {showReview && (
        <DailyReviewModal
          periods={periods}
          baseSubjects={baseSubjects}
          onConfirm={(edited) => {
            save(edited)
            setShowReview(false)
          }}
          onSkip={() => {
            save(baseSubjects)
            setShowReview(false)
          }}
        />
      )}
      <TodaySchedule dailySubjects={activeSubjects} onDailyEdit={handleDailyEdit} />
    </DashboardLayout>
  )
}
