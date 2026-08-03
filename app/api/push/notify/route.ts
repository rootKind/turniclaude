import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pushToUser } from '@/lib/push/send-to-user'
import { formatDateShort } from '@/lib/utils'
import { VACATION_PERIOD_LABELS_SHORT } from '@/lib/vacations'
import type { VacationPeriod } from '@/types/database'

const KNOWN_TYPES = ['new_shift', 'interest', 'vacation_interest', 'new_vacation']

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, shiftId, actorName, isSecondary, offeredShift, requestedShifts, shiftDate, requestId, offeredPeriod, targetPeriods, year } = body as Record<string, unknown>

  if (type === 'new_shift' && typeof isSecondary !== 'boolean') {
    return NextResponse.json({ error: 'isSecondary must be boolean' }, { status: 400 })
  }
  if (type === 'new_vacation' && typeof isSecondary !== 'boolean') {
    return NextResponse.json({ error: 'isSecondary must be boolean' }, { status: 400 })
  }

  if (typeof type !== 'string' || !KNOWN_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Unknown notification type' }, { status: 400 })
  }

  if (type === 'new_shift') {
    // Chi può vedere il turno appena pubblicato (regole DCO+):
    // - DCO+ che pubblica → tutti (DCO + Noni)
    // - Noni che pubblica → Noni + DCO+
    // - DCO normale che pubblica → solo DCO (comportamento attuale)
    const { data: actor } = await supabase
      .from('users')
      .select('is_secondary, is_dco_plus')
      .eq('id', user.id)
      .single()

    if (!actor) {
      return NextResponse.json({ error: 'Actor profile not found' }, { status: 500 })
    }

    const actorIsNoni = actor.is_secondary === true
    const actorIsDcoPlus = actor.is_dco_plus === true

    const visibilityFilter = actorIsDcoPlus
      ? 'or(is_secondary.eq.true,is_secondary.eq.false)'
      : actorIsNoni
        ? 'or(is_secondary.eq.true,is_dco_plus.eq.true)'
        : 'is_secondary.eq.false'

    // Notify everyone who can see it, with master switch + new-shift opt-in, excluding the actor
    const { data: targets } = await supabase
      .from('users')
      .select('id, is_secondary, is_dco_plus, notify_on_cross_shifts')
      .eq('notification_enabled', true)
      .eq('notify_on_new_shift', true)
      .neq('id', user.id)
      .or(visibilityFilter)

    // Chi riceve i turni dell'ALTRO gruppo deve avere il toggle notify_on_cross_shifts attivo
    const eligible = (targets ?? []).filter(t => {
      if (actorIsDcoPlus && t.is_secondary === true) return t.notify_on_cross_shifts === true
      if (actorIsNoni && t.is_dco_plus === true) return t.notify_on_cross_shifts === true
      return true
    })

    if (eligible.length) {
      const dateLabel = shiftDate ? formatDateShort(shiftDate as string) : ''
      const requestedLabel = Array.isArray(requestedShifts) ? (requestedShifts as string[]).join('/') : ''
      const payload = {
        title: 'Nuovo turno disponibile',
        body: dateLabel
          ? `${actorName} cede ${offeredShift} il ${dateLabel}, cerca ${requestedLabel}`
          : `${actorName} ha pubblicato un nuovo cambio turno`,
        type: 'new_shift',
        shiftId: shiftId ? Number(shiftId) : null,
      }
      await Promise.allSettled(eligible.map(t => pushToUser(t.id, payload)))
    }
  } else if (type === 'interest') {
    // Notify the shift owner if they have the master switch + interest opt-in
    if (!shiftId) return NextResponse.json({ error: 'Missing shiftId' }, { status: 400 })

    const { data: shift } = await supabase
      .from('shifts')
      .select('user_id, offered_shift, shift_date, requested_shifts')
      .eq('id', Number(shiftId))
      .single()

    if (!shift) return NextResponse.json({ sent: 0 })

    const { data: owner } = await supabase
      .from('users')
      .select('id, notify_on_interest, notification_enabled')
      .eq('id', shift.user_id)
      .single()

    if (!owner || owner.notification_enabled === false || !owner.notify_on_interest) {
      return NextResponse.json({ sent: 0 })
    }

    const dateLabel = shift.shift_date ? formatDateShort(shift.shift_date as string) : ''
    const requestedLabel = Array.isArray(shift.requested_shifts) ? (shift.requested_shifts as string[]).join('/') : ''
    await pushToUser(owner.id, {
      title: 'Nuovo interesse al tuo turno',
      body: dateLabel
        ? `${actorName} è interessato al tuo ${shift.offered_shift} del ${dateLabel} (cerca ${requestedLabel})`
        : `${actorName} è interessato al tuo cambio`,
      type: 'interest',
      shiftId: Number(shiftId),
    })
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

    const offeredLabel = VACATION_PERIOD_LABELS_SHORT[vacReq.offered_period as VacationPeriod] ?? `Periodo ${vacReq.offered_period}`
    const yearLabel = year ? ` ${year}` : ''
    await pushToUser(owner.id, {
      title: 'Qualcuno è interessato al tuo cambio ferie',
      body: `${actorName} è interessato al tuo ${offeredLabel}${yearLabel}`,
      type: 'vacation_interest',
      requestId: Number(requestId),
    })
  } else if (type === 'new_vacation') {
    const { data: targets } = await supabase
      .from('users')
      .select('id')
      .eq('is_secondary', isSecondary)
      .eq('notification_enabled', true)
      .eq('notify_on_new_vacation', true)
      .neq('id', user.id)

    if (targets?.length) {
      const offLabel = VACATION_PERIOD_LABELS_SHORT[offeredPeriod as VacationPeriod] ?? `Periodo ${offeredPeriod}`
      const tgLabel = Array.isArray(targetPeriods) && (targetPeriods as number[]).length >= 5
        ? 'qualsiasi periodo'
        : ((targetPeriods as number[]) ?? []).map(p => VACATION_PERIOD_LABELS_SHORT[p as VacationPeriod] ?? `P${p}`).join(', ')
      const nvYearLabel = year ? ` (${year})` : ''
      const payload = {
        title: 'Nuovo cambio ferie disponibile',
        body: `${actorName} offre ${offLabel} in cambio di ${tgLabel}${nvYearLabel}`,
        type: 'new_vacation',
        requestId: requestId ? Number(requestId) : null,
      }
      await Promise.allSettled(targets.map(t => pushToUser(t.id, payload)))
    }
  }

  return NextResponse.json({ ok: true })
}
