import type { SalaMonthData } from '@/types/database'
import { personNameMatches, type PersonRef } from '@/lib/person-shift'
import { isShiftWorkCode } from '@/lib/shift-tokens'
import type { BareOwnerMap } from '@/lib/shift-teams-matching'

/**
 * Teorico per persona: nei mesi con PDF è la riga base del PDF (colonna `t` del
 * parser v2); per i mesi senza PDF il teorico si PREDICE dalla storia dei PDF.
 * Due livelli di predizione:
 *
 *  1. «cycle»    — periodo rigido di calendario (persone con piano esattamente
 *                  periodico, es. cicli di 12 giorni: verificato 100% sui PDF).
 *  2. «rotation»— continuazione a blocchi: i blocchi di lavoro (P…M…N sulla
 *                 stessa sezione) si susseguono sempre nello stesso ordine ma i
 *                 riposi e la lunghezza di qualche blocco variano (piano
 *                 ritoccato a mano, es. ciclo reale di ~41gg della tipologia
 *                 «in terza», non periodico su calendario). Si predice con una
 *                 piccola macchina a stati: firma del blocco → successore
 *                 storico (riposi compresi).
 *
 * La rotazione delle squadre del DB è solo l'ultimo fallback: il seed tronca i
 * cicli più lunghi di 28gg e non coincide con i PDF reali (verifica 2026-09:
 * ~56% di corrispondenza) — non va usata quando esiste storia PDF.
 */

/** Sotto questa confidenza il ciclo rigido non viene usato (si prova la rotazione). */
const MIN_CYCLE_CONFIDENCE = 0.85

/** Servono almeno così tanti giorni di PDF per dedurre qualcosa. */
const MIN_DAYS = 14
/** Giorni minimi oltre il primo periodo (prova di ripetizione del ciclo). */
const MIN_TAIL = 7
/** Periodo massimo cercato: cicli più lunghi passano alla rotazione a blocchi. */
const MAX_PERIOD = 60

// ─── helpers sulle date ──────────────────────────────────────────────────────

