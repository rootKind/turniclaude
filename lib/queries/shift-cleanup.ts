import type { SupabaseClient } from '@supabase/supabase-js'
import type { DaySchedule, SalaShiftType, ShiftType, UserProfile } from '@/types/database'
import { buildDuplicateCognomi, matchesCognome } from '@/lib/utils'
import { buildBareOwners } from '@/lib/shift-teams-matching'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { buildScheduleFromMonthData, isSalaMonthData } from '@/lib/sala-month'
// La mappa vive in lib/shift-tokens (modulo senza dipendenze server): la usa anche
// il client, per saltare dalla card di un cambio al turno della board. Qui si
// ri-esporta per non cambiare i punti di import esistenti.
import { SHIFT_TO_SALA } from '@/lib/shift-tokens'
export { SHIFT_TO_SALA }

/**
 * La colonna `sala_schedule.schedule` contiene il formato compatto v2
 * ({v, days, rows, codes, names}): qui lo si espande nella mappa per giorno.
 * BUG fix 13/09/2026: prima si riusava il raw così com'è, quindi
 * `schedule[day]` era sempre undefined e la pulizia non trovava MAI candidati
 * (funzionava solo nell'upload, dove la schedule arriva già espansa).
 */
function decodeScheduleRow(raw: unknown): Record<number, DaySchedule> {
  return isSalaMonthData(raw) ? buildScheduleFromMonthData(raw) : ((raw ?? {}) as Record<number, DaySchedule>)
}

/**
 * Una richiesta di cambio turno che il calendario reale già mostra esaudita:
 * la persona ha davanti a sé il turno che aveva chiesto, quindi la richiesta
 * è inutile (il cambio è già avvenuto) e va cancellata.
 *
 * Esempio: ROMANO Raffaele chiede di passare da P a M il 20/11; nel PDF
 * caricato il 20/11 risulta già in M → la sua richiesta va eliminata.
 */
export interface ShiftCleanupCandidate {
  id: number
  user_id: string
  nome: string | null
  cognome: string | null
  shift_date: string            // YYYY-MM-DD
  offered_shift: ShiftType      // turno offerto (quello che aveva)
  requested_shifts: ShiftType[] // turni richiesti
  actual_shift: SalaShiftType   // turno che il calendario gli assegna davvero
}

export interface ShiftRequestRow {
  id: number
  user_id: string
  offered_shift: ShiftType
  shift_date: string
  requested_shifts: ShiftType[]
  user: Pick<UserProfile, 'id' | 'nome' | 'cognome'> | null
}

const SHIFT_SELECT = `
  id,
  user_id,
  offered_shift,
  shift_date,
  requested_shifts,
  user:users!shifts_user_id_fkey(id, nome, cognome)
`

/**
 * Turni (M/P/N) che il calendario assegna davvero a una persona in un giorno,
 * cercandola in tutti i posti (T/S/noSlot) e tra i tirocinanti di ogni sezione.
 */
export function actualShiftsForPerson(
  day: DaySchedule | undefined,
  cognome?: string | null,
  nome?: string | null,
  duplicateCognomi?: Set<string>,
  bareOwners?: ReturnType<typeof buildBareOwners>,
): SalaShiftType[] {
  if (!day) return []
  const found = new Set<SalaShiftType>()
  for (const section of Object.values(day.sections ?? {})) {
    for (const [shift, data] of Object.entries(section ?? {})) {
      const names = [
        ...(data.surnames?.T ?? []),
        ...(data.surnames?.S ?? []),
        ...(data.surnames?.noSlot ?? []),
        ...(data.tirocinanti ?? []),
      ]
      if (matchesCognome(names, cognome, nome, duplicateCognomi, bareOwners)) {
        found.add(shift as SalaShiftType)
      }
    }
  }
  return [...found]
}

/**
 * Pure: date le richieste di cambio, gli utenti e il calendario del mese,
 * restituisce le richieste già esaudite (una per riga di `shifts`).
 */
export function findFulfilledShiftRequests(
  shifts: ShiftRequestRow[],
  users: Pick<UserProfile, 'id' | 'nome' | 'cognome'>[],
  month: string,
  schedule: Record<number, DaySchedule>,
  /** Omonimi con LEGATO (caso NEVANO): opzionale, da computeShiftCleanup. */
  bareOwners?: ReturnType<typeof buildBareOwners>,
): ShiftCleanupCandidate[] {
  const duplicateCognomi = buildDuplicateCognomi(users)
  const out: ShiftCleanupCandidate[] = []

  for (const s of shifts) {
    if (!s.shift_date?.startsWith(`${month}-`)) continue

    const day = Number(s.shift_date.slice(8, 10))
    const actual = actualShiftsForPerson(schedule[day], s.user?.cognome, s.user?.nome, duplicateCognomi, bareOwners)
    if (actual.length === 0) continue

    const fulfilled = (s.requested_shifts ?? []).find(r => actual.includes(SHIFT_TO_SALA[r]))
    if (!fulfilled) continue

    out.push({
      id: s.id,
      user_id: s.user_id,
      nome: s.user?.nome ?? null,
      cognome: s.user?.cognome ?? null,
      shift_date: s.shift_date,
      offered_shift: s.offered_shift,
      requested_shifts: s.requested_shifts ?? [],
      actual_shift: SHIFT_TO_SALA[fulfilled],
    })
  }

  return out
}

