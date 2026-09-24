import type { DeskCard, SalaLayout, SalaMinimoEntry, SalaMinimoPeriod, SalaShiftType } from '@/types/database'

/**
 * MINIMO DI PERSONE PER CARD — richiesta 15/09/2026.
 *
 * Perché serve: la regola «scoperto» nata il 27/09 segnalava solo le card
 * svuotate da una CELLA GIALLA, quindi non vedeva il caso di chi abbandona una
 * sezione per una causa diversa — il caso ROTONDO: nella sua squadra («Squadra
 * in seconda», ciclo 84 gg) i compagni girano su 4/6/7/10 mentre il suo pattern
 * è 46 G su 84; il teorico non lo assegna più a nessuna sezione, quindi il
 * confronto teorico↔reale non ha niente da lamentare, ma la card resta con una
 * persona in meno.
 *
 * La regola generale è quindi: una card è SCOPERTA quando le persone REALI che
 * ci lavorano sono meno del MINIMO previsto per quella sezione e quel turno.
 * Il minimo:
 *  - in M/P esce dalla PIANTINA: doppia → 2, singola → 1 (le doppie sono
 *    esattamente 6/7/10/4/5, come dichiarato);
 *  - di NOTTE ha una tabella sua (sotto), perché il turno cambia: RIC/DCIF/8/9/11/
 *    ASTER M3M40 non prevedono presenti e il 4° scende da 2 a 1;
 *  - può essere CORRETTO dall'admin con una data di efficacia, perché ci sono
 *    periodi in cui una sezione prevede più o meno persone (verificato sui PDF:
 *    l'8° è a 0 in TUTTE le 122 giornate di marzo-aprile e presidiata da maggio,
 *    il 9° è a 0 nella prima metà di agosto, il 4° è a 0 tutto giugno);
 *  - e (richiesta 16/09/2026) anche con il TURNO da cui comincia a valere, perché
 *    il cambio può avvenire a giornata iniziata: «dal 20/9, turno P» lascia la
 *    mattina del 20 alla voce precedente e comincia dal pomeriggio.
 *
 * La storia sta in `SalaLayout.minimums`: il minimo di un giorno E TURNO è quello
 * dell'ultima voce che li copre (data minore, o stessa data con turno non
 * successivo). Se NESSUNA voce lo copre, non c'è minimo configurato e la regola
 * NON si applica (resta solo quella sui gialli): così i mesi vecchi non si
 * riempiono di «scoperto» calcolati con la fotografia di oggi — è il senso di «a
 * partire dal giorno in cui lo modifico in poi».
 *
 * Dal 16/09/2026 (sera) c'è anche il livello più fine, `SalaLayout.minimumPeriods`:
 * il PERIODO di una singola casella (sezione × turno), con data e turno d'inizio e
 * di fine (fine INCLUSA). Ha la precedenza sulla voce; fuori dai periodi di una
 * casella vale il DEFAULT della piantina. Serve a dichiarare «questa sezione, in
 * questo periodo, è scoperta da programma» senza toccare la regola generale.
 */

export const SALA_SHIFTS: SalaShiftType[] = ['M', 'P', 'N']

/** Ordine dei turni dentro il giorno: serve a sapere se una voce è già in vigore.
 *  M = 0, P = 1, N = 2 (il turno di notte è l'ultimo della giornata). */
function shiftIndex(shift: SalaShiftType): number {
  return shift === 'M' ? 0 : shift === 'P' ? 1 : 2
}

/**
 * Il TURNO è già finito in QUESTA giornata? (richiesta 24/09/2026: la notte
 * del giorno in corso è già «un fatto» come i giorni passati — la card scoperta
 * si scrive a testo grigio, non come allarme giallo.) Le ore: M fino alle 7,
 * P fino alle 14, N fino alle 21 — oltre, la notte si avvia e ricomincia
 * l'allarme. Orario locale del dispositivo, come `oggiISO` del pannello.
 */
export function turnoPassato(shift: SalaShiftType, now: Date = new Date()): boolean {
  const ora = now.getHours()
  return ora >= (shift === 'M' ? 7 : shift === 'P' ? 14 : 21)
}