/** «2026-09-14» → numero assoluto di giorni (chiave numerica stabile, UTC). */
export function dayKey(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

function isoFromDayKey(key: number): string {
  return new Date(key * 86400000).toISOString().slice(0, 10)
}

function daysInMonthOf(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * Turni di lavoro: M/P/N con sezione, «nudi» senza sezione (M/N/P) e i token
 * generici dei caposquadra (DC…). Serve a valutare se un mese di PDF può
 * confermare/spostare l'ancora dei cicli.
 */
function isWorkToken(token: string): boolean {
  return isShiftWorkCode(token) || /^DC/.test(token)
}

/**
 * Chiave di confronto per il ciclo: per i turni M/P/N ignora lo slot T/S (lo
 * slot alterna senza cambiare turno: contandolo il ciclo raddoppierebbe) e il
 * suffisso TIR. RM/RC/RI collassano in un unico simbolo «riposo». Tutto il
 * resto (assenze, disponibilità, attività senza sezione) è rumore: compare solo
 * in alcuni giorni e non deve confermare né smentire il ciclo.
 */
export function cycleKey(token: string): string {
  const t = (token ?? '').trim()
  if (!t) return ''
  if (isShiftWorkCode(t)) {
    const bare = /^[MNP]$/.test(t)
    return bare ? t : t.replace(/(TIR|[ST])$/, '')
  }
  if (/^DC/.test(t)) return t
  if (/^(RM|RC|RI)$/.test(t)) return 'R'
  return ''
}

function toMap(
  pdfMonths: Map<string, SalaMonthData> | Record<string, SalaMonthData>,
): Map<string, SalaMonthData> {
  return pdfMonths instanceof Map ? pdfMonths : new Map(Object.entries(pdfMonths))
}

// ─── sequenza teorico dalla storia dei PDF ───────────────────────────────────

function buildSeq(
  pdfMonths: Map<string, SalaMonthData>,
  user: PersonRef | null | undefined,
  duplicateCognomi?: Set<string>,
  bareOwners?: BareOwnerMap | null,
): { seq: Map<number, string>; months: string[] } | null {
  if (!user?.cognome || pdfMonths.size === 0) return null
  const seq = new Map<number, string>()
  const months = [...pdfMonths.keys()].sort()
  for (const month of months) {
    const data = pdfMonths.get(month)!
    const idx = data.names.findIndex(n => personNameMatches(n, user, duplicateCognomi, bareOwners))
    if (idx < 0) continue
    const row = data.rows[idx]
    if (!row) continue
    const code = (i: number | undefined) => data.codes[i ?? 0] ?? ''
    for (let d = 1; d <= data.days; d++) {
      seq.set(dayKey(`${month}-${String(d).padStart(2, '0')}`), code(row.t?.[d - 1]))
    }
  }
  if (seq.size < MIN_DAYS) return null
  return { seq, months }
}

// ─── livello 1: periodo rigido ───────────────────────────────────────────────

/** Ciclo rigido dedotto: cycle[r] è il codice del giorno anchor + r. */
export interface PersonCycle {
  cycle: string[]
  /** Data ISO su cui cade cycle[0]. */
  anchor: string
  /** Giorni di PDF che confermano il ciclo. */
  support: number
  /** Rapporto di conferma 0..1. */
  confidence: number
}


function deduceCycleFromSeq(seq: Map<number, string>): PersonCycle | null {
  if (seq.size < MIN_DAYS) return null

  const keys = [...seq.keys()].sort((a, b) => a - b)
  const first = keys[0]
  const last = keys[keys.length - 1]
  const maxPeriod = Math.min(last - first + 1 - MIN_TAIL, MAX_PERIOD)
  if (maxPeriod < 1) return null

  const days = [...seq.entries()].sort((a, b) => a[0] - b[0])

  // periodo più piccolo coerente: per ogni classe di resto vince il codice più
  // frequente; si tollera solo un 2% di conflitti (ritocchi di piano).
  for (let p = 1; p <= maxPeriod; p++) {
    const tally: Map<string, { n: number; raw: string }>[] = Array.from({ length: p }, () => new Map())
    let compared = 0
    for (const [key, token] of days) {
      const k = cycleKey(token)
      if (!k) continue
      compared++
      const t = tally[(key - first) % p]
      const cur = t.get(k)
      if (cur) cur.n++
      else t.set(k, { n: 1, raw: token })
    }
    if (tally.some(t => t.size === 0)) continue  // non copre tutto il periodo
    let ok = 0
    let bad = 0
    const cycle: string[] = []
    for (const t of tally) {
      let bestN = 0
      let raw = ''
      let tot = 0
      for (const { n, raw: r } of t.values()) {
        tot += n
        if (n > bestN) { bestN = n; raw = r }
      }
      ok += bestN
      bad += tot - bestN
      cycle.push(raw)
    }
    if (compared > 0 && bad / compared > 0.02) continue
    // guardie anti-degenerazione: serve varietà e almeno un turno di lavoro
    const keySet = new Set(cycle.map(cycleKey))
    if (keySet.size < 2) continue
    if (![...keySet].some(k => k !== 'R')) continue
    return {
      cycle,
      anchor: isoFromDayKey(first),
      support: ok,
      confidence: ok / compared,
    }
  }
  return null
}

/** Teorico previsto per `dateISO` dal ciclo rigido. '' se non coperto. */
function tokenFromCycle(
  cycle: PersonCycle | null | undefined,
  dateISO: string,
): string {
  if (!cycle?.cycle.length || !cycle.anchor) return ''
  const p = cycle.cycle.length
  const idx = (((dayKey(dateISO) - dayKey(cycle.anchor)) % p) + p) % p
  return cycle.cycle[idx] ?? ''
}

// ─── livello 2: rotazione a blocchi (macchina a stati compatta) ──────────────

/** Blocco di lavoro: giorni consecutivi con token di lavoro (es. «P5 M5 N5»). */
interface WorkRun {
  tokens: string[]
  endKey: number
  /** Teorico nei giorni tra il blocco precedente e questo (i riposi). */
  before: string[] | null
}

function buildRuns(seq: Map<number, string>): WorkRun[] {
  const keys = [...seq.keys()].sort((a, b) => a - b)
  // segmenti di giorni consecutivi: un buco di mesi senza PDF spezza la storia
  const segments: number[][] = []
  for (const k of keys) {
    const seg = segments[segments.length - 1]
    if (seg && k === seg[seg.length - 1] + 1) seg.push(k)
    else segments.push([k])
  }

  const runs: WorkRun[] = []
  for (const seg of segments) {
    let cur: { tokens: string[]; end: number; buffer: string[] } | null = null
    for (const k of seg) {
      const raw = seq.get(k)!
      if (isWorkToken(raw)) {
        if (cur && k === cur.end + 1) {
          cur.tokens.push(raw)
          cur.end = k
        } else {
          if (cur) runs.push({ tokens: cur.tokens, endKey: cur.end, before: cur.buffer })
          // primo blocco di un segmento: before null (i riposi prima del buco non sono noti)
          cur = { tokens: [raw], end: k, buffer: [] }
        }
        // marca: i run che aprono un segmento vengono corretti sotto
      } else if (cur) {
        cur.buffer.push(raw)
      }
    }
    if (cur) runs.push({ tokens: cur.tokens, endKey: cur.end, before: cur.buffer })
  }
  // before = null per il primo run assoluto e per i run che aprono un segmento
  const segStarts = new Set(segments.map(s => s[0]))
  runs.forEach((r, i) => {
    if (i === 0 || segStarts.has(r.endKey - r.tokens.length + 1)) r.before = null
  })
  return runs
}

function tokenSeqEquals(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i])
}