/**
 * Carica richieste di cambio, utenti e (se non fornito) il calendario del mese,
 * e calcola le richieste già esaudite. Da usare lato server.
 */
export async function computeShiftCleanup(
  supabase: SupabaseClient,
  month: string,
  schedule?: Record<number, DaySchedule>,
): Promise<ShiftCleanupCandidate[]> {
  let sched = schedule
  if (!sched) {
    const { data: row, error } = await supabase
      .from('sala_schedule')
      .select('schedule')
      .eq('month', month)
      .maybeSingle()
    if (error) throw error
    if (!row) return []
    sched = decodeScheduleRow(row.schedule)
  }

  const [shiftsRes, usersRes] = await Promise.all([
    supabase.from('shifts').select(SHIFT_SELECT).order('shift_date'),
    supabase.from('users').select('id, nome, cognome'),
  ])
  if (shiftsRes.error) throw shiftsRes.error
  if (usersRes.error) throw usersRes.error

  // Omonimi e righe NUDE (caso NEVANO): di chi è il solo cognome lo decide il
  // ROSTER — l'unico collega in turno con quel cognome (chi è fuori dai turni non
  // rende ambiguo il cognome di chi ci sta).
  let bareOwners: ReturnType<typeof buildBareOwners> | undefined
  try {
    const users = (usersRes.data ?? []) as Array<{ id: string; cognome: string | null }>
    bareOwners = buildBareOwners(await fetchShiftTeamTree(supabase), buildDuplicateCognomi(users), users)
  } catch { /* albero non disponibile: matching standard */ }

  return findFulfilledShiftRequests(
    (shiftsRes.data ?? []) as unknown as ShiftRequestRow[],
    (usersRes.data ?? []) as Pick<UserProfile, 'id' | 'nome' | 'cognome'>[],
    month,
    sched,
    bareOwners,
  )
}

/** Anagrafica + calendari necessari per risalire al turno reale di una persona. */
export interface ShiftLookupContext {
  duplicateCognomi: Set<string>
  usersById: Map<string, Pick<UserProfile, 'id' | 'nome' | 'cognome'>>
  schedules: Map<string, Record<number, DaySchedule>>
  /** Omonimi e righe NUDE (caso NEVANO): opzionale, da loadShiftLookup-
   *  ContextWithTree; senza, il matching resta per cognome puro. */
  bareOwners?: ReturnType<typeof buildBareOwners>
}

interface ScheduleRow {
  month: string
  schedule: unknown
}

/** Carica utenti e calendari dei mesi indicati (per risolvere i turni reali). */
export async function loadShiftLookupContext(
  supabase: SupabaseClient,
  months: string[],
): Promise<ShiftLookupContext> {
  const unique = [...new Set(months.filter(m => /^\d{4}-\d{2}$/.test(m)))]

  const [usersRes, schedRes] = await Promise.all([
    supabase.from('users').select('id, nome, cognome'),
    unique.length
      ? supabase.from('sala_schedule').select('month, schedule').in('month', unique)
      : Promise.resolve({ data: [] as ScheduleRow[], error: null }),
  ])
  if (usersRes.error) throw usersRes.error
  if (schedRes.error) throw schedRes.error

  const users = (usersRes.data ?? []) as Pick<UserProfile, 'id' | 'nome' | 'cognome'>[]
  const schedules = new Map<string, Record<number, DaySchedule>>()
  for (const row of (schedRes.data ?? []) as ScheduleRow[]) {
    schedules.set(row.month, decodeScheduleRow(row.schedule))
  }

  return {
    duplicateCognomi: buildDuplicateCognomi(users),
    usersById: new Map(users.map(u => [u.id, u])),
    schedules,
  }
}

/** Variante con l'albero: costruisce anche la mappa bare-owner degli omonimi. */
export async function loadShiftLookupContextWithTree(
  supabase: SupabaseClient,
  months: string[],
): Promise<ShiftLookupContext & { bareOwners: ReturnType<typeof buildBareOwners> }> {
  const [ctx, tree] = await Promise.all([loadShiftLookupContext(supabase, months), fetchShiftTeamTree(supabase)])
  // Stessa regola del roster delle schermate della sala: di chi è «NEVANO» lo
  // decide l'unico collega IN TURNO con quel cognome (l'anagrafica ce l'ha il
  // contesto). Senza `users` la mappa tornerebbe al solo legame.
  return { ...ctx, bareOwners: buildBareOwners(tree, ctx.duplicateCognomi, [...ctx.usersById.values()]) }
}

/** Turni reali (M/P/N) di un utente in una data YYYY-MM-DD, secondo il calendario caricato. */
export function actualShiftsForUserDate(
  ctx: ShiftLookupContext,
  userId: string,
  date: string,
): SalaShiftType[] {
  const user = ctx.usersById.get(userId)
  if (!user) return []
  const schedule = ctx.schedules.get(date.slice(0, 7))
  if (!schedule) return []
  return actualShiftsForPerson(
    schedule[Number(date.slice(8, 10))],
    user.cognome,
    user.nome,
    ctx.duplicateCognomi,
    ctx.bareOwners,
  )
}
