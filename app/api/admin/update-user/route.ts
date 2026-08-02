import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ADMIN_ID } from '@/types/database'

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { userId, nome, cognome, password, isSecondary, isManager } = body as Record<string, unknown>
  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const adminSupabase = createAdminSupabase()

  if (typeof nome === 'string' || typeof cognome === 'string' || typeof isSecondary === 'boolean' || typeof isManager === 'boolean') {
    const updates: Record<string, unknown> = {}
    if (typeof nome === 'string') updates.nome = nome
    if (typeof cognome === 'string') updates.cognome = cognome
    if (typeof isManager === 'boolean') {
      updates.is_manager = isManager
      if (isManager) updates.is_secondary = false
    } else if (typeof isSecondary === 'boolean') {
      updates.is_secondary = isSecondary
    }
    const { error } = await adminSupabase.from('users').update(updates).eq('id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (typeof password === 'string') {
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password troppo corta (min 6 caratteri)' }, { status: 400 })
    }
    const { error } = await adminSupabase.auth.admin.updateUserById(userId, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