function tokenSeqStartsWith(a: string[], prefix: string[]): boolean {
  return a.length >= prefix.length && prefix.every((t, i) => a[i] === t)
}

/**
 * Macchina a stati della rotazione: firma del blocco → transizione storica più
 * recente e «fidata» (il successore non deve essere un blocco troncato né una
 * transizione attraverso un buco di mesi). Compatta: una decina di stati a
 * persona, adatta a viaggiare server → client.
 */
export interface RotationMachine {
  /** firma (token.join('|')) → riposi prima + token del blocco successore */
  states: Record<string, { b: string[]; t: string[] }>
  /** blocco in corso all'ultimo giorno coperto dai PDF (eventualmente troncato) */
  current: string[]
  /** occorrenza storica più lunga del blocco in corso, per completarlo */
  completion: string[] | null
  /** ultima data coperta dai PDF (chiave giorno assoluta) */
  lastKey: number
}

function buildRotationMachine(runs: WorkRun[]): RotationMachine | null {
  if (runs.length < 2) return null

  // un successore è «fidato» se il blocco successore compare altrove completo
  // (identico o prefisso di un'occorrenza più lunga): esclude le code troncate
  // dalla fine dei PDF e le transizioni attraverso buchi di mesi.
  const trustedSuccessor = (s: WorkRun): boolean => {
    if (!s.before) return false
    return runs.some(r =>
      tokenSeqEquals(r.tokens, s.tokens) ||
      (tokenSeqStartsWith(r.tokens, s.tokens) && r.tokens.length > s.tokens.length),
    )
  }

  // Transizioni storiche per firma del blocco di partenza. Le firme IGNORANO
  // lo slot T/S (lo stesso blocco sezione 5 compare come P5T|M5T|N5T e come
  // P5S|M5S|N5S: fondendole raddoppiano le osservazioni per stato). I riposi
  // tra un blocco e il successore VARIANO (ritocchi di piano: 1-3 giorni): si
  // prende la variante più frequente (parità → la più recente), non semplicemente
  // l'ultima occorrenza — verificato: la maggioranza sbaglia di molto meno.
  const tally: Record<string, { b: string; t: string[]; order: number }[]> = {}
  for (let k = 0; k < runs.length - 1; k++) {
    const succ = runs[k + 1]
    if (!trustedSuccessor(succ)) continue
    ;(tally[runs[k].tokens.map(cycleKey).join('|')] ??= []).push({
      b: succ.before!.join('|'),
      t: succ.tokens,
      order: k,
    })
  }

  const states: Record<string, { b: string[]; t: string[] }> = {}
  for (const [sig, list] of Object.entries(tally)) {
    const counts = new Map<string, number>()
    for (const it of list) counts.set(it.b, (counts.get(it.b) ?? 0) + 1)
    let bestB = ''
    let bestN = -1
    for (const [b, n] of counts) {
      if (n > bestN) { bestB = b; bestN = n }
    }
    // a parità di conteggio vince l'occorrenza più recente con quel riposo
    const winner = [...list].reverse().find(it => it.b === bestB)!
    states[sig] = { b: bestB.split('|'), t: winner.t }
  }
  if (Object.keys(states).length === 0) return null

  const current = runs[runs.length - 1].tokens
  let completion: string[] | null = null
  if (!current.some(t => t.startsWith('N') || t.startsWith('DC'))) {
    // il blocco in corso non finisce con la notte: è stato troncato dalla fine
    // dei PDF → cerca l'occorrenza storica più lunga con lo stesso inizio
    for (let k = runs.length - 2; k >= 0; k--) {
      if (tokenSeqStartsWith(runs[k].tokens, current) && runs[k].tokens.length > current.length) {
        completion = runs[k].tokens
        break
      }
    }
  }
  return { states, current, completion, lastKey: runs[runs.length - 1].endKey }
}

