'use client'

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  DAY_NAMES,
  Structure,
  SECONDARY_PERIODS,
  PRIMARY_PERIODS,
  PERIODS_BY_STRUCTURE,
  PERIODS,
} from '@/lib/periods'
import { createClient } from '@/lib/supabase/client'

export type Slot = { id: string; day: string; periodTime: string; subject: string }

export const DEFAULT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export type { Structure }
export { DAY_NAMES, SECONDARY_PERIODS, PRIMARY_PERIODS, PERIODS_BY_STRUCTURE, PERIODS }

const TIMETABLE_KEY = 'teacher_timetable'
const PENDING_KEY = 'teacher_timetable_pending'
const DAYS_KEY = 'teacher_days'
const STRUCTURE_KEY = 'teacher_structure'

/** Debounce before pushing an edit to the backend. */
const FLUSH_DEBOUNCE_MS = 500
/** Background retry for anything that failed to save. */
const RETRY_INTERVAL_MS = 15000

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

/** Stable key for a cell. Never send this to the DB - it is client-side only. */
function cellKey(day: string, periodTime: string) {
  return `${day}\u0000${periodTime}`
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const saved = window.localStorage.getItem(key)
    return saved ? (JSON.parse(saved) as T) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / private mode - ignore */
  }
}

type ApiSlot = {
  id: string
  day: string
  period_time: string
  subject: string
  created_at?: string
  updated_at?: string
}

/** A change waiting to reach the backend. subject === '' means "delete this cell". */
type PendingChange = { day: string; periodTime: string; subject: string }

export type SyncStatus = {
  state: 'idle' | 'saving' | 'saved' | 'error' | 'offline'
  message?: string
  pending?: number
}

type TimetableStore = {
  timetable: Slot[]
  days: string[]
  periods: typeof SECONDARY_PERIODS
  structure: Structure
  setStructure: (s: Structure) => void
  addSlot: (slot: Omit<Slot, 'id'>) => void
  editSlot: (id: string, subject: string) => void
  setSlot: (day: string, periodTime: string, subject: string) => void
  deleteSlot: (id: string) => void
  addDay: (name: string) => void
  removeDay: (day: string) => void
  getSubject: (day: string, periodTime: string) => string
  hydrated: boolean
  syncStatus: SyncStatus
  retryNow: () => void
}

const TimetableContext = createContext<TimetableStore | null>(null)

/**
 * Single source of truth for the timetable.
 *
 * Previously every component that called useTimetable() got its OWN copy of the
 * state plus its own 3s timer that did a destructive "delete every row, then
 * re-insert my copy" sync. Two mounted components were therefore able to wipe
 * each other's edits, and a failed request silently dropped the edit for good.
 *
 * This store instead:
 *  - keeps one shared state for the whole app,
 *  - writes each individual cell change (never a delete-everything),
 *  - persists un-synced changes to localStorage and retries them until they land.
 */
