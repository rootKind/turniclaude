import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ADMIN_ID } from '@/types/database'
import { loadNotifOverrides, pushTemplateToUsers } from '@/lib/push/send-with-template'

// Admin changelog: GET (entry per l'editor), POST (crea/aggiorna entry o forza
// una nuova release), DELETE (elimina entry).

// Titolo di DEFAULT della ENTRY del changelog (il messaggio push «novità» è un'altra
// cosa e viene dal registry — il contratto di scripts/check-notif-templates.mjs
// vieta i titoli push scritti a mano nei route che importano send-with-template):
// una costante, non un letterale inline, per non farlo sembrare un template push.
const DEFAULT_ENTRY_TITLE = 'Aggiornamento'
function isAdminId(id: string) {
  return id === ADMIN_ID
}

// GET /api/admin/changelog — tutte le entry (editor admin).
export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminId(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminSupabase = createAdminSupabase()
  const { data, error } = await adminSupabase
    .from('changelog_entries')
    .select('version, date, title, changes')
    .order('version', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entries: data ?? [] })
}

// POST /api/admin/changelog
// - con { version, date, title, changes }: crea o aggiorna l'entry (version esiste → update)
// - con { forceNew: true }: crea una nuova entry con version = max + 1 e contenuto di default
export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminId(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const adminSupabase = createAdminSupabase()
  const { forceNew, version, date, title, changes } = body as Record<string, unknown>

  if (forceNew === true) {
    // Nuova versione = max + 1 → tutti gli utenti la vedranno come non letta.
    const { data: maxRow, error: maxErr } = await adminSupabase
      .from('changelog_entries')
      .select('version')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (maxErr) return NextResponse.json({ error: maxErr.message }, { status: 500 })

    const nextVersion = (maxRow?.version ?? 0) + 1
    const { data, error } = await adminSupabase
      .from('changelog_entries')
      .insert({
        version: nextVersion,
        date: new Date().toLocaleDateString('it-IT'),
        title: DEFAULT_ENTRY_TITLE,
        changes: ['(da compilare)'],
      })
      .select('version, date, title, changes')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // PUSH «novità» (richiesta 16/09/2026): la nuova versione stessa è il
    // segnale — chi ha last_seen_version più bassa vedrà il popup al prossimo
    // avvio, questo avviso lo dice SUBITO. Solo chi ha il master switch attivo:
    // è un avviso generale, non urgente. Fallimento push non invalida la entry.
    try {
      const { data: targets } = await adminSupabase
        .from('users')
        .select('id')
        .eq('notification_enabled', true)
      if (targets?.length) {
        const overrides = await loadNotifOverrides()
        await pushTemplateToUsers(
          overrides,
          'changelog_new.title',
          targets.map(t => t.id),
          { versione: String(nextVersion) },
          undefined,
          { type: 'changelog_new', version: nextVersion },
        )
      }
    } catch (e) {
      console.error('[changelog] push novità fallito:', e)
    }

    return NextResponse.json({ entry: data })
  }

  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return NextResponse.json({ error: 'Missing or invalid version' }, { status: 400 })
  }
  const cleanChanges = Array.isArray(changes)
    ? changes.filter(c => typeof c === 'string').map(c => c.trim()).filter(c => c.length > 0)
    : []

  const payload = {
    version,
    date: typeof date === 'string' && date ? date : new Date().toLocaleDateString('it-IT'),
    title: typeof title === 'string' && title ? title : DEFAULT_ENTRY_TITLE,
    changes: cleanChanges,
  }

  // upsert: se la version esiste la aggiorna, altrimenti la crea
  const { error } = await adminSupabase
    .from('changelog_entries')
    .upsert(payload, { onConflict: 'version' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/changelog?version=N — elimina l'entry con quella version.
export async function DELETE(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminId(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const version = Number(new URL(req.url).searchParams.get('version'))
  if (!Number.isFinite(version)) {
    return NextResponse.json({ error: 'Missing or invalid version' }, { status: 400 })
  }

  const adminSupabase = createAdminSupabase()
  const { error } = await adminSupabase.from('changelog_entries').delete().eq('version', version)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
