import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { pushToUser } from '@/lib/push/send-to-user'

function formatDate(dateStr: string) {
  const [, mm, dd] = dateStr.split('-')
  return `${dd}/${mm}`
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

  const { id: shiftIdStr } = await params
  const shiftId = Number(shiftIdStr)
  if (isNaN(shiftId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action, reason, selectedUserId } = body as Record<string, unknown>
  if (action !== 'confirm' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be confirm or reject' }, { status: 400 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: shift } = await adminSupabase
    .from('shifts')
    .select('user_id, offered_shift, shift_date')
    .eq('id', shiftId)
    .single()

  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  const { data: interested } = await adminSupabase
    .from('shift_interested_users')
    .select('user_id')
    .eq('shift_id', shiftId)

  const interestedUserIds = (interested ?? []).map((i: { user_id: string }) => i.user_id)

  const { error: deleteError } = await adminSupabase
    .from('shifts')
    .delete()
    .eq('id', shiftId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const dateLabel = shift.shift_date ? formatDate(shift.shift_date as string) : ''

  if (action === 'reject') {
    const reasonStr = typeof reason === 'string' && reason.trim() ? reason.trim() : null
    const bodyText = `Il turnista ha cancellato la tua richiesta di cambio ${shift.offered_shift ?? ''}${dateLabel ? ` del ${dateLabel}` : ''}${reasonStr ? ` per: ${reasonStr}` : ''}`
    await pushToUser(shift.user_id as string, {
      title: 'Richiesta di cambio cancellata',
      body: bodyText,
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

      await Promise.allSettled([
        pushToUser(shift.user_id as string, {
          title: 'Cambio turno approvato',
          body: `Il turnista ha approvato la tua richiesta di cambio ${shift.offered_shift ?? ''}${dateLabel ? ` del ${dateLabel}` : ''} con ${winnerName}`,
          type: 'system',
        }),
        pushToUser(winnerId, {
          title: 'Cambio turno approvato',
          body: `Il turnista ha approvato il cambio ${shift.offered_shift ?? ''}${dateLabel ? ` del ${dateLabel}` : ''} con ${creatorName}`,
          type: 'system',
        }),
      ])
    }

    if (otherIds.length) {
      await Promise.allSettled(otherIds.map((id: string) =>
        pushToUser(id, {
          title: 'Cambio turno assegnato ad altri',
          body: 'Il tuo interesse è stato superato: è stato fatto il cambio con altri interessati.',
          type: 'system',
        })
      ))
    }
  }

  return NextResponse.json({ ok: true })
}
