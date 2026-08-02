import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ADMIN_ID } from '@/types/database'
import { pushToUser } from '@/lib/push/send-to-user'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { userId, title, body: msgBody, shiftId } = body as Record<string, unknown>
  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }
  if (typeof title !== 'string' || typeof msgBody !== 'string') {
    return NextResponse.json({ error: 'Missing title or body' }, { status: 400 })
  }

  // pushToUser usa il service role: RLS su push_subscriptions è own-row-only,
  // quindi leggere le subscription di un altro utente richiede il service role.
  const sent = await pushToUser(userId, { title, body: msgBody, type: 'system', shiftId: shiftId ?? null })
  return NextResponse.json({ sent })
}
