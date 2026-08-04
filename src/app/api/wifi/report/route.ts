import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase credentials')
  return createAdminClient(url, key, { auth: { persistSession: false } })
}

type ScanEntry = { ssid: string; rssi: number; encrypted: boolean }

/**
 * The ESP32 posts its latest nearby-network scan here. We replace the whole
 * wifi_scan table with the fresh list and remember which SSID it is on.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const list: ScanEntry[] = Array.isArray(body?.ssid) ? body.ssid : []
    const connected: string = typeof body?.connectedSsid === 'string' ? body.connectedSsid : ''
    const saved: string[] = Array.isArray(body?.saved) ? body.saved.filter((s: unknown) => typeof s === 'string') : []

    const supabase = getAdmin()

    // Only keep SSIDs that are actually in the air (drop stale rows).
    if (list.length) {
      const { data: existing } = await supabase.from('wifi_scan').select('id')
      if (existing && existing.length) {
        const { error: delErr } = await supabase
          .from('wifi_scan')
          .delete()
          .in('id', existing.map((r) => r.id))
        if (delErr) {
          return NextResponse.json({ error: delErr.message }, { status: 500 })
        }
      }
      const rows = list.map((n) => ({
        ssid: String(n.ssid).slice(0, 64),
        rssi: Number.isFinite(n.rssi) ? Math.round(n.rssi) : -100,
        encrypted: !!n.encrypted,
        is_current: connected && String(n.ssid) === connected,
      }))
      const { error: insErr } = await supabase.from('wifi_scan').insert(rows)
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }

    const { error: updErr } = await supabase
      .from('wifi_control')
      .update({ connected_ssid: connected })
      .eq('id', 1)
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, scanned: list.length, connected, saved })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}