// ─── API combinata (serializzabile server → client) ──────────────────────────

export interface PersonTheoretical {
  /** «cycle» = periodo rigido; «rotation» = macchina a stati dei blocchi. */
  tier: 'cycle' | 'rotation'
  cycle: PersonCycle | null
  machine: RotationMachine | null
}

/**
 * Costruisce il predittore del teorico per una persona dalla storia dei PDF.
 * Null se la persona non compare nei PDF (o storia troppo corta): in quel caso
 * resta la rotazione del DB.
 */
export function buildPersonTheoretical(
  pdfMonths: Map<string, SalaMonthData> | Record<string, SalaMonthData>,
  user: PersonRef | null | undefined,
  duplicateCognomi?: Set<string>,
  bareOwners?: BareOwnerMap | null,
): PersonTheoretical | null {
  const built = buildSeq(toMap(pdfMonths), user, duplicateCognomi, bareOwners)
  if (!built) return null

  const cycle = deduceCycleFromSeq(built.seq)
  if (cycle && cycle.confidence >= MIN_CYCLE_CONFIDENCE) {
    return { tier: 'cycle', cycle, machine: null }
  }

  const machine = buildRotationMachine(buildRuns(built.seq))
  if (machine) return { tier: 'rotation', cycle, machine }
  if (cycle) return { tier: 'cycle', cycle, machine: null }
  return null
}

/**
 * Teorico previsto per tutto il mese (array indicizzato sul giorno − 1).
 * Livello «rotation»: i giorni entro l'ultimo PDF restano '' (lì valgono i
 * PDF stessi); «cycle»: la predizione copre qualsiasi data.
 */
export function predictTheoreticalMonth(
  src: PersonTheoretical | null | undefined,
  month: string,
): string[] {
  const n = daysInMonthOf(month)
  if (!src) return new Array(n).fill('')

  if (src.tier === 'cycle' && src.cycle) {
    return Array.from({ length: n }, (_, i) =>
      tokenFromCycle(src.cycle, `${month}-${String(i + 1).padStart(2, '0')}`),
    )
  }

  if (src.tier === 'rotation' && src.machine) {
    const { states, completion, lastKey } = src.machine
    const out: string[] = new Array(n).fill('')
    const startKey = dayKey(`${month}-01`)
    const endKey = startKey + n - 1
    let day = Math.max(startKey, lastKey + 1)
    if (day > endKey) return out
    const emit = (raw: string) => {
      if (day >= startKey && day <= endKey) out[day - startKey] = raw
      day++
    }

    let anchor = [...src.machine.current]
    // A) completa il blocco troncato dalla fine dei PDF
    if (completion && tokenSeqStartsWith(completion, anchor) && completion.length > anchor.length) {
      for (const t of completion.slice(anchor.length)) emit(t)
      anchor = [...completion]
    }
    // B) cammina la macchina: riposi storici + blocco successore
    for (let guard = 0; guard < 80 && day <= endKey; guard++) {
      const st = states[anchor.map(cycleKey).join('|')]
      if (!st) break
      for (const t of st.b) emit(t)
      for (const t of st.t) emit(t)
      anchor = [...st.t]
    }
    return out
  }

  return new Array(n).fill('')
}

// ─── colori delle card «Il tuo turno» (variante E) ─────────────────────────

/** Tipologia di contenuto di una card del calendario personale. */
export type CardKind =
  | 'mattina'
  | 'pomeriggio'
  | 'notte'
  | 'rest'
  | 'availability'
  | 'absence'
  | 'duty'

/** Colori { sfondo, testo } per tipologia; `undefined` = il tema fa da padrone (default CSS). */
export type CardPalette = Partial<Record<CardKind, { bg: string; text: string }>>