function useTimetableStore(): TimetableStore {
  const [timetable, setTimetable] = useState<Slot[]>([])
  const [days, setDays] = useState<string[]>(DEFAULT_DAYS)
  const [structure, setStructureState] = useState<Structure>('secondary')
  const [hydrated, setHydrated] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ state: 'idle' })

  const timetableRef = useRef<Slot[]>([])
  /** key -> change that has not been confirmed by the backend yet. */
  const pendingRef = useRef<Map<string, PendingChange>>(new Map())
  const flushingRef = useRef(false)
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const storeTimetable = useCallback((slots: Slot[]) => {
    timetableRef.current = slots
    setTimetable(slots)
    saveToStorage(TIMETABLE_KEY, slots)
  }, [])

  const persistPending = useCallback(() => {
    saveToStorage(PENDING_KEY, Array.from(pendingRef.current.values()))
    return pendingRef.current.size
  }, [])

  /**
   * Push every un-synced change. Only the cells the user actually touched are
   * sent, so a stale tab can no longer erase newer data.
   */
  const flush = useCallback(async () => {
    if (flushingRef.current) return
    const changes = Array.from(pendingRef.current.values())
    if (changes.length === 0) {
      setSyncStatus((s) => (s.state === 'saving' ? { state: 'saved' } : s))
      return
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncStatus({ state: 'offline', message: 'Offline - changes saved on this device', pending: changes.length })
      return
    }

    flushingRef.current = true
    setSyncStatus({ state: 'saving', pending: changes.length })
    try {
      const res = await fetch('/api/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `Save failed (${res.status})`)

      // Only clear the changes we just confirmed; edits made while the request
      // was in flight stay queued.
      for (const change of changes) {
        const key = cellKey(change.day, change.periodTime)
        const current = pendingRef.current.get(key)
        if (current && current.subject === change.subject) pendingRef.current.delete(key)
      }
      const left = persistPending()
      setSyncStatus(left > 0 ? { state: 'saving', pending: left } : { state: 'saved' })
    } catch (e) {
      // Keep the queue intact so the retry loop can try again.
      console.error('Slots sync failed:', e)
      setSyncStatus({ state: 'error', message: (e as Error).message, pending: pendingRef.current.size })
    } finally {
      flushingRef.current = false
    }
  }, [persistPending])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      void flush()
    }, FLUSH_DEBOUNCE_MS)
  }, [flush])

  /** Record a cell change locally, then queue it for the backend. */
  const queueChange = useCallback(
    (day: string, periodTime: string, subject: string) => {
      pendingRef.current.set(cellKey(day, periodTime), { day, periodTime, subject })
      const count = persistPending()
      setSyncStatus({ state: 'saving', pending: count })
      scheduleFlush()
    },
    [persistPending, scheduleFlush],
  )

  const refreshSlots = useCallback(async () => {
    try {
      const res = await fetch('/api/slots', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `Load failed (${res.status})`)

      const byKey = new Map<string, Slot>()
      for (const s of (json.slots ?? []) as ApiSlot[]) {
        byKey.set(cellKey(s.day, s.period_time), {
          id: s.id,
          day: s.day,
          periodTime: s.period_time,
          subject: s.subject,
        })
      }

      // Un-synced local edits win over the server copy, otherwise a refresh
      // would visibly "undo" whatever has not been saved yet.
      for (const [key, change] of pendingRef.current) {
        if (!change.subject) {
          byKey.delete(key)
          continue
        }
        byKey.set(key, {
          id: byKey.get(key)?.id ?? genId(),
          day: change.day,
          periodTime: change.periodTime,
          subject: change.subject,
        })
      }

      storeTimetable(Array.from(byKey.values()))

      // The `days` column list also comes from the backend: a day that only
      // exists on the server (e.g. Sunday added later) would otherwise stay
      // invisible because the browser's cached days never learned about it.
      const serverDays = Array.from(
        new Set(((json.slots ?? []) as ApiSlot[]).map((s) => s.day)),
      ).sort((a, b) => DAY_NAMES.indexOf(a) - DAY_NAMES.indexOf(b))
      if (serverDays.length > 0) {
        setDays((prev) => {
          const next = Array.from(new Set([...prev, ...serverDays]))
          if (next.length !== prev.length) {
            saveToStorage(DAYS_KEY, next)
            return next
          }
          return prev
        })
      }

      setSyncStatus(pendingRef.current.size > 0 ? { state: 'saving', pending: pendingRef.current.size } : { state: 'idle' })
    } catch (e) {
      // Never drop the cached timetable just because the network/API failed.
      console.error('Slots load failed:', e)
      setSyncStatus({ state: 'error', message: (e as Error).message, pending: pendingRef.current.size })
    } finally {
      setHydrated(true)
    }
  }, [storeTimetable])

  // Boot: restore cache + queued changes, then reconcile with the backend.
  useEffect(() => {
    const cached = loadFromStorage<Slot[]>(TIMETABLE_KEY, [])
    timetableRef.current = cached
    setTimetable(cached)
    setDays(loadFromStorage<string[]>(DAYS_KEY, DEFAULT_DAYS))
    setStructureState(loadFromStorage<Structure>(STRUCTURE_KEY, 'secondary'))

    const queued = loadFromStorage<PendingChange[]>(PENDING_KEY, [])
    pendingRef.current = new Map(queued.map((c) => [cellKey(c.day, c.periodTime), c]))

    void refreshSlots().then(() => {
      if (pendingRef.current.size > 0) void flush()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Retry anything still queued: on a timer, when the tab regains focus, and
  // when the connection comes back.
  useEffect(() => {
    const retry = () => {
      if (pendingRef.current.size > 0) void flush()
    }
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') retry()
    }, RETRY_INTERVAL_MS)
    window.addEventListener('online', retry)
    window.addEventListener('focus', retry)

    // Last-ditch attempt to save on close so a fast refresh cannot lose an edit.
    const onHide = () => {
      const changes = Array.from(pendingRef.current.values())
      if (changes.length === 0) return
      try {
        navigator.sendBeacon?.(
          '/api/slots',
          new Blob([JSON.stringify({ changes })], { type: 'application/json' }),
        )
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('pagehide', onHide)

    return () => {
      clearInterval(interval)
      window.removeEventListener('online', retry)
      window.removeEventListener('focus', retry)
      window.removeEventListener('pagehide', onHide)
    }
  }, [flush])

  /**
   * Live refresh from the backend.
   *
   * THE MISSING HALF OF THE SYNC: refreshSlots() only ever ran once, on mount.
   * The 15s timer above calls retry(), which just re-sends OUTGOING edits - it
   * never re-reads the table, and there was no realtime subscription on the web
   * side at all. So an edit made on the ESP32 reached Supabase correctly but the
   * browser had no way of ever hearing about it without a manual reload.
   */
  useEffect(() => {
    let disposed = false
    const pull = () => {
      if (disposed) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void refreshSlots()
    }

    // 1. Supabase realtime - near instant, provided `slots` is in the
    //    supabase_realtime publication (see supabase-enable-realtime.sql).
    let channel: { unsubscribe: () => void } | null = null
    try {
      const supabase = createClient()
      channel = supabase
        .channel('slots-web')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => pull())
        .subscribe()
    } catch (e) {
      console.error('Realtime subscribe failed, relying on polling:', e)
    }

    // 2. Polling fallback, so the UI still converges if realtime is off.
    const poll = setInterval(pull, 10000)
    window.addEventListener('focus', pull)
    window.addEventListener('online', pull)
    document.addEventListener('visibilitychange', pull)

    return () => {
      disposed = true
      clearInterval(poll)
      window.removeEventListener('focus', pull)
      window.removeEventListener('online', pull)
      document.removeEventListener('visibilitychange', pull)
      if (channel) channel.unsubscribe()
    }
  }, [refreshSlots])

  const saveDays = useCallback((nextDays: string[]) => {
    setDays(nextDays)
    saveToStorage(DAYS_KEY, nextDays)
  }, [])

  /** Create/update/clear a cell by day + period. This is the primary API. */
  const setSlot = useCallback(
    (day: string, periodTime: string, rawSubject: string) => {
      const subject = rawSubject.trim()
      const key = cellKey(day, periodTime)
      const existing = timetableRef.current.find((s) => cellKey(s.day, s.periodTime) === key)

      if (!subject) {
        if (!existing) return
        storeTimetable(timetableRef.current.filter((s) => cellKey(s.day, s.periodTime) !== key))
      } else if (existing) {
        if (existing.subject === subject) return
        storeTimetable(
          timetableRef.current.map((s) =>
            cellKey(s.day, s.periodTime) === key ? { ...s, subject } : s,
          ),
        )
      } else {
        storeTimetable([...timetableRef.current, { id: genId(), day, periodTime, subject }])
      }

      queueChange(day, periodTime, subject)
    },
    [queueChange, storeTimetable],
  )

  const addSlot = useCallback(
    (slot: Omit<Slot, 'id'>) => setSlot(slot.day, slot.periodTime, slot.subject),
    [setSlot],
  )

  const editSlot = useCallback(
    (id: string, subject: string) => {
      const slot = timetableRef.current.find((s) => s.id === id)
      if (!slot) return
      setSlot(slot.day, slot.periodTime, subject)
    },
    [setSlot],
  )

  const deleteSlot = useCallback(
    (id: string) => {
      const slot = timetableRef.current.find((s) => s.id === id)
      if (!slot) return
      setSlot(slot.day, slot.periodTime, '')
    },
    [setSlot],
  )

  const addDay = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed || days.includes(trimmed)) return
      saveDays([...days, trimmed])
    },
    [days, saveDays],
  )

  const removeDay = useCallback(
    (day: string) => {
      saveDays(days.filter((d) => d !== day))
      for (const slot of timetableRef.current.filter((s) => s.day === day)) {
        queueChange(slot.day, slot.periodTime, '')
      }
      storeTimetable(timetableRef.current.filter((s) => s.day !== day))
    },
    [days, queueChange, saveDays, storeTimetable],
  )

  const getSubject = useCallback(
    (day: string, periodTime: string) =>
      timetable.find((s) => s.day === day && s.periodTime === periodTime)?.subject ?? '',
    [timetable],
  )

  const setStructure = useCallback((nextStructure: Structure) => {
    setStructureState(nextStructure)
    saveToStorage(STRUCTURE_KEY, nextStructure)
    void fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structure: nextStructure }),
    }).catch((e) => console.error('Structure sync failed:', e))
  }, [])

  const retryNow = useCallback(() => {
    void flush()
  }, [flush])

  const periods = PERIODS_BY_STRUCTURE[structure]

  return useMemo(
    () => ({
      timetable,
      days,
      periods,
      structure,
      setStructure,
      addSlot,
      editSlot,
      setSlot,
      deleteSlot,
      addDay,
      removeDay,
      getSubject,
      hydrated,
      syncStatus,
      retryNow,
    }),
    [
      timetable,
      days,
      periods,
      structure,
      setStructure,
      addSlot,
      editSlot,
      setSlot,
      deleteSlot,
      addDay,
      removeDay,
      getSubject,
      hydrated,
      syncStatus,
      retryNow,
    ],
  )
}

export function TimetableProvider({ children }: { children: ReactNode }) {
  const store = useTimetableStore()
  return createElement(TimetableContext.Provider, { value: store }, children)
}

export function useTimetable(): TimetableStore {
  const ctx = useContext(TimetableContext)
  if (!ctx) {
    throw new Error('useTimetable must be used inside <TimetableProvider>. Add it in src/app/layout.tsx.')
  }
  return ctx
}