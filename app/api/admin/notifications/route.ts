import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { isAdmin } from '@/types/database'
import { fetchNotifOverrides } from '@/lib/queries/app-settings'
import { NOTIF_TEMPLATES, resolveTemplates } from '@/lib/notification-templates'
import { sendAdminNotification } from '@/lib/push/send-notifications'
import { pushToUser } from '@/lib/push/send-to-user'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

async function requireAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (isAdmin(user.id)) return null
  const { data: profile } = await supabase.from('users').select('is_manager').eq('id', user.id).single()
  if (profile?.is_manager) return null
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/**
 * GET /api/admin/notifications
 * Tutti i messaggi push noti all'app (con override applicati), gli override
 * grezzi, gli utenti (per destinatari/contesto) e i conteggi subscription.
 * Il pannello di debug lo usa come stato iniziale completo.
 */
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const supabase = await createClient()
  const overrides = await fetchNotifOverrides(supabase)

  const admin = createAdminSupabase()
  const [usersRes, subsRes] = await Promise.all([
    admin.from('users').select('id, nome, cognome, is_secondary, is_dco_plus').order('cognome'),
    admin.from('push_subscriptions').select('user_id, endpoint, browser, platform, last_update'),
  ])
  if (usersRes.error) return NextResponse.json({ error: usersRes.error.message }, { status: 500 })
  if (subsRes.error) return NextResponse.json({ error: subsRes.error.message }, { status: 500 })

  // conteggio dispositivi per utente (senza esporre gli endpoint interi in UI)
  const subsByUser = new Map<string, number>()
  for (const s of subsRes.data ?? []) {
    const row = s as { user_id: string }
    subsByUser.set(row.user_id, (subsByUser.get(row.user_id) ?? 0) + 1)
  }

  return NextResponse.json({
    templates: resolveTemplates(overrides),
    defaults: NOTIF_TEMPLATES,
    overrides,
    users: (usersRes.data ?? []).map(u => ({
      ...u,
      devices: subsByUser.get((u as { id: string }).id) ?? 0,
    })),
  })
}

/**
 * PUT /api/admin/notifications
 * Salva gli override dei testi (intero oggetto, dal pannello) o li azzera
 * ({ overrides: null }) tornando ai testi predefiniti del codice.
 */
export async function PUT(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await req.json().catch(() => null) as { overrides?: unknown } | null
  if (!body || body.overrides === undefined) {
    return NextResponse.json({ error: 'overrides richiesto' }, { status: 400 })
  }
  if (body.overrides !== null && typeof body.overrides !== 'object') {
    return NextResponse.json({ error: 'overrides deve essere un oggetto o null' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('app_settings')
    .update({ notif_template_overrides: body.overrides })
    .eq('id', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

/**
 * POST /api/admin/notifications
 * Invio dal pannello: messaggio libero con variabili, destinatari risolti
 * (all/secondary/primary/custom) e contesto opzionale. Ritorna l'esito per
 * destinatario (delivered/skipped/failed + testo inviato) come report.
 */
export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.title !== 'string' || typeof body.body !== 'string' || !body.title || !body.body) {
    return NextResponse.json({ error: 'title e body richiesti' }, { status: 400 })
  }

  const audience = (['all', 'secondary', 'primary', 'custom'] as const).includes(body.audience as 'all')
    ? body.audience as 'all' | 'secondary' | 'primary' | 'custom'
    : 'all'
  const targetIds = Array.isArray(body.targetIds) ? (body.targetIds as string[]) : null

  const outcomes = await sendAdminNotification({
    title: body.title,
    body: body.body,
    type: typeof body.type === 'string' ? body.type : 'system',
    audience,
    targetIds,
    varContext: (body.varContext ?? undefined) as Record<string, string> | undefined,
  })

  return NextResponse.json({
    ok: true,
    delivered: outcomes.reduce((n, o) => n + (o.status === 'delivered' ? o.sent : 0), 0),
    skipped: outcomes.filter(o => o.status === 'skipped').length,
    failed: outcomes.filter(o => o.status === 'failed').length,
    outcomes,
  })
}

/**
 * DELETE /api/admin/notifications?userId=…
 * Rimuove TUTTE le subscription push di un utente (debug dispositivi: «stale»).
 */
export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId richiesto' }, { status: 400 })

  // service role: push_subscriptions è own-row-only per RLS
  const admin: SupabaseClient = createAdminSupabase()
  const { error } = await admin.from('push_subscriptions').delete().eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // conferma immediata di ricezione: un ping all'utente (best effort)
  await pushToUser(userId, {
    title: 'Notifiche ripristinate',
    body: 'Le iscrizioni push del tuo account sono state aggiornate dall’assistenza.',
    type: 'system',
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
