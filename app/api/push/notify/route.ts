import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pushToUser } from '@/lib/push/send-to-user'
import { loadNotifOverrides, messageFor } from '@/lib/push/send-with-template'
import { formatDateShort } from '@/lib/utils'
import { VACATION_PERIOD_LABELS_SHORT } from '@/lib/vacations'
import { getUserShiftOnDate, userCoversRequest } from '@/lib/shift-compat'
import type { VacationPeriod, ShiftType } from '@/types/database'

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
      .select('id, is_secondary, is_dco_plus, notify_on_cross_shifts, notify_shift_filter')
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

    // Filtro «solo se posso coprirlo» (richiesta 12/09/2026): l'utente riceve la
    // notifica solo se il SUO turno del giorno offerto (reale dal PDF, altrimenti
    // teorico) è fra i turni cercati dalla richiesta. I richiedenti senza filtro
    // restano fuori da questo controllo.
    const requestedList = Array.isArray(requestedShifts) ? (requestedShifts as ShiftType[]) : []
    const filterIds = eligible.filter(t => t.notify_shift_filter === true).map(t => t.id)
    // Del turno trovato si tiene anche QUALE turno è: il messaggio dedicato lo
    // dice all'utente («quel giorno sei in …»), come fa l'interesse compatibile.
    const compatByUser = new Map<string, { copre: boolean; shift: ShiftType | null }>()
    if (filterIds.length && shiftDate && typeof shiftDate === 'string' && requestedList.length) {
      await Promise.all(filterIds.map(async id => {
        const mine = await getUserShiftOnDate(supabase, id, shiftDate)
        compatByUser.set(id, { copre: userCoversRequest(mine.shift, requestedList), shift: mine.shift })
      }))
    }

    if (eligible.length) {
      const dateLabel = shiftDate ? formatDateShort(shiftDate as string) : ''
      // Applica il filtro di compatibilità (default false = riceve tutto, come prima).
      const finalTargets = eligible.filter(t =>
        t.notify_shift_filter !== true || compatByUser.get(t.id)?.copre === true,
      )
      const requestedLabel = Array.isArray(requestedShifts) ? (requestedShifts as string[]).join('/') : ''
      // Testo da registry (override admin → default), con caduta «senza data».
      const overrides = await loadNotifOverrides()
      const actor = typeof actorName === 'string' ? actorName : ''
      const offered = typeof offeredShift === 'string' ? offeredShift : ''
      const generico = dateLabel
        ? messageFor(overrides, 'new_shift.title', {
            cognome_attore: actor, data: dateLabel, turno: offered, turno_cercati: requestedLabel,
          })
        : messageFor(overrides, 'new_shift.fallback.title', { cognome_attore: actor })
      // Il messaggio si sceglie PER DESTINATARIO: chi è passato attraverso il filtro
      // «solo se posso coprirlo» riceve il testo DEDICATO, che spiega perché lo sta
      // ricevendo e gli dice il proprio turno di quel giorno. Prima il filtro agiva
      // e il testo restava generico (richiesta 25/09/2026).
      await Promise.allSettled(finalTargets.map(t => {
        const compat = t.notify_shift_filter === true ? compatByUser.get(t.id) : undefined
        const msg = dateLabel && compat?.copre && compat.shift
          ? messageFor(overrides, 'new_shift.compatible.title', {
              cognome_attore: actor, turno: offered, data: dateLabel,
              turno_effettivo: compat.shift, turno_cercati: requestedLabel,
            })
          : generico
        return pushToUser(t.id, {
          title: msg.title,
          body: msg.body,
          type: 'new_shift',
          shiftId: shiftId ? Number(shiftId) : null,
        })
      }))
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
    // Testo da registry (override admin → default), con caduta «senza dettagli».
    const overrides = await loadNotifOverrides()
    const actor = typeof actorName === 'string' ? actorName : ''
    const offered = (shift.offered_shift as string) ?? ''

    // L'INTERESSE NON È FILTRATO — e non ha un messaggio «compatibile» (25/09/2026).
    // Il filtro «solo se posso coprirlo» serve a chi riceve una PROPOSTA NUOVA altrui:
    // lì dire «quel giorno sei in X, uno dei turni che cerca» spiega perché la
    // notifica arriva. Sull'INTERESSE la compatibilità è implicita nel gesto: chi si
    // interessa alla mia proposta mi dà uno dei turni che ho chiesto, quindi non c'è
    // niente da filtrare né da spiegare — la variante dedicata era codice morto.
    const msg = dateLabel
      ? messageFor(overrides, 'interest.title', {
          cognome_attore: actor, turno: offered, data: dateLabel, turno_cercati: requestedLabel,
        })
      : messageFor(overrides, 'interest.fallback.title', { cognome_attore: actor })
    await pushToUser(owner.id, {
      title: msg.title,
      body: msg.body,
      type: 'interest',
      shiftId: Number(shiftId),
    })
  } else if (type === 'vacation_interest') {
    if (!requestId) return NextResponse.json({ error: 'Missing requestId' }, { status: 400 })

    const { data: vacReq } = await supabase
      .from('vacation_requests')
      .select('user_id, offered_period, target_periods, year')
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
    // Anno NUDO e preso dalla RICHIESTA (colonna NOT NULL), non dal corpo della
    // richiesta HTTP: così è sempre presente e il testo non dipende dal client.
    // Le parentesi, dove servono, stanno nel template (vedi la convenzione in
    // lib/notification-templates.ts) — e l'anteprima del pannello debug è lo
    // stesso testo che l'utente riceve.
    const yearLabel = vacReq.year ? String(vacReq.year) : (year ? String(year) : '')
    const overrides = await loadNotifOverrides()
    const msg = messageFor(overrides, 'vacation_interest.title', {
      cognome_attore: typeof actorName === 'string' ? actorName : '', periodo: offeredLabel, anno: yearLabel,
    })
    await pushToUser(owner.id, {
      title: msg.title,
      body: msg.body,
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
      const nvYearLabel = year ? String(year) : ''
      const overrides = await loadNotifOverrides()
      const msg = messageFor(overrides, 'new_vacation.title', {
        cognome_attore: typeof actorName === 'string' ? actorName : '', periodo: offLabel, periodo_cercati: tgLabel, anno: nvYearLabel,
      })
      const payload = {
        title: msg.title,
        body: msg.body,
        type: 'new_vacation',
        requestId: requestId ? Number(requestId) : null,
      }
      await Promise.allSettled(targets.map(t => pushToUser(t.id, payload)))
    }
  }

  return NextResponse.json({ ok: true })
}
