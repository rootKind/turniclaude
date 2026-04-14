import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, shiftId, actorName, isSecondary, offeredShift, requestedShifts, shiftDate } = body as Record<string, unknown>

  if (type === 'new_shift' && typeof isSecondary !== 'boolean') {
    return NextResponse.json({ error: 'isSecondary must be boolean' }, { status: 400 })
  }

  function formatDate(dateStr: string) {
    const [, mm, dd] = dateStr.split('-')
    return `${dd}/${mm}`
  }

  if (type === 'new_shift') {
    // Notify all users in same category who have notify_on_new_shift = true, excluding the actor
    const { data: targets } = await supabase
      .from('users')
      .select('id')
      .eq('is_secondary', isSecondary)
      .eq('notify_on_new_shift', true)
      .neq('id', user.id)

    if (targets?.length) {
      const title = 'Nuovo turno disponibile'
      const dateLabel = shiftDate ? formatDate(shiftDate as string) : ''
      const requestedLabel = Array.isArray(requestedShifts) ? (requestedShifts as string[]).join('/') : ''
      const msgBody = dateLabel
        ? `${actorName} cede ${offeredShift} il ${dateLabel}, cerca ${requestedLabel}`
        : `${actorName} ha pubblicato un nuovo scambio turno`
      const payload = JSON.stringify({ title, body: msgBody, type: 'new_shift', shiftId: shiftId ? Number(shiftId) : null })

      await Promise.allSettled(
        targets.map(async (t) => {
          const { data: subs } = await supabase
            .from('push_subscriptions')
            .select('subscription, endpoint')
            .eq('user_id', t.id)

          if (!subs?.length) return

          const staleEndpoints: string[] = []
          await Promise.allSettled(
            subs.map(async ({ subscription, endpoint }) => {
              try {
                await webpush.sendNotification(subscription as webpush.PushSubscription, payload)
              } catch (err: unknown) {
                const code = (err as { statusCode?: number })?.statusCode
                if (code === 410 || code === 404) staleEndpoints.push(endpoint as string)
              }
            })
          )
          if (staleEndpoints.length) {
            await supabase.from('push_subscriptions').delete()
              .in('endpoint', staleEndpoints).eq('user_id', t.id)
          }
        })
      )
    }
  } else if (type === 'interest') {
    // Notify the shift owner if they have notify_on_interest = true
    if (!shiftId) return NextResponse.json({ error: 'Missing shiftId' }, { status: 400 })

    const { data: shift } = await supabase
      .from('shifts')
      .select('user_id, offered_shift, shift_date, requested_shifts')
      .eq('id', Number(shiftId))
      .single()

    if (!shift) return NextResponse.json({ sent: 0 })

    const { data: owner } = await supabase
      .from('users')
      .select('id, notify_on_interest')
      .eq('id', shift.user_id)
      .single()

    if (!owner?.notify_on_interest) return NextResponse.json({ sent: 0 })

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription, endpoint')
      .eq('user_id', owner.id)

    if (!subs?.length) return NextResponse.json({ sent: 0 })

    const title = 'Nuovo interesse al tuo turno'
    const dateLabel = shift.shift_date ? formatDate(shift.shift_date as string) : ''
    const requestedLabel = Array.isArray(shift.requested_shifts) ? (shift.requested_shifts as string[]).join('/') : ''
    const msgBody = dateLabel
      ? `${actorName} è interessato al tuo ${shift.offered_shift} del ${dateLabel} (cerca ${requestedLabel})`
      : `${actorName} è interessato al tuo scambio`
    const payload = JSON.stringify({ title, body: msgBody, type: 'interest', shiftId: Number(shiftId) })

    const staleEndpoints: string[] = []
    await Promise.allSettled(
      subs.map(async ({ subscription, endpoint }) => {
        try {
          await webpush.sendNotification(subscription as webpush.PushSubscription, payload)
        } catch (err: unknown) {
          const code = (err as { statusCode?: number })?.statusCode
          if (code === 410 || code === 404) staleEndpoints.push(endpoint as string)
        }
      })
    )
    if (staleEndpoints.length) {
      await supabase.from('push_subscriptions').delete()
        .in('endpoint', staleEndpoints).eq('user_id', owner.id)
    }
  }

  return NextResponse.json({ ok: true })
}
