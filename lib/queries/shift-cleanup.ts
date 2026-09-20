import type { SupabaseClient } from '@supabase/supabase-js'
import type { DaySchedule, SalaShiftType, ShiftType, UserProfile } from '@/types/database'
import { buildDuplicateCognomi, matchesCognome } from '@/lib/utils'
import { buildBareOwners } from '@/lib/shift-teams-matching'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import {
  buildScheduleFromMonthData,
  decodeSalaMonth,
  findMonthPerson,
  fuoriSalaInfo,
  isSalaMonthData,
  type MonthPersonShifts,
} from '@/lib/sala-month'
import type { BareOwnerMap } from '@/lib/shift-teams-matching'
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
  /** Turno che il calendario assegna davvero. `null` quando il motivo è
   *  «fuori-sala»: quel giorno non c'è nessun turno, c'è un'assenza o
   *  un'attività senza sezione (vedi `day_code`). */
  actual_shift: SalaShiftType | null
  /** PERCHÉ la richiesta è inutile:
   *   • `esaudito`   — il calendario mostra già il turno che la persona aveva
   *                    chiesto (il cambio è avvenuto);
   *   • `fuori-sala` — quel giorno la persona è assente o in un'attività senza
   *                    sezione (trasferta, corso, istruttore): non ha nessun
   *                    turno da cedere, quindi la richiesta non è più eseguibile
   *                    (richiesta utente 26/09/2026). */
  reason: 'esaudito' | 'fuori-sala'
  /** Codice del giorno nel PDF, solo per «fuori-sala»: «A», «F.E.», «DisNa»… */
  day_code?: string
  /** Etichetta breve dello stesso codice («Ferie», «Trasferta», «Corso»…). */
  day_label?: string
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
  /** Riga REALE del giorno per `${user_id}|${shift_date}` (dati v2 del mese): il
   *  codice serve a riconoscere i giorni FUORI SALA (le assenze esistono solo
   *  nel v2, non nel calendario espanso) e `pending` dice se la cella è GIALLA.
   *  Un giorno giallo è un'IPOTESI di turno, non un turno confermato: la pulizia
   *  non lo tocca. Senza questa mappa (mesi v1) si resta alla regola di prima. */
  realDays?: Map<string, RealDayState> | null,
): ShiftCleanupCandidate[] {
  const duplicateCognomi = buildDuplicateCognomi(users)
  const out: ShiftCleanupCandidate[] = []

  for (const s of shifts) {
    if (!s.shift_date?.startsWith(`${month}-`)) continue

    const day = Number(s.shift_date.slice(8, 10))
    const state = realDays?.get(`${s.user_id}|${s.shift_date}`)
    /* CELLA GIALLA = NON CONFERMATA (richiesta utente 26/09/2026: «le celle con
       sfondo giallo sono delle ipotesi di turno reale ma diverse dal teorico»).
       Da lì non si DECIDE niente: né «il cambio è già avvenuto» né «quel giorno
       non è in sala». La richiesta resta dov'è, in attesa della conferma —
       cancellarla su un'ipotesi sarebbe il modo più facile di sbagliare.
       Senza il dato (mesi vecchi, mappa assente) si procede come prima. */
    if (state?.pending) continue

    const actual = actualShiftsForPerson(schedule[day], s.user?.cognome, s.user?.nome, duplicateCognomi, bareOwners)

    const fulfilled = (s.requested_shifts ?? []).find(r => actual.includes(SHIFT_TO_SALA[r]))
    if (fulfilled) {
      out.push({
        id: s.id,
        user_id: s.user_id,
        nome: s.user?.nome ?? null,
        cognome: s.user?.cognome ?? null,
        shift_date: s.shift_date,
        offered_shift: s.offered_shift,
        requested_shifts: s.requested_shifts ?? [],
        actual_shift: SHIFT_TO_SALA[fulfilled],
        reason: 'esaudito',
      })
      continue
    }

    // NON esaudita: la richiesta è inutile lo stesso se quel giorno la persona
    // è FUORI SALA (assenza o attività senza sezione) — non c'è nessun turno da
    // cedere. Un turno su una card di sezione che NON è fra quelli chiesti resta
    // invece fuori dalla pulizia: è un'altra richiesta, non una richiesta morta.
    const fuori = fuoriSalaInfo(state?.token)
    if (!fuori) continue

    out.push({
      id: s.id,
      user_id: s.user_id,
      nome: s.user?.nome ?? null,
      cognome: s.user?.cognome ?? null,
      shift_date: s.shift_date,
      offered_shift: s.offered_shift,
      requested_shifts: s.requested_shifts ?? [],
      actual_shift: null,
      reason: 'fuori-sala',
      day_code: fuori.code,
      day_label: fuori.label,
    })
  }

  return out
}

/**
 * La RIGA REALE di un giorno: il codice e se la cella è GIALLA.
 *
 * `pending` (il giallo del PDF) significa «ipotesi di turno, non confermata»:
 * chi DECIDE deve trattarla come un dato mancante — vedi `findFulfilledShiftRequests`.
 */
export interface RealDayState {
  /** Codice reale del giorno; `''` = quel giorno non risulta niente. */
  token: string
  /** Cella gialla del PDF = turno da confermare (ipotesi). */
  pending: boolean
}

