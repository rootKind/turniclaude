/**
 * IL GRUPPO «PER ME» DELLA DASHBOARD (richiesta 25/09/2026).
 *
 * La chip che prima isolava solo i cambi offerti dall'utente («Solo miei»,
 * «Solo mansioni» per i DCO+) ora isola anche le richieste che l'utente
 * POTREBBE prendere, con lo stesso criterio delle notifiche «nuovo turno
 * pubblicato» (`notify_shift_filter`): una richiesta è compatibile quando il
 * MIO turno del giorno (reale dal PDF del mese, altrimenti TEORICO dalla
 * rotazione delle squadre) è fra i turni cercati (M/P/N — `userCoversRequest`).
 *
 * Due differenze volute rispetto al motore delle notifiche
 * (`getUserShiftOnDate` in lib/shift-compat.ts, lato server):
 *   • i dati arrivano GIÀ CARICATI nel browser (mesi PDF decodificati e albero
 *     squadre degli hook cache-first, vedi use-per-me-groups): nessuna lettura
 *     nuova, il raggruppamento è puro e sincrono;
 *   • manca il concetto di `certain` (omonimia/roster): qui il dato serve a
 *     MOSTRARE, non a DECIDERE — come il salto in sala, non come la verifica
 *     pre-pubblicazione. Un giorno «ignoto» (né PDF né teorico) NON nasconde
 *     nulla: la richiesta resta compatibile, come le notifiche senza fonti.
 *
 * Il possesso resta la prima regola: le richieste dell'utente (per i DCO+
 * anche quelle dei Noni) sono «sue» anche quando quel giorno è in riposo.
 */
import type { ShiftType, ShiftTeamTree } from '@/types/database'
import { userCoversRequest } from '@/lib/shift-compat'
import { findMonthPerson, type MonthPersonShifts } from '@/lib/sala-month'
import { theoreticalTokenFor, type PersonRef } from '@/lib/person-shift'
import { buildBareOwners } from '@/lib/shift-teams-matching'

/** Intestazioni dei due gruppi nella lista (decisione col richiedente). */
export const MINE_HEADER = 'Offerti da te'
export const COMPATIBLE_HEADER = 'Compatibili col tuo turno'

/** Il minimo di richiesta che serve per decidere il gruppo. */
export interface ShiftForCompat {
  shift_date: string
  user_id: string
  requested_shifts: ShiftType[] | string[] | null | undefined
}

export interface CompatContext<T extends ShiftForCompat = ShiftForCompat> {
  /** L'utente di cui si compone la pagina (impersonazione compresa). */
  effectiveUserId: string
  myNome?: string | null
  myCognome?: string | null
  /** Mesi PDF v2 decodificati (month → elenco persone), payload di use-disponibili. */
  peopleByMonth: Map<string, MonthPersonShifts[]>
  /** Albero squadre per il teorico; senza albero E senza PDF il giorno è ignoto. */
  tree: ShiftTeamTree | null
  duplicateCognomi?: Set<string>
  /** Elenco utenti (per i proprietari delle righe «solo cognome», come lì). */
  users?: Array<{ id?: string | null; cognome?: string | null }> | null
  /** CHI È «MIO» oltre a `user_id === effectiveUserId` (DCO+: i cambi dei Noni). */
  possessivo?: (s: T) => boolean
  /** Titolo del gruppo possessivo (default «Offerti da te»). */
  titoloMiei?: string
}

export interface GruppoPerMe<T = ShiftForCompat> {
  titolo: string
  shifts: T[]
}

/** 'M' | 'P' | 'N' da un token sala — puro specchio di `salaTokenToShiftType`. */
function tokenToShiftType(token: string): ShiftType | null {
  const c = token.trim().charAt(0).toUpperCase()
  return c === 'M' ? 'Mattina' : c === 'P' ? 'Pomeriggio' : c === 'N' ? 'Notte' : null
}

