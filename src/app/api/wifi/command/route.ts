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

const noStore = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
}

/**
 * GET — the ESP32 asks whether there is a pending connect command.
 * Returns idle when nothing is waiting, so polling is harmless.
 */
export async function GET() {
  try {
    const supabase = getAdmin()
    const { data, error } = await supabase.from('wifi_control').select('*').eq('id', 1).single()
    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const c = data || { cmd: 'idle', ssid: '', password: '', status: 'idle' }
    if (c.cmd === 'connect' && c.status === 'pending') {
      c.status = 'picked_up'
    }
    // Acknowledge pickup immediately so the ESP (not the web) owns the next
    // state transition.
    if (c.cmd === 'connect' && c.status === 'picked_up') {
      await supabase.from('wifi_control').update({ status: 'picked_up' }).eq('id', 1)
    }
    return NextResponse.json(c, { headers: noStore })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

/**
 * POST — the ESP32 reports the outcome of a connect attempt.
 * body: { status: 'applied' | 'failed', result?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const status = body?.status === 'applied' || body?.status === 'failed' ? body.status : 'idle'
    const result = typeof body?.result === 'string' ? body.result.slice(0, 200) : ''
    const supabase = getAdmin()
    const { error } = await supabase
      .from('wifi_control')
      .update({ cmd: 'idle', status, result, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}