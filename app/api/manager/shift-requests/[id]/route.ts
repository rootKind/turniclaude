import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { pushToUser } from '@/lib/push/send-to-user'
import { loadNotifOverrides, messageFor } from '@/lib/push/send-with-template'
import { formatDateShort } from '@/lib/utils'

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

  const { id: shiftIdStr } = await params
  const shiftId = Number(shiftIdStr)
  if (isNaN(shiftId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action, reason, selectedUserId } = body as Record<string, unknown>
  if (action !== 'confirm' && action !== 'reject' && action !== 'pending') {
    return NextResponse.json({ error: 'action must be confirm, reject or pending' }, { status: 400 })
  }

  const adminSupabase = createAdminSupabase()

  const { data: shift } = await adminSupabase
    .from('shifts')
    .select('user_id, offered_shift, shift_date, is_pending')
    .eq('id', shiftId)
    .single()

  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  const { data: interested } = await adminSupabase
    .from('shift_interested_users')
    .select('user_id')
    .eq('shift_id', shiftId)

  const interestedUserIds = (interested ?? []).map((i: { user_id: string }) => i.user_id)

  if (action === 'pending') {
    if (shift.is_pending) {
      await adminSupabase.from('shifts').update({ is_pending: false }).eq('id', shiftId)
      return NextResponse.json({ ok: true })
    }
    const winnerId = typeof selectedUserId === 'string' ? selectedUserId : (interestedUserIds[0] ?? null)
    if (winnerId) {
      const { data: winnerProfile } = await adminSupabase
        .from('users').select('nome, cognome').eq('id', winnerId).single()
      const winnerName = winnerProfile
        ? `${winnerProfile.cognome ?? ''} ${winnerProfile.nome ?? ''}`.trim()
        : 'un collega'
      const dateLabel = shift.shift_date ? formatDateShort(shift.shift_date as string) : ''
      // Testo da registry (override admin → default) verso creatore e vincitore.
      const overrides = await loadNotifOverrides()
      const msg = messageFor(overrides, 'pending.title', {
        turno: shift.offered_shift ?? '', data: dateLabel, cognome_attore: winnerName,
      })
      await Promise.allSettled([
        pushToUser(shift.user_id as string, { title: msg.title, body: msg.body, type: 'system' }),
        pushToUser(winnerId, { title: msg.title, body: msg.body, type: 'system' }),
      ])
    }
    await adminSupabase.from('shifts').update({ is_pending: true }).eq('id', shiftId)
    return NextResponse.json({ ok: true })
  }

  const { error: deleteError } = await adminSupabase
    .from('shifts')
    .delete()
    .eq('id', shiftId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const dateLabel = shift.shift_date ? formatDateShort(shift.shift_date as string) : ''

  if (action === 'reject') {
    const reasonStr = typeof reason === 'string' && reason.trim() ? reason.trim() : null
    // Testo da registry: {motivo} include il prefisso « per: …» solo se presente.
    const overrides = await loadNotifOverrides()
    const msg = messageFor(overrides, 'rejected.title', {
      turno: shift.offered_shift ?? '', data: dateLabel, motivo: reasonStr ? `per: ${reasonStr}` : '',
    })
    await pushToUser(shift.user_id as string, {
      title: msg.title,
      body: msg.body,
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
        .from('users').select('nome, cognome').eq('id', shift.user_id as string).single()
      const creatorName = creatorProfile
        ? `${creatorProfile.cognome ?? ''} ${creatorProfile.nome ?? ''}`.trim()
        : 'un collega'

      // Testi da registry (override admin → default), uno per destinatario.
      const overrides = await loadNotifOverrides()
      const msgCreator = messageFor(overrides, 'approved.creator.title', {
        turno: shift.offered_shift ?? '', data: dateLabel, cognome_attore: winnerName,
      })
      const msgWinner = messageFor(overrides, 'approved.winner.title', {
        turno: shift.offered_shift ?? '', data: dateLabel, cognome_attore: creatorName,
      })
      await Promise.allSettled([
        pushToUser(shift.user_id as string, { title: msgCreator.title, body: msgCreator.body, type: 'system' }),
        pushToUser(winnerId, { title: msgWinner.title, body: msgWinner.body, type: 'system' }),
      ])
    }

    if (otherIds.length) {
      const overrides = await loadNotifOverrides()
      const msg = messageFor(overrides, 'others.title', {})
      await Promise.allSettled(otherIds.map((id: string) =>
        pushToUser(id, { title: msg.title, body: msg.body, type: 'system' })
      ))
    }
  }

  return NextResponse.json({ ok: true })
}