/** Il giorno è deciso ma senza turno lavorativo (riposo/assenza): non copre nulla. */
interface CoperturaGiorno {
  tipo: ShiftType | null
  ignoto: boolean
}

/** Solo i campi che servono a leggere il MIO turno (senza il possessivo). */
type CoperturaCtx = Omit<CompatContext<never>, 'possessivo' | 'titoloMiei'>

/**
 * Il MIO turno nel giorno, con la STESSA catena di sorgenti di
 * `getUserShiftOnDate`: 1. riga del PDF del mese; 2. se il PDF non dice nulla
 * (mese mancante, persona non trovata, cella vuota), il TEORICO delle squadre;
 * 3. altrimenti «ignoto». Riposo/assenza espliciti NON passano al teorico.
 */
function coperturaGiorno(
  ctx: CoperturaCtx,
  bareOwners: ReturnType<typeof buildBareOwners>,
  cache: Map<string, CoperturaGiorno>,
  dateISO: string,
): CoperturaGiorno {
  const cached = cache.get(dateISO)
  if (cached) return cached

  let out: CoperturaGiorno = { tipo: null, ignoto: true }
  const month = dateISO.slice(0, 7)
  const day = Number(dateISO.slice(8, 10))
  const me: PersonRef = { id: ctx.effectiveUserId, nome: ctx.myNome, cognome: ctx.myCognome }

  const people = month ? ctx.peopleByMonth.get(month) : undefined
  if (people?.length && day >= 1) {
    const person = findMonthPerson(people, me, ctx.duplicateCognomi, bareOwners)
    const token = person?.days[day - 1] ?? ''
    if (token) out = { tipo: tokenToShiftType(token), ignoto: false }
  }
  if (out.ignoto && ctx.tree) {
    const token = theoreticalTokenFor(ctx.tree, me, dateISO, ctx.duplicateCognomi, bareOwners)
    if (token) out = { tipo: tokenToShiftType(token), ignoto: false }
  }

  cache.set(dateISO, out)
  return out
}

/**
 * Divide le richieste nei gruppi «Offerti da te» e «Compatibili col tuo
 * turno», MANTENENDO l'ordine di arrivo (cronologico) dentro ciascun gruppo.
 * Un shift non può stare in due gruppi: il possesso vince sempre. I gruppi
 * vuoti non esistono: chi compone la pagina non deve filtrare intestazioni
 * orfane.
 */
export function groupShiftsForMe<T extends ShiftForCompat>(
  shifts: readonly T[],
  ctx: CompatContext<T>,
): { gruppi: Array<GruppoPerMe<T>>; totaleUnione: number } {
  const bareOwners = buildBareOwners(ctx.tree, ctx.duplicateCognomi, ctx.users ?? null)
  const cache = new Map<string, CoperturaGiorno>()
  const eMio = ctx.possessivo ?? ((s: ShiftForCompat) => s.user_id === ctx.effectiveUserId)

  const miei: T[] = []
  const compatibili: T[] = []
  for (const s of shifts) {
    if (eMio(s)) {
      miei.push(s)
      continue
    }
    const richiesti = (s.requested_shifts ?? []) as ShiftType[]
    if (!richiesti.length) continue // nessuna preferenza: nulla da coprire
    const giorno = coperturaGiorno(ctx, bareOwners, cache, s.shift_date)
    // Giorno ignoto (nessuna fonte): non nascondo nulla, come le notifiche.
    if (giorno.ignoto || userCoversRequest(giorno.tipo, richiesti)) compatibili.push(s)
  }

  const gruppi: Array<GruppoPerMe<T>> = []
  if (miei.length) gruppi.push({ titolo: ctx.titoloMiei ?? MINE_HEADER, shifts: miei })
  if (compatibili.length) gruppi.push({ titolo: COMPATIBLE_HEADER, shifts: compatibili })
  return { gruppi, totaleUnione: miei.length + compatibili.length }
}
