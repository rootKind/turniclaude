import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { pushToUser } from '@/lib/push/send-to-user'
import { loadNotifOverrides, messageFor } from '@/lib/push/send-with-template'
import { getVacationPeriodForYear, VACATION_PERIOD_LABELS_SHORT } from '@/lib/vacations'
import type { VacationPeriod } from '@/types/database'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { requestIds, actorName, year } = body as { requestIds: number[]; actorName: string; year: number }
  if (!Array.isArray(requestIds) || requestIds.length < 2) {
    return NextResponse.json({ error: 'requestIds must have at least 2 items' }, { status: 400 })
  }
  if (typeof year !== 'number' || year < 2026 || year > 2099) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  // Server-side validation: requests must exist, not belong to the caller,
  // and form a valid circular chain (each node wants what the previous offers).
  const { data: requests, error: fetchError } = await supabase
    .from('vacation_requests')
    .select('id, user_id, offered_period, target_periods, year')
    .in('id', requestIds)
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!requests || requests.length !== new Set(requestIds).size) {
    return NextResponse.json({ error: 'Invalid requestIds' }, { status: 400 })
  }
  if (requests.some(r => r.user_id === user.id)) {
    return NextResponse.json({ error: 'You cannot join your own request' }, { status: 400 })
  }

  const byId = new Map(requests.map(r => [r.id, r]))

  // Chain validity: the caller offers their effective period for this year
  // (honoring admin overrides, like the vacanze dialog does); the first node
  // must accept it, and each following node must accept what the previous
  // node offers.
  const { data: myAssignment } = await supabase
    .from('vacation_assignments')
    .select('base_period')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!myAssignment?.base_period) {
    return NextResponse.json({ error: 'No vacation assignment' }, { status: 400 })
  }

  const { data: myOverride } = await supabase
    .from('vacation_year_overrides')
    .select('period')
    .eq('user_id', user.id)
    .eq('year', year)
    .maybeSingle()
  const myOffered = myOverride?.period != null
    ? (myOverride.period as VacationPeriod)
    : getVacationPeriodForYear(myAssignment.base_period as VacationPeriod, year)
  const first = byId.get(requestIds[0])
  if (!first || !(first.target_periods as number[]).includes(myOffered)) {
    return NextResponse.json({ error: 'Not a valid chain for you' }, { status: 400 })
  }
  for (let i = 1; i < requestIds.length; i++) {
    const prev = byId.get(requestIds[i - 1])
    const cur = byId.get(requestIds[i])
    if (!prev || !cur || !(cur.target_periods as number[]).includes(prev.offered_period)) {
      return NextResponse.json({ error: 'Not a valid chain' }, { status: 400 })
    }
  }

  // Atomic multi-row insert — PostgreSQL esegue come singola statement
  const rows = requestIds.map(id => ({ request_id: id, user_id: user.id }))
  const { error } = await supabase.from('vacation_request_interests').insert(rows)
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'already_interested' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Notifica push agli owner di ogni richiesta (fire-and-forget).
  // pushToUser usa il service role: RLS su push_subscriptions è own-row-only.
  const admin = createAdminSupabase()
  const overrides = await loadNotifOverrides()

  await Promise.allSettled(requestIds.map(async (requestId) => {
    const vacReq = byId.get(requestId)
    if (!vacReq) return

    const { data: owner } = await admin
      .from('users')
      .select('id, notify_on_vacation_interest, notification_enabled')
      .eq('id', vacReq.user_id)
      .single()
    if (!owner || owner.notification_enabled === false || owner.notify_on_vacation_interest === false) return

    const offeredLabel = VACATION_PERIOD_LABELS_SHORT[vacReq.offered_period as VacationPeriod] ?? `Periodo ${vacReq.offered_period}`
    const msg = messageFor(overrides, 'vacation_chain.title', {
      cognome_attore: actorName ?? '', periodo: offeredLabel, anno: String(year),
    })
    await pushToUser(owner.id, {
      title: msg.title,
      body: msg.body,
      type: 'vacation_interest',
      requestId,
      requestIds,
    })
  }))

  return NextResponse.json({ ok: true })
}
