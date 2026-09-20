import type { VacationPeriod } from '@/types/database'

const ROTATION_SEQ: VacationPeriod[] = [1, 3, 5, 6, 4, 2]

export interface VacationPeriodMeta {
  label: string
  start: string   // MM-DD
  end: string     // MM-DD
}

export const VACATION_PERIOD_LABELS: Record<VacationPeriod, VacationPeriodMeta> = {
  1: { label: '16–30 Giugno',      start: '06-16', end: '06-30' },
  2: { label: '01–15 Luglio',      start: '07-01', end: '07-15' },
  3: { label: '16–31 Luglio',      start: '07-16', end: '07-31' },
  4: { label: '01–15 Agosto',      start: '08-01', end: '08-15' },
  5: { label: '16–31 Agosto',      start: '08-16', end: '08-31' },
  6: { label: '01–15 Settembre',   start: '09-01', end: '09-15' },
}

/** Etichette corte (per notifiche push e messaggi). */
export const VACATION_PERIOD_LABELS_SHORT: Record<VacationPeriod, string> = {
  1: '16–30 Giu', 2: '01–15 Lug', 3: '16–31 Lug',
  4: '01–15 Ago', 5: '16–31 Ago', 6: '01–15 Set',
}

/**
 * Calcola il periodo ferie di un utente per un dato anno,
 * partendo dal suo base_period (2026) e applicando la rotazione ciclica.
 */
export function getVacationPeriodForYear(
  basePeriod: VacationPeriod,
  year: number,
): VacationPeriod {
  const baseIdx = ROTATION_SEQ.indexOf(basePeriod)
  const offset  = ((year - 2026) % 6 + 6) % 6
  const targetIdx = (baseIdx + offset) % 6
  return ROTATION_SEQ[targetIdx]
}

/** Periodo effettivo: usa override per l'anno se presente, altrimenti rotazione base. */
export function getEffectivePeriodForYear(
  basePeriod: VacationPeriod,
  year: number,
  overrides: Map<string, VacationPeriod>,
  userId: string,
): VacationPeriod {
  return overrides.get(userId) ?? getVacationPeriodForYear(basePeriod, year)
}

/**
 * IL FILTRO «SOLO SE COMPATIBILE COL MIO PERIODO» (richiesta 26/09/2026).
 *
 * Un cambio ferie è una PERMUTA: chi pubblica offre il proprio periodo e cerca
 * quelli altrui. Il destinatario può essere parte dello scambio solo se il suo
 * periodo dell'anno richiesto è FRA QUELLI CERCATI (è la stessa condizione che
 * `findCompatibleVacationRequests` verifica nell'altro verso: lì si guarda la
 * richiesta altrui rispetto ai propri periodi, qui il proprio periodo rispetto ai
 * periodi cercati). Chi non ha il filtro attivo riceve tutto, come prima.
 *
 * Due uscite di CAUTELA, entrambe deliberate:
 *   • periodo del destinatario IGNOTO (nessuna assegnazione ferie, oppure anno non
 *     noto): non si filtra — l'ignoranza non è una ragione per non avvisare;
 *   • lista dei periodi cercati VUOTA: non si filtra, perché non c'è niente da
 *     confrontare e una richiesta senza mete è un dato incompleto, non una
 *     proposta per nessuno.
 * Questo è il predicato che il route delle notifiche USA (`app/api/push/notify`):
 * tenerlo in una funzione pura è quello che lo rende provabile.
 */
export function vacationFilterKeeps(
  filterOn: boolean | null | undefined,
  myPeriod: VacationPeriod | null | undefined,
  targetPeriods: readonly VacationPeriod[],
): boolean {
  if (filterOn !== true) return true
  if (myPeriod == null) return true
  if (targetPeriods.length === 0) return true
  return targetPeriods.includes(myPeriod)
}