/** Turno dichiarato da una voce: assente = «M» (vale dall'inizio del giorno). */
function entryShift(entry: Pick<SalaMinimoEntry, 'fromShift'>): SalaShiftType {
  return entry.fromShift ?? 'M'
}

/**
 * Minimo di NOTTE per card (chiave = sectionKey della piantina, o titolo).
 * Ricavato dai PDF reali di 7 mesi (214 notti): i valori sono quelli del mese
 * corrente, che è l'unico periodo di cui si conosce l'assetto attuale.
 *
 * Nota su DCP/DCIF: in 213 notti su 214 è la DCP a essere presidiata (codice
 * NDCP: D'ELIA, SENATORE, COPPETA) ed è la DCIF a restare vuota in tutte.
 */
export const NIGHT_MIN_DEFAULTS: Record<string, number> = {
  RIC: 0,
  DCCM: 1,
  DCIF: 0,
  '4': 1,
  '5': 2,
  '6': 2,
  '7': 2,
  '8': 0,
  '9': 0,
  '10': 2,
  '11': 0,
  M3M40: 0,
  DCP: 1,
}

/** Chiave stabile di una card: la sezione del PDF, o il titolo se non ne ha. */
export function cardKeyOf(card: Pick<DeskCard, 'sectionKey' | 'title'>): string {
  return card.sectionKey ?? card.title
}

/** Minimo di DEFAULT di una card in un turno (prima di ogni correzione admin). */
export function defaultMinFor(card: Pick<DeskCard, 'sectionKey' | 'title' | 'type'>, shift: SalaShiftType): number {
  if (shift !== 'N') return card.type === 'double' ? 2 : 1
  const known = NIGHT_MIN_DEFAULTS[cardKeyOf(card)]
  // Card nuova, non presente nella tabella notte: si comporta come il giorno
  // (doppia → 2, singola → 1) invece di restare muta.
  return known ?? (card.type === 'double' ? 2 : 1)
}

/** Tutti i DEFAULT della piantina, chiave «cardKey|TURNO»: è la precompilazione
 *  del pannello admin alla prima apertura. */
export function defaultSnapshot(cards: Array<Pick<DeskCard, 'sectionKey' | 'title' | 'type'>>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const card of cards) {
    for (const shift of SALA_SHIFTS) out[`${cardKeyOf(card)}|${shift}`] = defaultMinFor(card, shift)
  }
  return out
}

/**
 * La voce di storia in vigore in un GIORNO e TURNO (null se nessuna li copre).
 *
 * Una voce entra in vigore nel proprio giorno solo DAL PROPRIO TURNO in poi
 * (richiesta 16/09/2026): «dal 20/9, turno P» lascia la mattina del 20 alla voce
 * precedente e comincia a valere dal pomeriggio. Dal giorno successivo vale su
 * tutti i turni, come prima.
 */
export function effectiveEntry(
  entries: SalaMinimoEntry[] | undefined,
  dayISO: string,
  shift: SalaShiftType,
): SalaMinimoEntry | null {
  const ordine = shiftIndex(shift)
  let best: SalaMinimoEntry | null = null
  for (const e of entries ?? []) {
    if (!e?.from || e.from > dayISO) continue
    // Stesso giorno: la voce vale solo se il suo turno è già iniziato.
    if (e.from === dayISO && shiftIndex(entryShift(e)) > ordine) continue
    if (!best || confronto(e, best) > 0) best = e
  }
  return best
}

/** Ordina due voci: prima la data, a parità di data il turno più avanzato. */
function confronto(a: SalaMinimoEntry, b: SalaMinimoEntry): number {
  if (a.from !== b.from) return a.from.localeCompare(b.from)
  return shiftIndex(entryShift(a)) - shiftIndex(entryShift(b))
}

/**
 * La PRIMA voce che non è ancora in vigore in quel giorno e turno (richiesta
 * 16/09/2026): il pannello la nomina quando il giorno/turno a schermo è coperto
 * solo da una voce FUTURA — «qui non c'è ancora un minimo, il primo parte dal …».
 */
export function nextEntry(
  entries: SalaMinimoEntry[] | undefined,
  dayISO: string,
  shift: SalaShiftType,
): SalaMinimoEntry | null {
  const ordine = shiftIndex(shift)
  const dopo = (e: SalaMinimoEntry) =>
    e.from > dayISO || (e.from === dayISO && shiftIndex(entryShift(e)) > ordine)
  let best: SalaMinimoEntry | null = null
  for (const e of entries ?? []) {
    if (!e?.from || !dopo(e)) continue
    if (!best || confronto(e, best) < 0) best = e
  }
  return best
}

