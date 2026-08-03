'use client'

import { useEffect, useMemo, useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useTimetable } from '@/hooks/useTimetable'
import { parseTimeRange } from '@/lib/period-utils'
import { istClock, istDateLabel, istTimeOf } from '@/lib/ist-time'

type Cell = {
  time: string
  subject: string
  fixed?: boolean
  start: number
  end: number
  status: 'scheduled' | 'now' | 'present' | 'late' | 'missed'
  entry?: string
  minsLate?: number
}

/** A school-day time string ("4:00-5:10", "12:50-1:20") resolved to minutes
 *  on a 0–1439 clock, treating sub-6 a.m. hour codes as p.m. */
function resolve(segment: string, boundary: 'start' | 'end') {
  const { start, end } = parseTimeRange(segment)
  const m = boundary === 'start' ? start : end
  return m < 360 ? m + 720 : m
}

const STATE_META = {
  present: { label: 'On time', tone: 'var(--jade)' },
  late: { label: 'Present · late', tone: 'var(--amber)' },
  missed: { label: 'Absent', tone: 'var(--ember)' },
  now: { label: 'Now', tone: 'var(--sea)' },
  scheduled: { label: 'Up next', tone: 'var(--mut)' },
} as const

export default function AttendancePage() {
  const { timetable, periods } = useTimetable()
  const [rows, setRows] = useState<any[]>([])
  const [now, setNow] = useState(() => istClock())

  const today = now.weekday
  const label = istDateLabel()

  // Attendance (full rows incl. scanned_at) + the live school clock.
  useEffect(() => {
    const load = () =>
      fetch(`/api/attendance?day=${now.weekday}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => Array.isArray(d) && setRows(d))
        .catch(() => {})
    load()
    const t = setInterval(load, 15000)
    const clock = setInterval(() => setNow(istClock()), 30000)
    return () => {
      clearInterval(t)
      clearInterval(clock)
    }
  }, [now.weekday])

  const cell = useMemo(() => {
    const byTime = new Map(rows.map((a) => [a.period_time, a]))
    const todaySlots = (timetable || []).filter((s) => s.day === today)

    const cells = periods.map((p) => {
      const fixed = p.type === 'break' || p.type === 'lunch'
      const start = resolve(p.time, 'start')
      const end = resolve(p.time, 'end')
      const subject = todaySlots.find((s) => s.periodTime === p.time)?.subject?.trim() ?? ''
      if (fixed) {
        return { time: p.time, subject: '', fixed: true, start, end, status: 'scheduled' as const }
      }
      const rec = byTime.get(p.time)
      if (rec && rec.scanned_at) {
        const { minutes, hhmm } = istTimeOf(rec.scanned_at)
        const minsLate = Math.max(0, minutes - start)
        return {
          time: p.time,
          subject,
          fixed: false,
          start,
          end,
          status: (minsLate <= 5 ? 'present' : 'late') as 'present' | 'late',
          entry: hhmm,
          minsLate: minsLate <= 5 ? 0 : minsLate,
        } as Cell
      }
      if (now.minutes >= end) {
        return { time: p.time, subject, fixed: false, start, end, status: 'missed' as const }
      }
      if (now.minutes >= start) {
        return { time: p.time, subject, fixed: false, start, end, status: 'now' as const }
      }
      return { time: p.time, subject, fixed: false, start, end, status: 'scheduled' as const }
    })
    return cells
  }, [rows, periods, timetable, today, now.minutes])

  const classes = cell.filter((c) => !c.fixed)
  const showed = classes.filter((c) => c.status === 'present' || c.status === 'late')
  const present = classes.filter((c) => c.status === 'present').length
  const late = classes.filter((c) => c.status === 'late').length
  const missed = classes.filter((c) => c.status === 'missed').length
  const ontimePct = showed.length ? Math.round((present / showed.length) * 100) : null

  const dayStart = Math.min(...cell.map((c) => c.start))
  const dayEnd = Math.max(...cell.map((c) => c.end))
  const span = Math.max(1, dayEnd - dayStart)
  const cursorPct = ((now.minutes - dayStart) / span) * 100

  return (
    <DashboardLayout>
      {/* Ledger heading */}
      <div className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--amber)]">
          Attendance ledger · {today}
        </p>
        <h1 className="mt-1 text-3xl md:text-4xl text-[var(--sea)]" style={{ fontFamily: 'var(--font-ledger)' }}>
          {label}
        </h1>
        <p className="mt-1 text-sm text-[var(--mut)]">
          Every clock below is school time (IST). Lateness counts from the moment the bell rings.
        </p>
      </div>

      {/* THE BELL-BAR — the whole day as a true-to-scale timeline */}
      <section className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 md:p-6 overflow-hidden">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-medium text-[var(--sea)]">Today&apos;s bell</h2>
          <span className="font-mono text-xs text-[var(--mut)]">
            {now.hhmm} <span className="text-[var(--amber)]">IST</span>
          </span>
        </div>

        <div className="relative">
          <div className="flex w-full">
            {cell.map((c) => {
              if (c.fixed) {
                const w = ((c.end - c.start) / span) * 100
                return (
                  <div
                    key={c.time}
                    className="relative flex h-20 shrink-0 items-end justify-center overflow-hidden border-r border-[var(--panel)] bg-[var(--panel-2)]"
                    style={{ width: `${w}%` }}
                  >
                    <span className="pb-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--mut)]">
                      {c.time.split('-')[1]}
                    </span>
                  </div>
                )
              }
              const w = ((c.end - c.start) / span) * 100
              const active = c.status === 'present' || c.status === 'late'
              const fill =
                c.status === 'present'
                  ? 'var(--jade)'
                  : c.status === 'late'
                    ? 'var(--amber)'
                    : c.status === 'missed'
                      ? 'rgba(255,91,84,0.14)'
                      : 'rgba(90,102,130,0.16)'
              const borderCol = c.status === 'now' ? 'var(--sea)' : c.status === 'missed' ? 'var(--ember)' : 'transparent'
              return (
                <div
                  key={c.time}
                  className="ledger-in relative h-20 shrink-0 border-r border-[var(--panel)]"
                  style={{
                    width: `${w}%`,
                    background: fill,
                    borderColor: borderCol,
                    transformOrigin: 'left center',
                    animation: 'ledger-fill 0.7s cubic-bezier(0.2,0.6,0.2,1) both',
                    display: active ? 'block' : undefined,
                  }}
                >
                  {active && (
                    <span
                      className="absolute inset-x-0 top-1 text-center font-mono text-sm font-semibold"
                      style={{ color: 'var(--ink)' }}
                    >
                      {c.entry}
                    </span>
                  )}
                  {c.status === 'now' && (
                    <span className="absolute inset-x-0 bottom-1 text-center text-[10px] font-semibold uppercase tracking-widest text-[var(--sea)]">
                      Now
                    </span>
                  )}
                  {c.status === 'missed' && (
                    <span className="absolute inset-x-0 top-1 text-center font-mono text-xs text-[var(--ember)]">
                      —
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* live cursor */}
          <div
            className="cursor pointer-events-none absolute -top-2 z-10"
            style={{
              left: `clamp(${cursorPct}%, 0%, 100%)`,
              transition: 'left 0.6s linear',
            }}
          >
            <div className="-translate-x-1/2 h-2.5 w-2.5 rounded-full bg-[var(--sea)] ring-4 ring-[var(--ink)]" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-[var(--mut)]">
          <span><span className="text-[var(--jade)]">■</span> on time</span>
          <span><span className="text-[var(--amber)]">■</span> present-late</span>
          <span><span className="text-[var(--ember)]">■</span> absent</span>
          <span><span>□</span> break / lunch</span>
        </div>
      </section>

      {/* Stat cluster — the register totals */}
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Attended" value={String(showed.length)} sub={`of ${classes.length} classes`} />
        <Stat
          label="On time"
          value={ontimePct === null ? '—' : `${ontimePct}%`}
          sub="of those present"
          tone={ontimePct !== null && ontimePct >= 80 ? 'var(--jade)' : ontimePct !== null ? 'var(--amber)' : 'var(--sea)'}
        />
        <Stat label="Present-late" value={String(late)} sub="after 5-minute grace" tone="var(--amber)" />
        <Stat label="Absent" value={String(missed)} sub="no entry" tone="var(--ember)" />
      </section>

      {/* Quiet per-class ledger */}
      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="border-b border-[var(--line)] px-5 py-3">
          <h2 className="text-sm font-semibold text-[var(--paper)]">Class by class</h2>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {classes.map((c) => {
            const meta = STATE_META[c.status]
            const lateWidth = c.minsLate && c.minsLate > 0 ? Math.min(100, (c.minsLate / 30) * 100) : 0
            return (
              <div key={c.time} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                <div className="w-32 shrink-0">
                  <div className="truncate text-sm font-medium text-[var(--paper)]">
                    {c.subject || 'Free'}
                  </div>
                  <div className="font-mono text-[11px] text-[var(--mut)]">{c.time}</div>
                </div>

                <div className="w-16 shrink-0">
                  <div className="font-mono text-xs">
                    {c.status === 'present' || c.status === 'late' ? (
                      <span style={{ color: meta.tone }}>{c.entry}</span>
                    ) : (
                      <span className="text-[var(--mut)]">—</span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--mut)]">entered</div>
                </div>

                {c.status === 'late' && (
                  <div className="flex min-w-28 items-center gap-2">
                    <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded bg-[var(--panel-2)]">
                      <div
                        className="bar-in h-full rounded bg-[var(--amber)]"
                        style={{ '--to': `${lateWidth}%` } as any}
                      />
                    </div>
                    <span className="font-mono text-xs text-[var(--amber)]">+{c.minsLate}m</span>
                  </div>
                )}

                {c.status === 'now' && (
                  <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--sea)]">
                    in session
                  </span>
                )}
                {c.status === 'scheduled' && (
                  <span className="font-mono text-[11px] text-[var(--mut)]">up next</span>
                )}
                {c.status === 'missed' && (
                  <span className="font-mono text-[11px] text-[var(--ember)]">absent</span>
                )}

                <span
                  className="ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{ color: meta.tone, background: `color-mix(in srgb, ${meta.tone} 14%, transparent)` }}
                >
                  {meta.label}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </DashboardLayout>
  )
}

function Stat({
  label,
  value,
  sub,
  tone = 'var(--sea)',
}: {
  label: string
  value: string
  sub: string
  tone?: string
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--mut)]">{label}</p>
      <p
        className="mt-1 text-4xl leading-none"
        style={{ color: tone, fontFamily: 'var(--font-ledger)' }}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-[var(--mut)]">{sub}</p>
    </div>
  )
}