import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ADMIN_ID } from '@/types/database'
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminSupabase = createAdminSupabase()

  const { data, error } = await adminSupabase.from('users').select('id, nome, cognome, is_secondary, is_manager, is_dco_plus, show_in_compare').order('cognome')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ users: data ?? [] })
}

/** Aggiornamento di massa della visibilità nel Confronto (editor di massa admin). */
export async function PATCH(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { updates } = body as { updates?: Array<{ userId?: string; showInCompare?: boolean }> }
  if (!Array.isArray(updates) || !updates.length) {
    return NextResponse.json({ error: 'updates[] richiesto' }, { status: 400 })
  }
  const clean = updates.filter(
    (u): u is { userId: string; showInCompare: boolean } =>
      typeof u.userId === 'string' && !!u.userId && typeof u.showInCompare === 'boolean',
  )
  if (!clean.length) {
    return NextResponse.json({ error: 'Nessun aggiornamento valido' }, { status: 400 })
  }

  const adminSupabase = createAdminSupabase()
  const results = await Promise.allSettled(
    clean.map(u => adminSupabase.from('users').update({ show_in_compare: u.showInCompare }).eq('id', u.userId)),
  )
  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length) {
    return NextResponse.json({ error: `${failed.length} aggiornamenti falliti` }, { status: 500 })
  }
  return NextResponse.json({ ok: true, updated: clean.length })
}
