import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// GET /api/changelog — entry del changelog + ultima versione vista dall'utente.
// Autenticato (RLS: le entry sono leggibili da tutti gli autenticati, la riga
// di lettura è own-row).
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [{ data: entries, error: entriesError }, { data: reads }] = await Promise.all([
    supabase
      .from('changelog_entries')
      .select('version, date, title, changes')
      .order('version', { ascending: false }),
    supabase
      .from('changelog_reads')
      .select('last_seen_version')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (entriesError) {
    return NextResponse.json({ error: entriesError.message }, { status: 500 })
  }

  return NextResponse.json({
    entries: entries ?? [],
    lastSeenVersion: reads?.last_seen_version ?? 0,
  })
}