/** Classi CSS della tinta di ogni tipologia di card (i colori stanno in globals.css:
 *  `.cell-tint-*` legge gli override dell'utente da `--c-bg`/`--c-text`).
 *  Le usano le card di /tuoturno e il pannello «Personalizza le card». */
export const CARD_TINT_CLASS: Record<CardKind, string> = {
  mattina: 'cell-tint-m',
  pomeriggio: 'cell-tint-p',
  notte: 'cell-tint-n',
  rest: 'cell-tint-rest',
  availability: 'cell-tint-avail',
  absence: 'cell-tint-abs',
  duty: 'cell-tint-duty',
}

export const CARD_KINDS: { kind: CardKind; label: string; hint: string }[] = [
  { kind: 'pomeriggio', label: 'Pomeriggio (P)', hint: 'Turni pomeriggio' },
  { kind: 'mattina', label: 'Mattina (M)', hint: 'Turni mattina' },
  { kind: 'notte', label: 'Notte (N)', hint: 'Turni notte' },
  { kind: 'rest', label: 'Riposo (RM/RC/RI)', hint: 'Riposi' },
  { kind: 'availability', label: 'Disponibilità (D)', hint: 'Disponibilità' },
  { kind: 'absence', label: 'Assenza (A, F.E., VS…)', hint: 'Assenze e congedi' },
  { kind: 'duty', label: 'Senza sezione (Sp, ISp…)', hint: 'Presente ma non in sezione' },
]

// ── Le preferenze di aspetto sono UNA PER TEMA (richiesta 18/09/2026) ────────

/**
 * La regola, in una riga: **quello che si sceglie in tema chiaro non tocca il
 * tema scuro, e viceversa**.
 *
 * Vale per tutte e tre le preferenze di aspetto di /tuoturno — palette dei
 * colori, stile dei giorni diversi dal teorico, contorno «da confermare» —
 * perché sono tutte scelte che si fanno GUARDANDO lo schermo: erano condivise fra
 * i due temi, e una tinta che si legge bene sul chiaro poteva diventare
 * illeggibile sullo scuro (è la richiesta che ha portato a questa forma).
 *
 * `light` e `dark` sono i temi come li risolve next-themes (la preferenza del
 * sistema, se l'utente segue il sistema).
 *
 * FORMATO SU DISCO: una busta `{ light: …, dark: … }` per chiave. Un tema senza
 * voce vuol dire «non ho scelto niente, vale il default» — e in quel caso la
 * chiave non si scrive affatto: il default non è una personalizzazione, è quello
 * che l'app mostra comunque (in chiaro la palette «Tema», in scuro «Notte»).
 * Il formato VECCHIO — una preferenza sola valida in entrambi i temi — si legge
 * ancora e si copia nei due, così nessuno perde quello che aveva scelto.
 */
export type PaletteMode = 'light' | 'dark'


/** La busta per tema: `null` = nessuna scelta per quel tema (vale il default). */
interface Busta<T> { light: T | null; dark: T | null }

function bustaVuota<T>(): Busta<T> {
  return { light: null, dark: null }
}

/**
 * Legge la busta, con la migrazione dal formato vecchio.
 *
 * `JSON.parse` può FALLIRE e non è un caso di scuola: le due preferenze a stringa
 * sono state scritte per anni come valore nudo (`localStorage.setItem(k, 'strike')`,
 * non `JSON.stringify`). Se il testo non è JSON, è il valore vecchio — non si
 * butta via niente.
 */
function leggiBusta<T>(chiave: string, valida: (g: unknown) => T | null, clona: (v: T) => T): Busta<T> {
  const vuota = bustaVuota<T>()
  try {
    const raw = localStorage.getItem(chiave)
    if (!raw) return vuota
    let parsed: unknown = raw
    try {
      parsed = JSON.parse(raw)
    } catch {
      /* non è JSON: è il valore nudo del formato vecchio */
    }
    const busta = parsed as { light?: unknown; dark?: unknown } | null
    const èBusta = !!busta && typeof busta === 'object' && !Array.isArray(busta) && ('light' in busta || 'dark' in busta)
    if (!èBusta) {
      const vecchio = valida(parsed)
      return vecchio === null ? vuota : { light: vecchio, dark: clona(vecchio) }
    }
    return { light: valida(busta!.light), dark: valida(busta!.dark) }
  } catch {
    return vuota
  }
}

