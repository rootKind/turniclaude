import type { VacationPeriod } from '@/types/database'

const ROTATION_SEQ: VacationPeriod[] = [1, 3, 5, 6, 4, 2]

interface VacationPeriodMeta {
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
 * IL FALLBACK «16–30 GIUGNO» (bug diagnosticato il 21/09/2026).
 *
 * Nelle card dei cambi ferie il periodo dell'interessato usciva SEMPRE
 * «16–30 Giugno» (P1). Il mapper leggeva l'embed `users →
 * vacation_assignments` come ARRAY (`vacation_assignments?.[0]?.base_period`),
 * ma `user_id` è la PRIMARY KEY di vacation_assignments: PostgREST classifica
 * la relazione come ONE-TO-ONE e nell'embed torna un OGGETTO (o `null` se la
 * riga manca). L'indice `[0]` su un oggetto è `undefined`, così OGNI
 * interessato cascava sul fallback `(1 as VacationPeriod)` — il P1 finto —
 * mentre i NOMI si vedevano comunque (l'embed del nome è many-to-one).
 *
 * Questa funzione accetta ENTRAMBE le forme (oggetto oggi, array se un domani
 * cambiasse la PK o con hint espliciti) e NON inventa un periodo quando
 * l'assegnazione è ignota: chi la chiama decide come trattare l'incertezza.
 * Provata in tests/ferie-compatibili.spec.ts su entrambe le forme.
 */
export function basePeriodInteressato(
  i: { user?: { vacation_assignments?: unknown } | null },
): { base: VacationPeriod | null; row: unknown } {
  const va = i.user?.vacation_assignments
  if (Array.isArray(va)) {
    const first = va[0] as { base_period?: number } | undefined
    return { base: (first?.base_period ?? null) as VacationPeriod | null, row: first ?? null }
  }
  if (va != null && typeof va === 'object') {
    const obj = va as { base_period?: number }
    return { base: (obj.base_period ?? null) as VacationPeriod | null, row: obj }
  }
  return { base: null, row: null }
}

/** Il periodo dell'anno dell'interessato: rotazione+override se l'assegnazione
 *  c'è (in qualunque forma torni l'embed), altrimenti NULL — mai un periodo finto. */
export function periodInteressatoThisYear(
  i: { user?: { vacation_assignments?: unknown } | null; user_id: string },
  year: number,
  overrides: Map<string, VacationPeriod>,
): VacationPeriod | null {
  const { base } = basePeriodInteressato(i)
  if (base == null) return null
  return getEffectivePeriodForYear(base, year, overrides, i.user_id)
}

/** Etichetta del periodo dell'anno dell'interessato, o «Periodo non noto».
 *  Unica fonte per card e notifiche: l'incertezza si DICE, non si maschera. */
export function labelPeriodoInteressato(
  i: { user?: { vacation_assignments?: unknown } | null; user_id: string },
  year: number,
  overrides: Map<string, VacationPeriod>,
): string {
  const p = periodInteressatoThisYear(i, year, overrides)
  return p == null ? 'Periodo non noto' : VACATION_PERIOD_LABELS[p].label
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


