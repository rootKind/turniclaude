import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { pushToUser } from '@/lib/push/send-to-user'
import { loadNotifOverrides, messageFor } from '@/lib/push/send-with-template'
import { VACATION_PERIOD_LABELS_SHORT } from '@/lib/vacations'
import type { VacationPeriod } from '@/types/database'

// Notifiche d'ESITO di un cambio ferie (scorte, approvato, superato, cancellato):
// tipo 'vacation_outcome' → sezione «Esito delle tue ferie» in bacheca
// (elenco condiviso: NOTIF_TYPES in types/database.ts).

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await supabase
    .from('users')
    .select('is_manager, nome, cognome')
    .eq('id', user.id)
    .single()

  if (!callerProfile?.is_manager) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: requestIdStr } = await params
  const requestId = Number(requestIdStr)
  if (isNaN(requestId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action, reason, selectedUserId } = body as Record<string, unknown>
  if (action !== 'confirm' && action !== 'reject' && action !== 'pending') {
    return NextResponse.json({ error: 'action must be confirm, reject or pending' }, { status: 400 })
  }

  const adminSupabase = createAdminSupabase()

  const { data: vacReq } = await adminSupabase
    .from('vacation_requests')
    .select('user_id, offered_period, year, is_pending')
    .eq('id', requestId)
    .single()

  if (!vacReq) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  // Testi dei messaggi da registry (override admin in app_settings → default
  // del codice): gli stessi casi dei cambi turno, ma per le richieste ferie.
  const overrides = await loadNotifOverrides()

  const { data: interested } = await adminSupabase
    .from('vacation_request_interests')
    .select('user_id')
    .eq('request_id', requestId)

  const interestedUserIds = (interested ?? []).map((i: { user_id: string }) => i.user_id)

  if (action === 'pending') {
    if (vacReq.is_pending) {
      await adminSupabase.from('vacation_requests').update({ is_pending: false }).eq('id', requestId)
      return NextResponse.json({ ok: true })
    }
    const winnerId = typeof selectedUserId === 'string' ? selectedUserId : (interestedUserIds[0] ?? null)
    if (winnerId) {
      const { data: winnerProfile } = await adminSupabase
        .from('users').select('nome, cognome').eq('id', winnerId).single()
      const winnerName = winnerProfile
        ? `${winnerProfile.cognome ?? ''} ${winnerProfile.nome ?? ''}`.trim()
        : 'un collega'
      const periodLabel = VACATION_PERIOD_LABELS_SHORT[vacReq.offered_period as VacationPeriod] ?? `Periodo ${vacReq.offered_period}`
      // Anno NUDO: le parentesi le mette il template (convenzione in
      // lib/notification-templates.ts), così l'anteprima del pannello è il testo vero.
      const yearLabel = vacReq.year ? String(vacReq.year) : ''
      // Testo da registry, identico per creatore e vincitore.
      const msg = messageFor(overrides, 'vacation_pending.title', {
        periodo: periodLabel, anno: yearLabel, cognome_attore: winnerName,
      })
      await Promise.allSettled([
        pushToUser(vacReq.user_id as string, { title: msg.title, body: msg.body, type: 'vacation_outcome' }),
        pushToUser(winnerId, { title: msg.title, body: msg.body, type: 'vacation_outcome' }),
      ])
    }
    await adminSupabase.from('vacation_requests').update({ is_pending: true }).eq('id', requestId)
    return NextResponse.json({ ok: true })
  }

  const { error: deleteError } = await adminSupabase
    .from('vacation_requests')
    .delete()
    .eq('id', requestId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const periodLabel = VACATION_PERIOD_LABELS_SHORT[vacReq.offered_period as VacationPeriod] ?? `Periodo ${vacReq.offered_period}`
  const yearLabel = vacReq.year ? String(vacReq.year) : ''

  if (action === 'reject') {
    const reasonStr = typeof reason === 'string' && reason.trim() ? reason.trim() : null
    // {motivo} è nudo («per: …»): lo spazio prima lo mette il template, così se
    // il manager non scrive nulla non resta niente da comprimere.
    const msg = messageFor(overrides, 'vacation_rejected.title', {
      periodo: periodLabel, anno: yearLabel, motivo: reasonStr ? `per: ${reasonStr}` : '',
    })
    await pushToUser(vacReq.user_id as string, {
      title: msg.title,
      body: msg.body,
      type: 'vacation_outcome',
    }).catch(() => {})
  } else {
    const winnerId = typeof selectedUserId === 'string' ? selectedUserId : (interestedUserIds[0] ?? null)
    const otherIds = interestedUserIds.filter((id: string) => id !== winnerId)

    if (winnerId) {
      const { data: winnerProfile } = await adminSupabase
        .from('users').select('nome, cognome').eq('id', winnerId).single()
      const winnerName = winnerProfile
        ? `${winnerProfile.cognome ?? ''} ${winnerProfile.nome ?? ''}`.trim()
        : 'un collega'

      const { data: creatorProfile } = await adminSupabase
        .from('users').select('nome, cognome').eq('id', vacReq.user_id as string).single()
      const creatorName = creatorProfile
        ? `${creatorProfile.cognome ?? ''} ${creatorProfile.nome ?? ''}`.trim()
        : 'un collega'

      // Testi dal registry, uno per destinatario (chi offre e chi prende).
      const msgCreator = messageFor(overrides, 'vacation_approved.creator.title', {
        periodo: periodLabel, anno: yearLabel, cognome_attore: winnerName,
      })
      const msgWinner = messageFor(overrides, 'vacation_approved.winner.title', {
        periodo: periodLabel, anno: yearLabel, cognome_attore: creatorName,
      })

      await Promise.allSettled([
        pushToUser(vacReq.user_id as string, {
          title: msgCreator.title,
          body: msgCreator.body,
          type: 'vacation_outcome',
        }),
        pushToUser(winnerId, {
          title: msgWinner.title,
          body: msgWinner.body,
          type: 'vacation_outcome',
        }),
      ])
    }

    if (otherIds.length) {
      const msgOthers = messageFor(overrides, 'vacation_others.title', {})
      await Promise.allSettled(otherIds.map((id: string) =>
        pushToUser(id, {
          title: msgOthers.title,
          body: msgOthers.body,
          type: 'vacation_outcome',
        })
      ))
    }
  }

  return NextResponse.json({ ok: true })
}
