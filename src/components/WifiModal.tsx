'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type ScanRow = { id: string; ssid: string; rssi: number; encrypted: boolean; is_current: boolean }
type Control = { connected_ssid: string; status: string; result: string }

function rssiBars(rssi: number) {
  const v = Math.max(0, Math.min(4, Math.round((rssi + 95) / 12)))
  return Array.from({ length: 4 }, (_, i) => i < v)
}

function RssiIcon({ rssi }: { rssi: number }) {
  const bars = rssiBars(rssi)
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      {bars.map((on, i) => (
        <rect
          key={i}
          x={3 + i * 5}
          y={19 - i * 4}
          width="3"
          height={3 + i * 4}
          rx="1"
          fill={on ? 'currentColor' : 'none'}
          opacity={on ? 1 : 0.35}
        />
      ))}
    </svg>
  )
}

export default function WifiModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = useRef(createClient())
  const [networks, setNetworks] = useState<ScanRow[]>([])
  const [control, setControl] = useState<Control | null>(null)
  const [selected, setSelected] = useState<ScanRow | null>(null)
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [scan, ctrl] = await Promise.all([
      supabase.current.from('wifi_scan').select('id,ssid,rssi,encrypted,is_current').order('rssi', { ascending: false }),
      supabase.current.from('wifi_control').select('connected_ssid,status,result').eq('id', 1).maybeSingle(),
    ])
    if (scan.data) setNetworks(scan.data as ScanRow[])
    if (ctrl.data) setControl(ctrl.data as Control)
  }, [])

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setPassword('')
    setConnecting(false)
    setError('')
    refresh()
    const t = setInterval(refresh, 8000)
    return () => clearInterval(t)
  }, [open, refresh])

  if (!open) return null

  const currentSsid = control?.connected_ssid || ''

  async function connect() {
    if (!selected || connecting) return
    if (selected.encrypted && !password.trim()) {
      setError('Password required for this network.')
      return
    }
    setConnecting(true)
    setError('')
    const { error: err } = await supabase.current
      .from('wifi_control')
      .update({
        cmd: 'connect',
        ssid: selected.ssid,
        password: password.trim(),
        status: 'pending',
        result: '',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    if (err) {
      setError(err.message)
      setConnecting(false)
      return
    }
    // Watch for the ESP to pick it up and report the outcome.
    let attempts = 0
    const watch = setInterval(async () => {
      attempts++
      const { data } = await supabase.current
        .from('wifi_control')
        .select('cmd,status,result,connected_ssid')
        .eq('id', 1)
        .maybeSingle()
      const c = data as Control & { cmd: string } | null
      if (c && (c.status === 'applied' || c.status === 'failed') && c.cmd === 'idle') {
        clearInterval(watch)
        setConnecting(false)
        if (c.status === 'failed') setError(c.result || 'Could not join that network.')
        else {
          setSelected(null)
          setPassword('')
          refresh()
        }
      } else if (attempts > 30) {
        clearInterval(watch)
        setConnecting(false)
        setError('Timed out waiting for the device. It may be offline.')
      }
    }, 1500)
  }

  function onPick(net: ScanRow) {
    if (connecting) return
    setError('')
    setSelected(net)
    setPassword('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="ld-card w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--line)]/60 px-5 py-4">
          <svg className="w-5 h-5 text-[var(--amber)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.07a9.5 9.5 0 0114.14 0M4.929 8.99a14.5 14.5 0 0114.142 0" />
          </svg>
          <div className="min-w-0 flex-1">
            <h2 className="ld-num text-base font-semibold text-[var(--sea)]">WiFi</h2>
            {currentSsid ? (
              <p className="ld-mono text-[11px] text-[var(--jade)] truncate">Connected · {currentSsid}</p>
            ) : (
              <p className="ld-mono text-[11px] text-[var(--mut)]">No connection</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[var(--mut)] hover:text-[var(--sea)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* List or connect panel */}
        <div className="overflow-y-auto p-3 space-y-1.5">
          {!selected ? (
            networks.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--mut)]">
                {connecting ? 'Connecting…' : 'Scanning… no networks reported yet. The device reports nearby networks while it is online.'}
              </p>
            ) : (
              networks.map((n) => {
                const isCurrent = n.ssid === currentSsid
                return (
                  <button
                    key={n.id}
                    onClick={() => onPick(n)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-[var(--jade)]/10 text-[var(--sea)]'
                        : 'bg-[var(--panel-2)]/60 hover:bg-[var(--panel-2)] text-[var(--sea)]'
                    }`}
                  >
                    <RssiIcon rssi={n.rssi} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.ssid}</span>
                    {isCurrent ? (
                      <span className="ld-pill ld-pill--jade">Connected</span>
                    ) : (
                      <span className="text-[var(--mut)]">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })
            )
          ) : (
            <div className="p-2">
              <div className="flex items-center gap-3 mb-4">
                <RssiIcon rssi={selected.rssi} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--sea)]">{selected.ssid}</p>
                  <p className="text-xs text-[var(--mut)]">
                    {selected.encrypted ? 'Secured network' : 'Open network'}
                  </p>
                </div>
              </div>
              {selected.encrypted && (
                <div className="mb-3">
                  <label className="block text-xs text-[var(--mut)] mb-1">Password</label>
                  <input
                    className="ld-field"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && connect()}
                    placeholder="Network password"
                    autoFocus
                  />
                </div>
              )}
              {error && <p className="mb-3 text-xs text-[var(--ember)]">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => setSelected(null)} disabled={connecting} className="ld-ghost flex-1 py-2 text-sm cursor-pointer disabled:opacity-50">
                  Back
                </button>
                <button onClick={connect} disabled={connecting} className="ld-btn flex-1 py-2 text-sm cursor-pointer disabled:opacity-50">
                  {connecting ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}