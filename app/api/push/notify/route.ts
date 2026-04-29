import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendToUser(supabase: any, userId: string, payload: string) {
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('subscription, endpoint')
    .eq('user_id', userId)

  if (!subs?.length) return

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
    await supabase.from('push_subscriptions').delete().in('endpoint', stale).eq('user_id', userId)
  }
}

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

  const { type, shiftId, actorName, isSecondary, offeredShift, requestedShifts, shiftDate, requestId, offeredPeriod, targetPeriods, year,
    // manager action fields
    targetUserId, managerName, reason, creatorUserId, winnerUserId, otherUserIds,
  } = body as Record<string, unknown>

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
        : `${actorName} ha pubblicato un nuovo cambio turno`
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
      : `${actorName} è interessato al tuo cambio`
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

  } else if (type === 'vacation_interest') {
    if (!requestId) return NextResponse.json({ error: 'Missing requestId' }, { status: 400 })

    const { data: vacReq } = await supabase
      .from('vacation_requests')
      .select('user_id, offered_period, target_periods')
      .eq('id', Number(requestId))
      .single()

    if (!vacReq) return NextResponse.json({ sent: 0 })

    const { data: owner } = await supabase
      .from('users')
      .select('id, notify_on_vacation_interest, notification_enabled')
      .eq('id', vacReq.user_id)
      .single()

    if (!owner || owner.notification_enabled === false || owner.notify_on_vacation_interest === false) {
      return NextResponse.json({ sent: 0 })
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription, endpoint')
      .eq('user_id', owner.id)

    if (!subs?.length) return NextResponse.json({ sent: 0 })

    const periodLabels: Record<number, string> = {
      1: '16–30 Giu', 2: '01–15 Lug', 3: '16–31 Lug',
      4: '01–15 Ago', 5: '16–31 Ago', 6: '01–15 Set',
    }
    const offeredLabel = periodLabels[vacReq.offered_period as number] ?? `Periodo ${vacReq.offered_period}`
    const yearLabel = year ? ` ${year}` : ''
    const vacPayload = JSON.stringify({
      title: 'Qualcuno è interessato al tuo cambio ferie',
      body: `${actorName} è interessato al tuo ${offeredLabel}${yearLabel}`,
      type: 'vacation_interest',
      requestId: Number(requestId),
    })

    const staleVac: string[] = []
    await Promise.allSettled(
      subs.map(async ({ subscription, endpoint }) => {
        try {
          await webpush.sendNotification(subscription as webpush.PushSubscription, vacPayload)
        } catch (err: unknown) {
          const code = (err as { statusCode?: number })?.statusCode
          if (code === 410 || code === 404) staleVac.push(endpoint as string)
        }
      })
    )
    if (staleVac.length) {
      await supabase.from('push_subscriptions').delete()
        .in('endpoint', staleVac).eq('user_id', owner.id)
    }
  } else if (type === 'new_vacation') {
    if (typeof isSecondary !== 'boolean') {
      return NextResponse.json({ error: 'isSecondary must be boolean' }, { status: 400 })
    }

    const { data: targets } = await supabase
      .from('users')
      .select('id')
      .eq('is_secondary', isSecondary)
      .eq('notification_enabled', true)
      .eq('notify_on_new_vacation', true)
      .neq('id', user.id)

    if (targets?.length) {
      const periodLabels: Record<number, string> = {
        1: '16–30 Giu', 2: '01–15 Lug', 3: '16–31 Lug',
        4: '01–15 Ago', 5: '16–31 Ago', 6: '01–15 Set',
      }
      const offLabel = periodLabels[offeredPeriod as number] ?? `Periodo ${offeredPeriod}`
      const tgLabel = Array.isArray(targetPeriods) && (targetPeriods as number[]).length >= 5
        ? 'qualsiasi periodo'
        : (targetPeriods as number[] ?? []).map(p => periodLabels[p] ?? `P${p}`).join(', ')
      const nvYearLabel = year ? ` (${year})` : ''
      const nvPayload = JSON.stringify({
        title: 'Nuovo cambio ferie disponibile',
        body: `${actorName} offre ${offLabel} in cambio di ${tgLabel}${nvYearLabel}`,
        type: 'new_vacation',
        requestId: requestId ? Number(requestId) : null,
      })

      await Promise.allSettled(
        targets.map(async (t) => {
          const { data: subs } = await supabase
            .from('push_subscriptions')
            .select('subscription, endpoint')
            .eq('user_id', t.id)

          if (!subs?.length) return

          const staleNV: string[] = []
          await Promise.allSettled(
            subs.map(async ({ subscription, endpoint }) => {
              try {
                await webpush.sendNotification(subscription as webpush.PushSubscription, nvPayload)
              } catch (err: unknown) {
                const code = (err as { statusCode?: number })?.statusCode
                if (code === 410 || code === 404) staleNV.push(endpoint as string)
              }
            })
          )
          if (staleNV.length) {
            await supabase.from('push_subscriptions').delete()
              .in('endpoint', staleNV).eq('user_id', t.id)
          }
        })
      )
    }
  }

  } else if (type === 'manager_shift_reject') {
    if (!targetUserId) return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 })
    const dateLabel = shiftDate ? formatDate(shiftDate as string) : ''
    const reasonStr = typeof reason === 'string' && reason ? ` per: ${reason}` : ''
    const body = `Il turnista ha cancellato la tua richiesta di cambio ${offeredShift ?? ''}${dateLabel ? ` del ${dateLabel}` : ''}${reasonStr}`
    await sendToUser(supabase, targetUserId as string, JSON.stringify({
      title: 'Richiesta di cambio cancellata',
      body,
      type: 'system',
    }))

  } else if (type === 'manager_shift_confirm') {
    if (!creatorUserId) return NextResponse.json({ error: 'Missing creatorUserId' }, { status: 400 })
    const dateLabel = shiftDate ? formatDate(shiftDate as string) : ''

    if (winnerUserId) {
      // Load winner name
      const { data: winnerProfile } = await supabase
        .from('users')
        .select('nome, cognome')
        .eq('id', winnerUserId as string)
        .single()
      const winnerName = winnerProfile ? `${winnerProfile.cognome ?? ''} ${winnerProfile.nome ?? ''}`.trim() : 'un collega'

      // Load creator name
      const { data: creatorProfile } = await supabase
        .from('users')
        .select('nome, cognome')
        .eq('id', creatorUserId as string)
        .single()
      const creatorName = creatorProfile ? `${creatorProfile.cognome ?? ''} ${creatorProfile.nome ?? ''}`.trim() : 'un collega'

      const confirmedBody = `Il turnista ha approvato la richiesta di cambio ${offeredShift ?? ''}${dateLabel ? ` del ${dateLabel}` : ''} con ${winnerName}`
      const confirmedPayload = JSON.stringify({ title: 'Cambio turno approvato', body: confirmedBody, type: 'system' })
      await sendToUser(supabase, creatorUserId as string, confirmedPayload)

      const winnerBody = `Il turnista ha approvato il cambio ${offeredShift ?? ''}${dateLabel ? ` del ${dateLabel}` : ''} con ${creatorName}`
      await sendToUser(supabase, winnerUserId as string, JSON.stringify({ title: 'Cambio turno approvato', body: winnerBody, type: 'system' }))
    }

    // Notify other interested users
    if (Array.isArray(otherUserIds)) {
      const othersPayload = JSON.stringify({
        title: 'Cambio turno assegnato ad altri',
        body: 'Il tuo interesse è stato superato: è stato fatto il cambio con altri interessati.',
        type: 'system',
      })
      await Promise.allSettled((otherUserIds as string[]).map(id => sendToUser(supabase, id, othersPayload)))
    }

  } else if (type === 'manager_vacation_reject') {
    if (!targetUserId) return NextResponse.json({ error: 'Missing targetUserId' }, { status: 400 })
    const periodLabels: Record<number, string> = {
      1: '16–30 Giu', 2: '01–15 Lug', 3: '16–31 Lug',
      4: '01–15 Ago', 5: '16–31 Ago', 6: '01–15 Set',
    }
    const periodLabel = periodLabels[offeredPeriod as number] ?? `Periodo ${offeredPeriod}`
    const yearLabel = year ? ` (${year})` : ''
    const reasonStr = typeof reason === 'string' && reason ? ` per: ${reason}` : ''
    const body = `Il turnista ha cancellato la tua richiesta di cambio ferie ${periodLabel}${yearLabel}${reasonStr}`
    await sendToUser(supabase, targetUserId as string, JSON.stringify({
      title: 'Richiesta di cambio ferie cancellata',
      body,
      type: 'system',
    }))

  } else if (type === 'manager_vacation_confirm') {
    if (!creatorUserId) return NextResponse.json({ error: 'Missing creatorUserId' }, { status: 400 })
    const periodLabels: Record<number, string> = {
      1: '16–30 Giu', 2: '01–15 Lug', 3: '16–31 Lug',
      4: '01–15 Ago', 5: '16–31 Ago', 6: '01–15 Set',
    }
    const periodLabel = periodLabels[offeredPeriod as number] ?? `Periodo ${offeredPeriod}`
    const yearLabel = year ? ` (${year})` : ''

    if (winnerUserId) {
      const { data: winnerProfile } = await supabase
        .from('users')
        .select('nome, cognome')
        .eq('id', winnerUserId as string)
        .single()
      const winnerName = winnerProfile ? `${winnerProfile.cognome ?? ''} ${winnerProfile.nome ?? ''}`.trim() : 'un collega'

      const { data: creatorProfile } = await supabase
        .from('users')
        .select('nome, cognome')
        .eq('id', creatorUserId as string)
        .single()
      const creatorName = creatorProfile ? `${creatorProfile.cognome ?? ''} ${creatorProfile.nome ?? ''}`.trim() : 'un collega'

      const creatorBody = `Il turnista ha approvato il tuo cambio ferie ${periodLabel}${yearLabel} con ${winnerName}`
      await sendToUser(supabase, creatorUserId as string, JSON.stringify({ title: 'Cambio ferie approvato', body: creatorBody, type: 'system' }))

      const winnerBody = `Il turnista ha approvato il cambio ferie ${periodLabel}${yearLabel} con ${creatorName}`
      await sendToUser(supabase, winnerUserId as string, JSON.stringify({ title: 'Cambio ferie approvato', body: winnerBody, type: 'system' }))
    }

    if (Array.isArray(otherUserIds)) {
      const othersPayload = JSON.stringify({
        title: 'Cambio ferie assegnato ad altri',
        body: 'Il tuo interesse è stato superato: è stato fatto il cambio con altri interessati.',
        type: 'system',
      })
      await Promise.allSettled((otherUserIds as string[]).map(id => sendToUser(supabase, id, othersPayload)))
    }
  }

  return NextResponse.json({ ok: true })
}
