import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ADMIN_ID } from '@/types/database'

// GET /api/admin/changelog/reads — stato di lettura del changelog per ciascun utente
// (join users → changelog_reads) + l'ultima versione pubblicata, per calcolare
// chi non ha ancora visto l'ultima release.
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminSupabase = createAdminSupabase()

  const [{ data: users, error: usersError }, { data: maxRow }] = await Promise.all([
    adminSupabase
      .from('users')
      .select('id, nome, cognome, is_secondary, is_manager')
      .order('cognome'),
    adminSupabase
      .from('changelog_entries')
      .select('version')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 })

  const { data: reads, error: readsError } = await adminSupabase
    .from('changelog_reads')
    .select('user_id, last_seen_version, updated_at')
  if (readsError) return NextResponse.json({ error: readsError.message }, { status: 500 })

  const readsMap = new Map(reads?.map(r => [r.user_id, r]) ?? [])

  const rows = (users ?? []).map(u => ({
    ...u,
    lastSeenVersion: readsMap.get(u.id)?.last_seen_version ?? 0,
    readAt: readsMap.get(u.id)?.updated_at ?? null,
  }))

  return NextResponse.json({
    users: rows,
    latestVersion: maxRow?.version ?? 0,
  })
}