/**
 * La riga REALE del giorno per ogni richiesta, dalla forma compatta v2 del mese.
 *
 * Chiave: `${user_id}|${shift_date}`. Il codice `''` (cella vuota) è un valore
 * come gli altri: significa «quel giorno non risulta niente». Il TEORICO non
 * viene letto: vedi la nota in `computeShiftCleanup`.
 */
export function dayStatesForRequests(
  peopleByMonth: Map<string, MonthPersonShifts[]>,
  requests: Array<{ user_id: string; shift_date: string }>,
  users: Pick<UserProfile, 'id' | 'nome' | 'cognome'>[],
  bareOwners?: BareOwnerMap | null,
): Map<string, RealDayState> {
  const byId = new Map(users.map(u => [u.id, u]))
  const duplicateCognomi = buildDuplicateCognomi(users)
  const out = new Map<string, RealDayState>()
  for (const r of requests) {
    const people = peopleByMonth.get(r.shift_date.slice(0, 7))
    if (!people) continue
    const u = byId.get(r.user_id)
    // Senza anagrafica resta il match per solo cognome: meglio del niente, e
    // comunque l'omonimia senza legame non attribuisce nulla (bareOwners).
    const person = findMonthPerson(
      people,
      { id: r.user_id, nome: u?.nome ?? null, cognome: u?.cognome ?? null },
      duplicateCognomi,
      bareOwners,
    )
    const day = Number(r.shift_date.slice(8, 10))
    out.set(`${r.user_id}|${r.shift_date}`, {
      token: person?.days[day - 1] ?? '',
      pending: person?.yellow.includes(day) ?? false,
    })
  }
  return out
}

/** Come `dayStatesForRequests`, ma legge i mesi dal DB. Usato dalla conferma di
 *  pulizia (che riparte dagli id e deve rispiegare il motivo di ogni riga). */
export async function loadRealDayStates(
  supabase: SupabaseClient,
  requests: Array<{ user_id: string; shift_date: string }>,
  users: Pick<UserProfile, 'id' | 'nome' | 'cognome'>[],
  bareOwners?: BareOwnerMap | null,
): Promise<Map<string, RealDayState>> {
  const months = [...new Set(requests.map(r => r.shift_date.slice(0, 7)))]
  if (!months.length) return new Map()
  const { data, error } = await supabase
    .from('sala_schedule')
    .select('month, schedule')
    .in('month', months)
  if (error) throw error
  const peopleByMonth = new Map<string, MonthPersonShifts[]>()
  for (const row of (data ?? []) as { month: string; schedule: unknown }[]) {
    if (isSalaMonthData(row.schedule)) peopleByMonth.set(row.month, decodeSalaMonth(row.schedule))
  }
  return dayStatesForRequests(peopleByMonth, requests, users, bareOwners)
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
  // La riga del mese si legge SEMPRE: oltre al calendario serve la forma compatta
  // v2, l'unica che conserva il codice di OGNI persona in OGNI giorno (comprese
  // le assenze), e quindi l'unica che sa dire chi è fuori sala. Il `schedule`
  // passato dall'upload resta la fonte del calendario (è appena stato decodificato
  // dal PDF appena letto) — non si decodifica due volte la stessa cosa.
  const { data: row, error } = await supabase
    .from('sala_schedule')
    .select('schedule')
    .eq('month', month)
    .maybeSingle()
  if (error) throw error
  if (!row) return []
  const raw = row.schedule as unknown
  const sched = schedule ?? decodeScheduleRow(raw)

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

  const shifts = (shiftsRes.data ?? []) as unknown as ShiftRequestRow[]
  const users = (usersRes.data ?? []) as Pick<UserProfile, 'id' | 'nome' | 'cognome'>[]
  /* SI GUARDA SOLO LA RIGA REALE DEL PDF (`d`), MAI IL TEORICO (`t`) — richiesta
     utente 26/09/2026, e vale per TUTTA la pulizia (anche il «già avvenuto»),
     non solo per i giorni fuori sala. Le due righe NON coincidono quasi mai:
     nei mesi caricati in dev differiscono in ~40% delle celle (1156 su 2910 a
     settembre). Il caso che ha reso la regola evidente è Piscopo 29/09/2026:
     reale «A» (Altre presenze), teorico «N7T» (Notte) — la sua richiesta offriva
     proprio Notte, quindi col teorico non si sarebbe ripulito niente, mentre la
     riga reale dice che quel giorno non c'è nessun turno da cedere.
     In concreto: `decodeSalaMonth` → `days` (reale) e `buildScheduleFromMonthData`
     usano entrambi `d`; `person.teorico` non viene letto da nessuna parte qui.
     Le due prove che inchiodano la regola (reale vs teorico, nei due versi) sono
     in `tests/pulizia-fuori-sala.spec.ts`. */
  // Riga reale del giorno (codice + giallo), per riconoscere i giorni fuori sala
  // e per NON decidere mai su una cella gialla. Solo v2: i mesi vecchi non hanno
  // né le assenze né il giallo, e restano alla regola di prima.
  const realDays = isSalaMonthData(raw)
    ? dayStatesForRequests(
        new Map([[month, decodeSalaMonth(raw)]]),
        shifts.map(s => ({ user_id: s.user_id, shift_date: s.shift_date })),
        users,
        bareOwners,
      )
    : null

  return findFulfilledShiftRequests(shifts, users, month, sched, bareOwners, realDays)
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
