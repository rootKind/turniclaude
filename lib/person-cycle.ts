import type { SalaMonthData } from '@/types/database'
import { personNameMatches, type PersonRef } from '@/lib/person-shift'

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
export const MIN_CYCLE_CONFIDENCE = 0.85

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

export function daysInMonthOf(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Turni di lavoro: M/P/N con sezione e i token generici dei caposquadra (DC…). */
function isWorkToken(token: string): boolean {
  return /^[MNP][A-Z0-9]/.test(token) || /^DC/.test(token)
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
  if (/^[MNP][A-Z0-9]/.test(t)) return t.replace(/(TIR|[ST])$/, '')
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
): { seq: Map<number, string>; months: string[] } | null {
  if (!user?.cognome || pdfMonths.size === 0) return null
  const seq = new Map<number, string>()
  const months = [...pdfMonths.keys()].sort()
  for (const month of months) {
    const data = pdfMonths.get(month)!
    const idx = data.names.findIndex(n => personNameMatches(n, user, duplicateCognomi))
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
  /** Mesi (AA-MM) con PDF usati per la deduzione. */
  months: string[]
  cycle: string[]
  /** Data ISO su cui cade cycle[0]. */
  anchor: string
  /** Giorni di PDF che confermano il ciclo. */
  support: number
  /** Rapporto di conferma 0..1. */
  confidence: number
}

/**
 * Deduce il ciclo personale (periodo rigido di calendario) dalla storia dei
 * teorici dei PDF. Null se i dati non bastano o nessun periodo è coerente.
 */
export function deducePersonCycle(
  pdfMonths: Map<string, SalaMonthData> | Record<string, SalaMonthData>,
  user: PersonRef | null | undefined,
  duplicateCognomi?: Set<string>,
): PersonCycle | null {
  const built = buildSeq(toMap(pdfMonths), user, duplicateCognomi)
  if (!built) return null
  return deduceCycleFromSeq(built.seq, built.months)
}

function deduceCycleFromSeq(seq: Map<number, string>, months: string[]): PersonCycle | null {
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
      months,
      cycle,
      anchor: isoFromDayKey(first),
      support: ok,
      confidence: ok / compared,
    }
  }
  return null
}

/** Teorico previsto per `dateISO` dal ciclo rigido. '' se non coperto. */
export function tokenFromCycle(
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
): PersonTheoretical | null {
  const built = buildSeq(toMap(pdfMonths), user, duplicateCognomi)
  if (!built) return null

  const cycle = deduceCycleFromSeq(built.seq, built.months)
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

export const CARD_KINDS: { kind: CardKind; label: string; hint: string }[] = [
  { kind: 'pomeriggio', label: 'Pomeriggio (P)', hint: 'Turni pomeriggio' },
  { kind: 'mattina', label: 'Mattina (M)', hint: 'Turni mattina' },
  { kind: 'notte', label: 'Notte (N)', hint: 'Turni notte' },
  { kind: 'rest', label: 'Riposo (RM/RC/RI)', hint: 'Riposi' },
  { kind: 'availability', label: 'Disponibilità (D)', hint: 'Disponibilità' },
  { kind: 'absence', label: 'Assenza (A, F.E., VS…)', hint: 'Assenze e congedi' },
  { kind: 'duty', label: 'Senza sezione (Sp, ISp…)', hint: 'Presente ma non in sezione' },
]

const PALETTE_KEY = 'tuoturno-colori'

function readPalette(): CardPalette {
  try {
    const raw = localStorage.getItem(PALETTE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as CardPalette
    if (!parsed || typeof parsed !== 'object') return {}
    const out: CardPalette = {}
    for (const { kind } of CARD_KINDS) {
      const v = parsed[kind]
      if (v && typeof v.bg === 'string' && typeof v.text === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.bg) && /^#[0-9a-fA-F]{6}$/.test(v.text)) {
        out[kind] = { bg: v.bg, text: v.text }
      }
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Cache del modulo: `getSnapshot` di useSyncExternalStore deve restituire lo
 * STESSO riferimento tra un cambio e l'altro — un oggetto nuovo a ogni chiamata
 * fa andare React in loop («The result of getSnapshot should be cached to avoid
 * an infinite loop») e manda in errore la pagina. Il riferimento cambia SOLO
 * dopo set/reset, che notificano gli iscritti.
 */
let paletteCache: CardPalette | null = null

function cachedPalette(): CardPalette {
  if (paletteCache === null) paletteCache = readPalette()
  return paletteCache
}

/**
 * Palette personalizzata dell'utente, persistita in localStorage. Store esterno
 * letto con `useSyncExternalStore` (niente setState in effect: il lint lo vieta).
 */
export const cardPaletteStore = {
  listeners: new Set<() => void>(),
  get(): CardPalette {
    return cachedPalette()
  },
  set(kind: CardKind, colors: { bg: string; text: string } | null) {
    const p: CardPalette = { ...cachedPalette() }
    if (colors) p[kind] = colors
    else delete p[kind]
    paletteCache = p
    try {
      localStorage.setItem(PALETTE_KEY, JSON.stringify(p))
    } catch {
      /* storage pieno o non disponibile: la preferenza resta solo per la sessione */
    }
    cardPaletteStore.listeners.forEach(l => l())
  },
  reset() {
    paletteCache = {}
    try {
      localStorage.removeItem(PALETTE_KEY)
    } catch {
      /* come sopra */
    }
    cardPaletteStore.listeners.forEach(l => l())
  },
  subscribe(l: () => void) {
    cardPaletteStore.listeners.add(l)
    return () => {
      cardPaletteStore.listeners.delete(l)
    }
  },
}
