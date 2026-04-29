import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

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
  if (action !== 'confirm' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be confirm or reject' }, { status: 400 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: vacReq } = await adminSupabase
    .from('vacation_requests')
    .select('user_id, offered_period, target_periods, year')
    .eq('id', requestId)
    .single()

  if (!vacReq) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { data: interested } = await adminSupabase
    .from('vacation_request_interests')
    .select('user_id')
    .eq('request_id', requestId)

  const interestedUserIds = (interested ?? []).map((i: { user_id: string }) => i.user_id)

  const { error: deleteError } = await adminSupabase
    .from('vacation_requests')
    .delete()
    .eq('id', requestId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const managerName = [callerProfile.cognome, callerProfile.nome].filter(Boolean).join(' ') || 'Il turnista'
  const notifyBase = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (action === 'reject') {
    const reasonStr = typeof reason === 'string' && reason.trim() ? reason.trim() : null
    await fetch(`${notifyBase}/api/push/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'manager_vacation_reject',
        targetUserId: vacReq.user_id,
        managerName,
        offeredPeriod: vacReq.offered_period,
        year: vacReq.year,
        reason: reasonStr,
      }),
    }).catch(() => {})
  } else {
    const winnerId = typeof selectedUserId === 'string' ? selectedUserId : (interestedUserIds[0] ?? null)
    const otherIds = interestedUserIds.filter(id => id !== winnerId)

    await fetch(`${notifyBase}/api/push/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'manager_vacation_confirm',
        creatorUserId: vacReq.user_id,
        winnerUserId: winnerId,
        otherUserIds: otherIds,
        managerName,
        offeredPeriod: vacReq.offered_period,
        year: vacReq.year,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
