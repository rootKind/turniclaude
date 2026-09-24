import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { event_type, metadata } = body as Record<string, unknown>
  // 'push_enabled': attivazione notifiche (metadata.source = 'prompt'|'settings',
  // richiesta 25/09/2026) — la statistica vive nelle admin stats (migration 035).
  if (!event_type || !['access', 'new_shift', 'interest', 'push_enabled'].includes(event_type as string)) {
    return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 })
  }

  const { error } = await supabase
    .from('app_events')
    .insert({ user_id: user.id, event_type, metadata: metadata ?? null })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
