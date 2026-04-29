import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/types/database'
import { pushToUser } from '@/lib/push/send-to-user'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdmin(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { userId, title, message, type } = body as Record<string, unknown>
  if (!userId || !title || !message) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  await pushToUser(userId as string, {
    title,
    body: message,
    type: type ?? 'system',
  })

  return NextResponse.json({ ok: true })
}
