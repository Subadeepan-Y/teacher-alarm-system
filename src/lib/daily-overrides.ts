import type { SupabaseClient } from '@supabase/supabase-js'

export const SCHOOL_TZ = 'Asia/Kolkata'

export type DailyPeriod = { periodTime: string; subject: string }

export type DailyOverrideResult = {
  /** true when a daily_schedules row for `date` was found and merged */
  applied: boolean
  /** which teacher/user row was used, if any */
  source: 'tid' | 'latest' | 'none'
  /** non-null when the lookup itself failed (RLS, bad uuid, missing table...) */
  error: string | null
  date: string
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Today in the school's timezone as YYYY-MM-DD. */
export function schoolDate(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: SCHOOL_TZ })
}

function merge(slots: Record<string, string>, periods: unknown) {
  if (!Array.isArray(periods)) return
  for (const p of periods as DailyPeriod[]) {
    if (!p || typeof p.periodTime !== 'string') continue
    const subject = typeof p.subject === 'string' ? p.subject.trim() : ''
    // An empty subject in the daily override means "this period is free today",
    // so it must REMOVE the weekly value instead of being ignored.
    if (subject) slots[p.periodTime] = subject
    else delete slots[p.periodTime]
  }
}

/**
 * Overlay today's daily_schedules row on top of the weekly `slots` map.
 *
 * `slots` is mutated in place. The weekly timetable is never written to, so
 * per-day changes stay per-day.
 *
 * Lookup order:
 *   1. exact teacher id, when `teacherId` is a real UUID
 *   2. most recently reviewed override for today (single-teacher devices, or
 *      a device whose tid is unset / not a UUID / points at no row)
 */
export async function applyDailyOverrides(
  supabase: SupabaseClient,
  slots: Record<string, string>,
  opts: { teacherId?: string | null; date?: string } = {},
): Promise<DailyOverrideResult> {
  const date = opts.date ?? schoolDate()
  const tid = (opts.teacherId || '').trim()

  if (tid && UUID_RE.test(tid)) {
    const { data, error } = await supabase
      .from('daily_schedules')
      .select('periods')
      .eq('user_id', tid)
      .eq('date', date)
      .maybeSingle()

    if (error) return { applied: false, source: 'none', error: error.message, date }
    if (data?.periods) {
      merge(slots, data.periods)
      return { applied: true, source: 'tid', error: null, date }
    }
    // No row for that teacher today -> fall through to the latest-row fallback
    // instead of silently returning the untouched weekly timetable.
  }

  const { data: list, error: listErr } = await supabase
    .from('daily_schedules')
    .select('periods')
    .eq('date', date)
    .order('reviewed_at', { ascending: false })
    .limit(1)

  if (listErr) return { applied: false, source: 'none', error: listErr.message, date }

  const row = list && list.length > 0 ? list[0] : null
  if (row?.periods) {
    merge(slots, row.periods)
    return { applied: true, source: 'latest', error: null, date }
  }

  return { applied: false, source: 'none', error: null, date }
}
