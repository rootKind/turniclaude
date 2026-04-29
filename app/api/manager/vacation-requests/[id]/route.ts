import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { pushToUser } from '@/lib/push/send-to-user'

const PERIOD_LABELS: Record<number, string> = {
  1: '16–30 Giu', 2: '01–15 Lug', 3: '16–31 Lug',
  4: '01–15 Ago', 5: '16–31 Ago', 6: '01–15 Set',
}

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

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: vacReq } = await adminSupabase
    .from('vacation_requests')
    .select('user_id, offered_period, year, is_pending')
    .eq('id', requestId)
    .single()

  if (!vacReq) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

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
      const periodLabel = PERIOD_LABELS[vacReq.offered_period as number] ?? `Periodo ${vacReq.offered_period}`
      const yearLabel = vacReq.year ? ` (${vacReq.year})` : ''
      const notifBody = `Il cambio ${periodLabel}${yearLabel} con ${winnerName} non può essere ancora accettato perché ci sono scorte disponibili`
      await Promise.allSettled([
        pushToUser(vacReq.user_id as string, { title: 'Cambio ferie in attesa di conferma', body: notifBody, type: 'system' }),
        pushToUser(winnerId, { title: 'Cambio ferie in attesa di conferma', body: notifBody, type: 'system' }),
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

  const periodLabel = PERIOD_LABELS[vacReq.offered_period as number] ?? `Periodo ${vacReq.offered_period}`
  const yearLabel = vacReq.year ? ` (${vacReq.year})` : ''

  if (action === 'reject') {
    const reasonStr = typeof reason === 'string' && reason.trim() ? reason.trim() : null
    await pushToUser(vacReq.user_id as string, {
      title: 'Richiesta di cambio ferie cancellata',
      body: `Il turnista ha cancellato la tua richiesta di cambio ferie ${periodLabel}${yearLabel}${reasonStr ? ` per: ${reasonStr}` : ''}`,
      type: 'system',
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

      await Promise.allSettled([
        pushToUser(vacReq.user_id as string, {
          title: 'Cambio ferie approvato',
          body: `Il turnista ha approvato la tua richiesta di cambio ferie ${periodLabel}${yearLabel} con ${winnerName}`,
          type: 'system',
        }),
        pushToUser(winnerId, {
          title: 'Cambio ferie approvato',
          body: `Il turnista ha approvato il cambio ferie ${periodLabel}${yearLabel} con ${creatorName}`,
          type: 'system',
        }),
      ])
    }

    if (otherIds.length) {
      await Promise.allSettled(otherIds.map((id: string) =>
        pushToUser(id, {
          title: 'Cambio ferie assegnato ad altri',
          body: 'Il tuo interesse è stato superato: è stato fatto il cambio con altri interessati.',
          type: 'system',
        })
      ))
    }
  }

  return NextResponse.json({ ok: true })
}