// ─── PERIODI PER CASELLA (richiesta 16/09/2026, sera) ───────────────────────

/** Periodi salvati di UNA casella (sezione × turno), ordinati per inizio. */
export function periodsForCell(
  periods: SalaMinimoPeriod[] | undefined,
  cardKey: string,
  shift: SalaShiftType,
): SalaMinimoPeriod[] {
  return (periods ?? [])
    .filter(p => p?.card === cardKey && p.shift === shift)
    .sort((a, b) => confrontoPeriodi(a, b))
}

/**
 * True se il punto (giorno, turno) della CASELLA cade dentro il periodo.
 * L'inizio è incluso dal turno `fromShift` (assente = «M», tutta la giornata),
 * la fine è inclusa fino al turno `toShift` (assente = «N», tutto il giorno di
 * fine) — «dal 15/10 turno P al 20/10» copre anche il pomeriggio del 20.
 */
export function periodCovers(
  p: SalaMinimoPeriod,
  dayISO: string,
  shift: SalaShiftType,
): boolean {
  if (!p?.from || dayISO < p.from) return false
  if (dayISO === p.from && shiftIndex(shift) < shiftIndex(p.fromShift ?? 'M')) return false
  if (!p.to) return true
  if (dayISO > p.to) return false
  if (dayISO === p.to && shiftIndex(shift) > shiftIndex(p.toShift ?? 'N')) return false
  return true
}

/** Ordina due periodi: prima la data d'inizio, a parità il turno d'inizio. */
function confrontoPeriodi(a: SalaMinimoPeriod, b: SalaMinimoPeriod): number {
  if (a.from !== b.from) return a.from.localeCompare(b.from)
  return shiftIndex(a.fromShift ?? 'M') - shiftIndex(b.fromShift ?? 'M')
}

/** Stessa casella E stesso inizio = stesso periodo (salvarlo lo sostituisce). */
function stessoPeriodo(a: SalaMinimoPeriod, b: SalaMinimoPeriod): boolean {
  return a.card === b.card && a.shift === b.shift && a.from === b.from
    && shiftIndex(a.fromShift ?? 'M') === shiftIndex(b.fromShift ?? 'M')
}

/** Aggiunge un periodo, o sostituisce quello con lo stesso inizio. Ordinata per data. */
export function withMinimoPeriod(
  periods: SalaMinimoPeriod[] | undefined,
  period: SalaMinimoPeriod,
): SalaMinimoPeriod[] {
  const out = (periods ?? []).filter(p => !stessoPeriodo(p, period))
  out.push(period)
  return out.sort(confrontoPeriodi)
}

/** Toglie un periodo (identità: casella + inizio). */
export function withoutMinimoPeriod(
  periods: SalaMinimoPeriod[] | undefined,
  card: string,
  shift: SalaShiftType,
  from: string,
  fromShift?: SalaShiftType,
): SalaMinimoPeriod[] {
  return (periods ?? []).filter(p => !(
    p.card === card && p.shift === shift && p.from === from
    && shiftIndex(p.fromShift ?? 'M') === shiftIndex(fromShift ?? 'M')
  ))
}

/** Il periodo che COPRE quel giorno e turno (il più recente, se si sovrappongono). */
export function coveringPeriod(
  periods: SalaMinimoPeriod[] | undefined,
  cardKey: string,
  shift: SalaShiftType,
  dayISO: string,
): SalaMinimoPeriod | null {
  const dentro = periodsForCell(periods, cardKey, shift).filter(p => periodCovers(p, dayISO, shift))
  return dentro.length ? dentro[dentro.length - 1] : null
}

