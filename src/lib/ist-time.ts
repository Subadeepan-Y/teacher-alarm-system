export const SCHOOL_TZ = 'Asia/Kolkata'

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

/**
 * The school's wall-clock right now, in Asia/Kolkata. All time reasoning
 * (which class is "now", how late a teacher entered) runs on this clock, not
 * the browser's, so a visitor anywhere in the world sees the same day as the
 * device and the server.
 */
export function istClock(d: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHOOL_TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value
      return acc
    }, {})

  const hour = Number(parts.hour) % 24
  const minute = Number(parts.minute)

  return {
    weekday: parts.weekday,
    hour,
    minute,
    minutes: hour * 60 + minute,
    hhmm: `${pad(hour)}:${pad(minute)}`,
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

/** A friendly label like "Monday, 3 August" for the page header. */
export function istDateLabel(d: Date = new Date()) {
  return new Intl.DateTimeFormat('en', {
    timeZone: SCHOOL_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d)
}

/** A UTC timestamp → the HH:MM the entry was stamped, in school time. */
export function istTimeOf(iso: string): { hhmm: string; minutes: number } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { hhmm: '—', minutes: -1 }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCHOOL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value
      return acc
    }, {})
  const hour = Number(parts.hour) % 24
  const minute = Number(parts.minute)
  return { hhmm: `${pad(hour)}:${pad(minute)}`, minutes: hour * 60 + minute }
}