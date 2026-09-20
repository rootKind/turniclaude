import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { isAdmin } from '@/types/database'
import type { SalaShiftType, ShiftType } from '@/types/database'
import {
  SHIFT_TO_SALA,
  actualShiftsForUserDate,
  computeShiftCleanup,
  loadRealDayStates,
  loadShiftLookupContextWithTree,
  type ShiftLookupContext,
} from '@/lib/queries/shift-cleanup'
import { fuoriSalaInfo } from '@/lib/sala-month'
import { pushToUser } from '@/lib/push/send-to-user'
import { loadNotifOverrides, messageFor } from '@/lib/push/send-with-template'
import { formatDateShort } from '@/lib/utils'

export const runtime = 'nodejs'

const ACTUAL_LABEL: Record<SalaShiftType, ShiftType> = {
  M: 'Mattina',
  P: 'Pomeriggio',
  N: 'Notte',
}

interface ShiftRow {
  id: number
  user_id: string
  offered_shift: ShiftType
  shift_date: string
  requested_shifts: ShiftType[]
}

/**
 * Admin/manager: verifica le richieste di cambio già esaudite dal calendario
 * caricato (GET = anteprima) e le elimina (POST = conferma).
 */
async function canManage(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  if (isAdmin(user.id)) return true
  const { data: profile } = await supabase.from('users').select('is_manager').eq('id', user.id).single()
  return !!profile?.is_manager
}

