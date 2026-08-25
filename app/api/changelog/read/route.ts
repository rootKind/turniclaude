import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// POST /api/changelog/read — marca la versione `version` come vista dall'utente
// (upsert della riga own-row in changelog_reads).
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { version } = body as Record<string, unknown>
  if (typeof version !== 'number' || !Number.isFinite(version) || version < 0) {
    return NextResponse.json({ error: 'Missing or invalid version' }, { status: 400 })
  }

  const { error } = await supabase
    .from('changelog_reads')
    .upsert({ user_id: user.id, last_seen_version: version, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
