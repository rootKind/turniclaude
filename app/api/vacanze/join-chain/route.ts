import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

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

  // Atomic multi-row insert — PostgreSQL esegue come singola statement
  const rows = requestIds.map(id => ({ request_id: id, user_id: user.id }))
  const { error } = await supabase.from('vacation_request_interests').insert(rows)
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'already_interested' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Notifica push agli owner di ogni richiesta (fire-and-forget)
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  const periodLabels: Record<number, string> = {
    1: '16–30 Giu', 2: '01–15 Lug', 3: '16–31 Lug',
    4: '01–15 Ago', 5: '16–31 Ago', 6: '01–15 Set',
  }

  await Promise.allSettled(requestIds.map(async (requestId) => {
    const { data: vacReq } = await supabase
      .from('vacation_requests')
      .select('user_id, offered_period')
      .eq('id', requestId)
      .single()
    if (!vacReq || vacReq.user_id === user.id) return

    const { data: owner } = await supabase
      .from('users')
      .select('id, notify_on_vacation_interest, notification_enabled')
      .eq('id', vacReq.user_id)
      .single()
    if (!owner || owner.notification_enabled === false || owner.notify_on_vacation_interest === false) return

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription, endpoint')
      .eq('user_id', owner.id)
    if (!subs?.length) return

    const offeredLabel = periodLabels[vacReq.offered_period as number] ?? `Periodo ${vacReq.offered_period}`
    const payload = JSON.stringify({
      title: 'Interesse alla tua richiesta ferie (catena)',
      body: `${actorName} è interessato al tuo ${offeredLabel} ${year} come parte di una catena`,
      type: 'vacation_interest',
      requestId,
    })

    const stale: string[] = []
    await Promise.allSettled(
      subs.map(async ({ subscription, endpoint }) => {
        try {
          await webpush.sendNotification(subscription as webpush.PushSubscription, payload)
        } catch (err: unknown) {
          const code = (err as { statusCode?: number })?.statusCode
          if (code === 410 || code === 404) stale.push(endpoint as string)
        }
      })
    )
    if (stale.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', stale).eq('user_id', owner.id)
    }
  }))

  return NextResponse.json({ ok: true })
}