export async function GET(req: NextRequest) {
  if (!(await canManage())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const month = req.nextUrl.searchParams.get('month')
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month (YYYY-MM)' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const candidates = await computeShiftCleanup(supabase, month)
    return NextResponse.json({ candidates, count: candidates.length })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!(await canManage())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  let body: { ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map(Number).filter(n => Number.isFinite(n))
    : []
  if (ids.length === 0) {
    return NextResponse.json({ error: 'Missing ids' }, { status: 400 })
  }

  // RLS consente di eliminare solo le proprie richieste: serve il client admin.
  const admin = createAdminSupabase()

  // Servono i dati della richiesta per poter spiegare la cancellazione all'utente.
  const { data: rows, error: fetchError } = await admin
    .from('shifts')
    .select('id, user_id, offered_shift, shift_date, requested_shifts')
    .in('id', ids)
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }
  const shifts = (rows ?? []) as ShiftRow[]
  const shiftIds = shifts.map(s => s.id)

  // Gli interessi vanno letti PRIMA del delete: la FK li cancella a cascata.
  const interestedByShift = new Map<number, string[]>()
  if (shiftIds.length) {
    const { data: interests } = await admin
      .from('shift_interested_users')
      .select('shift_id, user_id')
      .in('shift_id', shiftIds)
    for (const i of (interests ?? []) as { shift_id: number; user_id: string }[]) {
      const list = interestedByShift.get(i.shift_id) ?? []
      list.push(i.user_id)
      interestedByShift.set(i.shift_id, list)
    }
  }

  // Turni reali (richiedente e interessati) dal calendario caricato.
  const months = [...new Set(shifts.map(s => s.shift_date.slice(0, 7)))]
  let ctx: ShiftLookupContext = {
    duplicateCognomi: new Set(),
    usersById: new Map(),
    schedules: new Map(),
  }
  try {
    // Variante con albero: aggiunge la mappa bare-owner degli omonimi (NEVANO).
    ctx = await loadShiftLookupContextWithTree(admin, months)
  } catch (err) {
    console.error('Shift cleanup: contesto turni non disponibile', err)
  }
  const userLabel = (userId: string) => {
    const u = ctx.usersById.get(userId)
    return u ? [u.cognome, u.nome].filter(Boolean).join(' ') : 'un collega'
  }

  // La riga REALE di ogni giorno ripulito (dalla forma v2 del mese): una
  // richiesta può sparire perché il cambio è già avvenuto, oppure perché quel
  // giorno la persona è fuori sala (assenza o attività senza sezione). Il testo
  // della notifica cambia con il motivo, quindi il motivo va ricostruito QUI.
  // Le celle GIALLE non entrano mai: sono ipotesi, e le righe che arrivano qui
  // sono già state ripulite solo su celle confermate (la conferma può arrivare
  // con giorni di distanza dal caricamento: si ricontrolla, non si presume).
  let dayStates = new Map<string, { token: string; pending: boolean }>()
  try {
    dayStates = await loadRealDayStates(admin, shifts, [...ctx.usersById.values()], ctx.bareOwners)
  } catch (err) {
    console.error('Shift cleanup: righe reali del giorno non disponibili', err)
  }
  const fuoriSalaOf = (s: ShiftRow) => {
    const state = dayStates.get(`${s.user_id}|${s.shift_date}`)
    return state?.pending ? null : fuoriSalaInfo(state?.token)
  }

  const { error } = await admin.from('shifts').delete().in('id', ids)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Notifiche ────────────────────────────────────────────────────────────
  // Una notifica per utente: prima i richiedenti (più rilevante nel caso in cui
  // un interessato sia anche autore di una richiesta ripulita), poi gli interessati.
  // Testi da registry: override admin (app_settings) → default del codice.
  const overrides = await loadNotifOverrides()
  const payloads = new Map<string, { title: string; body: string }>()

  const byUser = new Map<string, ShiftRow[]>()
  for (const s of shifts) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s)
    byUser.set(s.user_id, list)
  }
  for (const [userId, userShifts] of byUser) {
    // Una richiesta ripulita per persona: se almeno una è «fuori sala» è QUELLA
    // che spiega meglio la sparizione (quel giorno non c'era niente da cedere),
    // quindi vince sulle altre, il cui numero resta comunque detto da {extra}.
    let fuori: ShiftRow | null = null
    let info: ReturnType<typeof fuoriSalaInfo> = null
    for (const s of userShifts) {
      const f = fuoriSalaOf(s)
      if (f) { fuori = s; info = f; break }
    }
    const first = fuori ?? userShifts[0]
    const dateLabel = formatDateShort(first.shift_date)
    const requestedLabel = (first.requested_shifts ?? []).join('/')
    const actual = fuori ? null : actualShiftsForUserDate(ctx, first.user_id, first.shift_date)
      .find(a => (first.requested_shifts ?? []).some(r => SHIFT_TO_SALA[r] === a))
    const actualLabel = actual ? ACTUAL_LABEL[actual] : null
    // Nudo: lo spazio prima di {extra} sta nel template (convenzione in
    // lib/notification-templates.ts).
    const extra = userShifts.length > 1 ? `(e altre ${userShifts.length - 1} richieste)` : ''
    // {dettaglio} spiega il caso specifico: turno trovato nel calendario o
    // «già assegnato»; {extra} elenca le altre richieste ripulite, se ci sono.
    // Per il giorno fuori sala il testo è un ALTRO (cleanup.fuori_sala), con
    // {giorno_fuori_sala} + {codice_giorno}: la modifica l'admin dal pannello.
    const msg = info
      ? messageFor(overrides, 'cleanup.fuori_sala.title', {
          data: dateLabel, turno: first.offered_shift, turno_cercati: requestedLabel,
          giorno_fuori_sala: info.label, codice_giorno: info.code, extra,
        })
      : messageFor(overrides, 'cleanup.done.title', {
          data: dateLabel, turno: first.offered_shift, turno_cercati: requestedLabel,
          dettaglio: actualLabel
            ? `nel turno caricato risulti già in ${actualLabel}`
            : 'il turno richiesto risulta già assegnato',
          extra,
        })
    payloads.set(userId, { title: msg.title, body: msg.body })
  }

  for (const s of shifts) {
    const ceduto = SHIFT_TO_SALA[s.offered_shift]
    const dateLabel = formatDateShort(s.shift_date)
    const requestedLabel = (s.requested_shifts ?? []).join('/')
    // Motivo di QUESTA richiesta, per gli interessati: se il richiedente quel
    // giorno è fuori sala non c'è nessun cambio da fare, e va detto con il testo
    // dedicato (prima degli altri due: un turno non cedibile non ha né partner né
    // «non più disponibile» generico).
    const info = fuoriSalaOf(s)
    for (const userId of interestedByShift.get(s.id) ?? []) {
      if (payloads.has(userId)) continue
      // Se l'interessato compare nel calendario nel turno che il richiedente
      // cedeva, allora il cambio è stato fatto proprio con lui.
      const isPartner = !info && actualShiftsForUserDate(ctx, userId, s.shift_date).includes(ceduto)
      const msg = info
        ? messageFor(overrides, 'cleanup.fuori_sala.gone.title', {
            turno: s.offered_shift, turno_cercati: requestedLabel, data: dateLabel,
            cognome_attore: userLabel(s.user_id),
            giorno_fuori_sala: info.label, codice_giorno: info.code,
          })
        : isPartner
          ? messageFor(overrides, 'cleanup.partner.title', {
              data: dateLabel, cognome_attore: userLabel(s.user_id), turno: s.offered_shift,
            })
          : messageFor(overrides, 'cleanup.gone.title', {
              turno: s.offered_shift, turno_cercati: requestedLabel, data: dateLabel, cognome_attore: userLabel(s.user_id),
            })
      payloads.set(userId, { title: msg.title, body: msg.body })
    }
  }

  const results = await Promise.allSettled(
    // Pulizia dei cambi (admin): tipo 'cleanup' → sezione «Pulizia cambi turno»
    // in bacheca, non più mescolata alle comunicazioni admin (NOTIF_TYPES).
    [...payloads.entries()].map(([userId, p]) => pushToUser(userId, { ...p, type: 'cleanup' })),
  )
  const notified = results.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value : 0), 0)

  return NextResponse.json({ ok: true, deleted: ids.length, notified })
}
