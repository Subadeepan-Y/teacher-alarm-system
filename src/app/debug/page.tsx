'use client'

import { useCallback, useEffect, useState } from 'react'

const KEYS = {
  timetable: 'teacher_timetable',
  pending: 'teacher_timetable_pending',
  days: 'teacher_days',
  structure: 'teacher_structure',
}

type StorageSnapshot = Record<string, string>

export default function DebugPage() {
  const [output, setOutput] = useState('')
  const [storage, setStorage] = useState<StorageSnapshot>({})

  const refreshStorage = useCallback(() => {
    const snap: StorageSnapshot = {}
    for (const [name, key] of Object.entries(KEYS)) {
      snap[name] = window.localStorage.getItem(key) ?? '(not set)'
    }
    setStorage(snap)
  }, [])

  useEffect(() => {
    refreshStorage()
    const t = setInterval(refreshStorage, 2000)
    return () => clearInterval(t)
  }, [refreshStorage])

  const append = (label: string, data: unknown) => {
    setOutput((prev) => `${prev}\n--- ${label} ---\n${JSON.stringify(data, null, 2)}\n`)
  }

  const testPost = async () => {
    const payload = { changes: [{ day: 'Mon', periodTime: '9:20-10:00', subject: 'DebugTest' }] }
    append('POST payload', payload)
    try {
      const res = await fetch('/api/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.text()
      append(`POST response (${res.status})`, { status: res.status, ok: res.ok, body })
    } catch (e) {
      append('POST threw', String(e))
    }
  }

  const testGet = async () => {
    try {
      const res = await fetch('/api/slots', { cache: 'no-store' })
      const body = await res.text()
      append(`GET response (${res.status})`, { status: res.status, ok: res.ok, body })
    } catch (e) {
      append('GET threw', String(e))
    }
  }

  const clearPending = () => {
    window.localStorage.removeItem(KEYS.pending)
    refreshStorage()
    append('Clear pending', 'removed teacher_timetable_pending')
  }

  const clearCache = () => {
    window.localStorage.removeItem(KEYS.timetable)
    window.localStorage.removeItem(KEYS.pending)
    window.localStorage.removeItem(KEYS.days)
    window.localStorage.removeItem(KEYS.structure)
    refreshStorage()
    append('Clear cache', 'removed timetable/pending/days/structure')
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono text-sm">
      <h1 className="text-lg font-bold mb-4">Slots Debug</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={testPost}
          className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded"
        >
          Test POST /api/slots
        </button>
        <button
          onClick={testGet}
          className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded"
        >
          Test GET /api/slots
        </button>
        <button
          onClick={clearPending}
          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded"
        >
          Clear pending queue
        </button>
        <button
          onClick={clearCache}
          className="px-3 py-1.5 bg-red-900 hover:bg-red-800 text-white rounded"
        >
          Clear local cache
        </button>
      </div>

      <h2 className="font-bold mb-2">Output</h2>
      <pre className="bg-zinc-900 border border-zinc-800 rounded p-3 whitespace-pre-wrap min-h-24">
        {output || '(nothing yet — click a button)'}
      </pre>

      <h2 className="font-bold mt-6 mb-2">localStorage</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3 space-y-3">
        {Object.entries(storage).map(([name, value]) => (
          <div key={name}>
            <div className="text-orange-400">{name}</div>
            <pre className="whitespace-pre-wrap break-all text-zinc-300">
              {value === '(not set)' ? value : value}
            </pre>
          </div>
        ))}
      </div>
    </main>
  )
}