/** Scrive la busta, e TOGLIE la chiave quando non c'è più nessuna scelta. */
function scriviBusta<T>(chiave: string, valori: Busta<T>): void {
  try {
    if (valori.light === null && valori.dark === null) {
      localStorage.removeItem(chiave)
      return
    }
    localStorage.setItem(chiave, JSON.stringify({ light: valori.light, dark: valori.dark }))
  } catch {
    /* storage pieno o non disponibile: la preferenza resta solo per la sessione */
  }
}

/**
 * Una preferenza a scelta fra poche possibilità, scritta come stringa: `null` =
 * valore non riconosciuto (meglio il default che una preferenza inventata).
 */
function validaScelta<T extends string>(ammesse: readonly T[]) {
  return (g: unknown): T | null => {
    if (g === null || g === undefined) return null
    const v = String(g).replace(/"/g, '')
    return (ammesse as readonly string[]).includes(v) ? (v as T) : null
  }
}

const PALETTE_KEY = 'tuoturno-colori'

/** La palette VUOTA: è il default di entrambi i temi (i colori del tema). */
const PALETTE_VUOTA: CardPalette = {}

/** Una palette salvata è valida solo se OGNI voce è una coppia di colori pieni. */
function validaPalette(g: unknown): CardPalette | null {
  if (!g || typeof g !== 'object') return null
  const out: CardPalette = {}
  for (const { kind } of CARD_KINDS) {
    const v = (g as Record<string, { bg?: unknown; text?: unknown }>)[kind]
    if (v && typeof v.bg === 'string' && typeof v.text === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.bg) && /^#[0-9a-fA-F]{6}$/.test(v.text)) {
      out[kind] = { bg: v.bg, text: v.text }
    }
  }
  return out
}

function clonaPalette(p: CardPalette): CardPalette {
  const out: CardPalette = {}
  for (const { kind } of CARD_KINDS) {
    const v = p[kind]
    if (v) out[kind] = { bg: v.bg, text: v.text }
  }
  return out
}

/**
 * Cache del modulo, UNA PER TEMA: `getSnapshot` di useSyncExternalStore deve
 * restituire lo STESSO riferimento tra un cambio e l'altro — un oggetto nuovo a
 * ogni chiamata fa andare React in loop («The result of getSnapshot should be
 * cached to avoid an infinite loop») e manda in errore la pagina. Il riferimento
 * cambia SOLO dopo set/reset, che notificano gli iscritti.
 */
let paletteCache: Busta<CardPalette> | null = null

function cachedPalette(): Busta<CardPalette> {
  if (paletteCache === null) paletteCache = leggiBusta(PALETTE_KEY, validaPalette, clonaPalette)
  return paletteCache
}

function scriviPalette(mode: PaletteMode, p: CardPalette): void {
  const busta: Busta<CardPalette> = { ...cachedPalette() }
  busta[mode] = Object.keys(p).length ? p : null
  paletteCache = busta
  scriviBusta(PALETTE_KEY, busta)
  cardPaletteStore.listeners.forEach(l => l())
}

/**
 * La palette personalizzata dell'utente, persistita in localStorage e TENUTA
 * DIVISA PER TEMA (richiesta 18/09/2026). Store esterno letto con
 * `useSyncExternalStore` (niente setState in effect: il lint lo vieta).
 *
 * Senza personalizzazione per quel tema la palette è VUOTA: le card mostrano i
 * colori del tema (in chiaro «Tema», in scuro «Notte») — vedi
 * `lib/card-palettes.ts`, `themePaletteFor`. Applicare un preset scrive la
 * scelta per QUEL tema soltanto.
 */
