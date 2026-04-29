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

  // Load shift + interested users
  const { data: shift } = await adminSupabase
    .from('shifts')
    .select('user_id, offered_shift, shift_date, requested_shifts')
    .eq('id', shiftId)
    .single()

  if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

  const { data: interested } = await adminSupabase
    .from('shift_interested_users')
    .select('user_id')
    .eq('shift_id', shiftId)

  const interestedUserIds = (interested ?? []).map((i: { user_id: string }) => i.user_id)

  // Delete the shift request
  const { error: deleteError } = await adminSupabase
    .from('shifts')
    .delete()
    .eq('id', shiftId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const managerName = [callerProfile.cognome, callerProfile.nome].filter(Boolean).join(' ') || 'Il turnista'

  // Send notifications
  const notifyBase = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (action === 'reject') {
    const reasonStr = typeof reason === 'string' && reason.trim() ? reason.trim() : null
    await fetch(`${notifyBase}/api/push/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'manager_shift_reject',
        targetUserId: shift.user_id,
        managerName,
        shiftId,
        offeredShift: shift.offered_shift,
        shiftDate: shift.shift_date,
        reason: reasonStr,
      }),
    }).catch(() => {})
  } else {
    // confirm
    const winnerId = typeof selectedUserId === 'string' ? selectedUserId : (interestedUserIds[0] ?? null)
    const otherIds = interestedUserIds.filter(id => id !== winnerId)

    await fetch(`${notifyBase}/api/push/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'manager_shift_confirm',
        creatorUserId: shift.user_id,
        winnerUserId: winnerId,
        otherUserIds: otherIds,
        managerName,
        offeredShift: shift.offered_shift,
        shiftDate: shift.shift_date,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
