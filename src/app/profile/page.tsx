'use client'

import { useEffect, useState } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { useTimetable, type Structure } from '@/hooks/useTimetable'
import { createClient } from '@/lib/supabase/client'

const options: { value: Structure; label: string; desc: string }[] = [
  { value: 'primary', label: 'Primary', desc: '8 periods — lunch at 12:10, break at 2:00' },
  { value: 'secondary', label: 'Middle-Higher Secondary', desc: '9 periods — lunch at 12:50, break at 2:40' },
]

const LS_NAME = 'teacher_name'
const LS_GRADES = 'teacher_grades'

function loadLocal(key: string, fallback = '') {
  if (typeof window === 'undefined') return fallback
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}

function saveLocal(key: string, val: string) {
  try { localStorage.setItem(key, val) } catch { /* ignore */ }
}

export default function ProfilePage() {
  const { structure, setStructure } = useTimetable()
  const [name, setName] = useState('')
  const [grades, setGrades] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(loadLocal(LS_NAME))
    setGrades(loadLocal(LS_GRADES))

    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoaded(true); return }

      const { data } = await supabase
        .from('profiles')
        .select('name, grades')
        .eq('id', user.id)
        .maybeSingle()

      if (data) {
        if (data.name) { setName(data.name); saveLocal(LS_NAME, data.name) }
        if (data.grades) { setGrades(data.grades); saveLocal(LS_GRADES, data.grades) }
      }
      setLoaded(true)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    setSaved(false)

    saveLocal(LS_NAME, name)
    saveLocal(LS_GRADES, grades)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000); return }

    const { error } = await supabase.from('profiles').upsert(
      { id: user.id, name, grades, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
    if (error) console.error('Profile save error:', error.message)

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
  }

  if (!loaded) {
    return (
      <DashboardLayout>
        <div className="text-sm text-[var(--mut)]">Loading profile...</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-md">
        <div>
          <h2 className="ld-num text-lg font-semibold text-[var(--sea)] mb-3">Teacher Info</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[var(--mut)] mb-1">Name</label>
              <input
                className="ld-field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--mut)] mb-1">Grades you handle</label>
              <input
                className="ld-field"
                value={grades}
                onChange={(e) => setGrades(e.target.value)}
                placeholder="e.g. X-XII"
              />
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="ld-btn mt-3 px-4 py-2 text-sm"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>

        <div>
          <h2 className="ld-num text-lg font-semibold text-[var(--sea)] mb-3">Timetable Structure</h2>
          <p className="text-sm text-[var(--mut)] mb-3">Choose the timetable layout that matches your school level.</p>
          <div className="flex flex-col gap-3">
            {options.map((opt) => {
              const active = structure === opt.value
              return (
                <button
                  key={opt.value}
                  onClick={() => setStructure(opt.value)}
                  className={`text-left rounded-lg border px-4 py-3 transition-colors cursor-pointer ${
                    active
                      ? 'border-[var(--amber)] bg-[var(--amber)]/10'
                      : 'border-[var(--line)] bg-[var(--panel)] hover:border-[var(--mut)]'
                  }`}
                >
                  <p className={`text-sm font-medium ${active ? 'text-[var(--amber)]' : 'text-[var(--sea)]'}`}>{opt.label}</p>
                  <p className="text-xs text-[var(--mut)] mt-0.5">{opt.desc}</p>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
