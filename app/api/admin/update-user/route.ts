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

  const { userId, nome, cognome, password, isSecondary, isManager, isDcoPlus, showInCompare, basePeriod } = body as Record<string, unknown>
  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const adminSupabase = createAdminSupabase()

  if (typeof nome === 'string' || typeof cognome === 'string' || typeof isSecondary === 'boolean' || typeof isManager === 'boolean' || typeof isDcoPlus === 'boolean') {
    const updates: Record<string, unknown> = {}
    if (typeof nome === 'string') updates.nome = nome
    if (typeof cognome === 'string') updates.cognome = cognome
    if (typeof isSecondary === 'boolean') {
      updates.is_secondary = isSecondary
      // I Noni non possono essere DCO+
      if (isSecondary) updates.is_dco_plus = false
    }
    if (typeof isDcoPlus === 'boolean') {
      updates.is_dco_plus = isDcoPlus
    }
    if (typeof isManager === 'boolean') {
      updates.is_manager = isManager
      // Un manager non è né DCO né Noni, e non può essere DCO+
      if (isManager) {
        updates.is_secondary = false
        updates.is_dco_plus = false
      }
    }
    // Visibilità nel selettore «Confronta» di /tuoturno (migration 026)
    if (typeof showInCompare === 'boolean') {
      updates.show_in_compare = showInCompare
    }
    // Garanzia finale: mai DCO+ se la categoria è Noni o se è manager
    if (updates.is_secondary === true || updates.is_manager === true) {
      updates.is_dco_plus = false
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

  // Upsert ferie base lato server (service role): la tabella vacation_assignments
  // è in sola lettura per i client dalla migration 011, quindi l'upsert fatto dal
  // dialog via client anonimo veniva sempre rifiutato da RLS.
  if (typeof basePeriod === 'number' && basePeriod >= 1 && basePeriod <= 6) {
    const { error } = await adminSupabase
      .from('vacation_assignments')
      .upsert({ user_id: userId, base_period: basePeriod }, { onConflict: 'user_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