export const cardPaletteStore = {
  listeners: new Set<() => void>(),
  getFor(mode: PaletteMode): CardPalette {
    return cachedPalette()[mode] ?? PALETTE_VUOTA
  },
  setFor(mode: PaletteMode, kind: CardKind, colors: { bg: string; text: string } | null) {
    const p: CardPalette = { ...cardPaletteStore.getFor(mode) }
    if (colors) p[kind] = colors
    else delete p[kind]
    scriviPalette(mode, p)
  },
  /**
   * Sostituisce TUTTA la palette di un tema in un colpo solo: è quello che serve
   * a una palette pronta del pannello (lib/card-palettes.ts), che ne cambia sette
   * insieme. Passare da setFor() sette volte farebbe sette scritture su
   * localStorage e sette render.
   */
  applyFor(mode: PaletteMode, colors: CardPalette) {
    scriviPalette(mode, clonaPalette(colors))
  },
  /** Ripristina i colori del tema SOLO per quel tema. */
  resetFor(mode: PaletteMode) {
    scriviPalette(mode, {})
  },
  /** Azzera le personalizzazioni di ENTRAMBI i temi (chiave tolta). */
  resetAll() {
    paletteCache = bustaVuota<CardPalette>()
    scriviBusta(PALETTE_KEY, paletteCache)
    cardPaletteStore.listeners.forEach(l => l())
  },
  subscribe(l: () => void) {
    cardPaletteStore.listeners.add(l)
    return () => {
      cardPaletteStore.listeners.delete(l)
    }
  },
}

/** Come mostrare i giorni in cui il reale differisce dal teorico. */
export type MismatchStyle = 'split' | 'strike'

const MISMATCH_KEY = 'tuoturno-mismatch'
const MISMATCH_STYLES: MismatchStyle[] = ['split', 'strike']

let mismatchCache: Busta<MismatchStyle> | null = null

function cachedMismatch(): Busta<MismatchStyle> {
  if (mismatchCache === null) {
    mismatchCache = leggiBusta(MISMATCH_KEY, validaScelta(MISMATCH_STYLES), v => v)
  }
  return mismatchCache
}

/**
 * «Card divisa in due» vs «teorico barrato a card intera», UNA SCELTA PER TEMA.
 * Lo snapshot è una stringa primitiva: stabile per Object.is senza cache.
 */
export const mismatchStyleStore = {
  listeners: new Set<() => void>(),
  getFor(mode: PaletteMode): MismatchStyle {
    return cachedMismatch()[mode] ?? 'split'
  },
  setFor(mode: PaletteMode, v: MismatchStyle) {
    const busta: Busta<MismatchStyle> = { ...cachedMismatch(), [mode]: v }
    mismatchCache = busta
    scriviBusta(MISMATCH_KEY, busta)
    mismatchStyleStore.listeners.forEach(l => l())
  },
  resetAll() {
    mismatchCache = bustaVuota<MismatchStyle>()
    scriviBusta(MISMATCH_KEY, mismatchCache)
    mismatchStyleStore.listeners.forEach(l => l())
  },
  subscribe(l: () => void) {
    mismatchStyleStore.listeners.add(l)
    return () => {
      mismatchStyleStore.listeners.delete(l)
    }
  },
}

/** Contorno dei giorni «da confermare» (turni in giallo): 4 varianti. */
export type PendingRing = 'yellow-solid' | 'yellow-dashed' | 'red-solid' | 'red-dashed'

const PENDING_RING_KEY = 'tuoturno-pending-ring'
const PENDING_RINGS: PendingRing[] = ['yellow-solid', 'yellow-dashed', 'red-solid', 'red-dashed']

let ringCache: Busta<PendingRing> | null = null

function cachedRing(): Busta<PendingRing> {
  if (ringCache === null) ringCache = leggiBusta(PENDING_RING_KEY, validaScelta(PENDING_RINGS), v => v)
  return ringCache
}

/**
 * Il contorno «da confermare» — colore (giallo/rosso) e tratto
 * (continuo/tratteggiato) — anche questo UNA SCELTA PER TEMA: una cornice gialla
 * su un fondo scuro e su un fondo chiaro non sono la stessa cosa da vedere.
 */
export const pendingRingStore = {
  listeners: new Set<() => void>(),
  getFor(mode: PaletteMode): PendingRing {
    return cachedRing()[mode] ?? 'yellow-solid'
  },
  setFor(mode: PaletteMode, v: PendingRing) {
    const busta: Busta<PendingRing> = { ...cachedRing(), [mode]: v }
    ringCache = busta
    scriviBusta(PENDING_RING_KEY, busta)
    pendingRingStore.listeners.forEach(l => l())
  },
  resetAll() {
    ringCache = bustaVuota<PendingRing>()
    scriviBusta(PENDING_RING_KEY, ringCache)
    pendingRingStore.listeners.forEach(l => l())
  },
  subscribe(l: () => void) {
    pendingRingStore.listeners.add(l)
    return () => {
      pendingRingStore.listeners.delete(l)
    }
  },
}
