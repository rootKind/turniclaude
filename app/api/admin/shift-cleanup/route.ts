import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { isAdmin } from '@/types/database'
import type { SalaShiftType, ShiftType } from '@/types/database'
import {
  SHIFT_TO_SALA,
  actualShiftsForUserDate,
  computeShiftCleanup,
  loadShiftLookupContextWithTree,
  type ShiftLookupContext,
} from '@/lib/queries/shift-cleanup'
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
    const first = userShifts[0]
    const dateLabel = formatDateShort(first.shift_date)
    const requestedLabel = (first.requested_shifts ?? []).join('/')
    const actual = actualShiftsForUserDate(ctx, first.user_id, first.shift_date)
      .find(a => (first.requested_shifts ?? []).some(r => SHIFT_TO_SALA[r] === a))
    const actualLabel = actual ? ACTUAL_LABEL[actual] : null
    const extra = userShifts.length > 1 ? ` (e altre ${userShifts.length - 1} richieste)` : ''
    // {dettaglio} spiega il caso specifico: turno trovato nel calendario o
    // «già assegnato»; {extra} elenca le altre richieste ripulite, se ci sono.
    const msg = messageFor(overrides, 'cleanup.done.title', {
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
    for (const userId of interestedByShift.get(s.id) ?? []) {
      if (payloads.has(userId)) continue
      // Se l'interessato compare nel calendario nel turno che il richiedente
      // cedeva, allora il cambio è stato fatto proprio con lui.
      const isPartner = actualShiftsForUserDate(ctx, userId, s.shift_date).includes(ceduto)
      const msg = isPartner
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
    [...payloads.entries()].map(([userId, p]) => pushToUser(userId, { ...p, type: 'system' })),
  )
  const notified = results.reduce((n, r) => n + (r.status === 'fulfilled' ? r.value : 0), 0)

  return NextResponse.json({ ok: true, deleted: ids.length, notified })
}
