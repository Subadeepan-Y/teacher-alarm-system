import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase server credentials')
  return createAdminClient(url, key)
}

export async function POST(request: Request) {
  try {
    const supabase = await createAuthClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user || user.email !== 'subadeepankgm@gmail.com') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const structure = typeof body.structure === 'string' ? body.structure : ''

    const admin = getAdmin()
    const { error } = await admin.from('profiles').upsert(
      { id: user.id, structure, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