/**
 * Minimi in vigore nel giorno indicato per il TURNO indicato, chiave
 * «cardKey|TURNO» (stessa forma delle chiavi di `scopertiForDay`).
 * `null` = nessun minimo configurato per quel giorno → la regola non si applica.
 *
 * PRECEDENZA (richiesta 16/09/2026, sera):
 *  1. il PERIODO della casella che copre giorno e turno → il suo valore;
 *  2. una casella che ha periodi ma nessuno in vigore → il DEFAULT della piantina
 *     (il periodo è l'eccezione: «fuori dal periodo vale la piantina»);
 *  3. altrimenti la voce di storia in vigore (`minimums`), come prima del 16/09;
 *     nelle caselle che la voce non nomina, il default della piantina.
 * La regola si accende se una voce copre il giorno OPPURE esiste almeno un
 * periodo per quel turno: senza nessuno dei due resta spenta (i mesi vecchi non
 * si riempiono di «scoperto»).
 */
export function minValuesForDay(
  layout: Pick<SalaLayout, 'minimums' | 'minimumPeriods'>,
  cards: Array<Pick<DeskCard, 'sectionKey' | 'title' | 'type'>>,
  dayISO: string,
  shift: SalaShiftType,
): Map<string, number> | null {
  const entry = effectiveEntry(layout.minimums, dayISO, shift)
  const periodi = (layout.minimumPeriods ?? []).filter(p => p?.shift === shift)
  if (!entry && !periodi.length) return null
  const keysConPeriodi = new Set(periodi.map(p => p.card))
  const out = new Map<string, number>()
  for (const card of cards) {
    const key = `${cardKeyOf(card)}|${shift}`
    const periodo = coveringPeriod(layout.minimumPeriods, cardKeyOf(card), shift, dayISO)
    if (periodo) {
      out.set(key, Math.max(0, Math.round(periodo.value)))
      continue
    }
    if (keysConPeriodi.has(cardKeyOf(card))) {
      out.set(key, defaultMinFor(card, shift))
      continue
    }
    const v = entry?.values?.[key]
    out.set(key, Number.isFinite(v) ? Math.max(0, Math.round(v as number)) : defaultMinFor(card, shift))
  }
  return out
}

/**
 * I valori in vigore nel giorno+turno indicati su TUTTI i turni — precompilazione
 * del pannello admin. Se non c'è storia, si parte dai default della piantina.
 * `from`/`fromShift` dicono da quando la fotografia È quella mostrata.
 */
export function snapshotForDay(
  layout: Pick<SalaLayout, 'minimums' | 'minimumPeriods'>,
  cards: Array<Pick<DeskCard, 'sectionKey' | 'title' | 'type'>>,
  dayISO: string,
  shift: SalaShiftType = 'M',
): { values: Record<string, number>; from: string | null; fromShift: SalaShiftType | null } {
  const entry = effectiveEntry(layout.minimums, dayISO, shift)
  const out: Record<string, number> = {}
  for (const card of cards) {
    for (const s of SALA_SHIFTS) {
      const key = `${cardKeyOf(card)}|${s}`
      // I PERIODI della casella vincono sulla fotografia: se uno è in vigore, il
      // numero mostrato (e risalvato come base) è il suo.
      const periodo = coveringPeriod(layout.minimumPeriods, cardKeyOf(card), s, dayISO)
      if (periodo) {
        out[key] = Math.max(0, Math.round(periodo.value))
        continue
      }
      const v = entry?.values?.[key]
      out[key] = Number.isFinite(v) ? Math.max(0, Math.round(v as number)) : defaultMinFor(card, s)
    }
  }
  return { values: out, from: entry?.from ?? null, fromShift: entry ? entryShift(entry) : null }
}

/**
 * Aggiunge (o sostituisce, se la COPPIA data+turno coincide) una voce di storia e
 * la mantiene ordinata per data e turno. Due voci dello stesso giorno ma con
 * turni diversi convivono (è il senso della richiesta 16/09/2026: «dal 20/9,
 * turno P»). Ritorna la nuova lista: il salvataggio passa da
 * `onSave({ cards, defaults, minimums })`, quindi la piantina e i minimi
 * restano un unico documento.
 */
export function withMinimoEntry(
  entries: SalaMinimoEntry[] | undefined,
  entry: SalaMinimoEntry,
): SalaMinimoEntry[] {
  const stessa = (e: SalaMinimoEntry) =>
    e.from === entry.from && shiftIndex(entryShift(e)) === shiftIndex(entryShift(entry))
  const out = (entries ?? []).filter(e => !stessa(e))
  out.push(entry)
  return out.sort(confronto)
}
