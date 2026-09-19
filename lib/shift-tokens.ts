import type { DaySchedule, SalaShiftType, SectionShiftData, ShiftType } from '@/types/database'

// ─── codici turno ────────────────────────────────────────────────────────────
// Logica condivisa tra il parser PDF (lib/pdf-parser.ts) e la generazione dei
// mesi teorici (lib/turni-teorici.ts).

/**
 * Il turno di un cambio («Mattina/Pomeriggio/Notte») nel codice della BOARD della
 * sala («M/P/N»): è il ponte fra la dashboard dei cambi e /turnisala.
 *
 * Vive QUI (modulo senza dipendenze server) e non in lib/queries/shift-cleanup,
 * perché lo usa anche il client: dalla card di un cambio si salta al turno
 * corrispondente della board (feature 18/09/2026). shift-cleanup lo ri-esporta.
 */
export const SHIFT_TO_SALA: Record<ShiftType, SalaShiftType> = {
  Mattina: 'M',
  Pomeriggio: 'P',
  Notte: 'N',
}

/**
 * DA UNA CARD DI CAMBIO AL TURNO IN SALA — un solo contratto, due lati
 * (feature 18/09/2026).
 *
 * Chi MANDA (la card in dashboard) costruisce la URL con `buildSalaFocusUrl`;
 * chi RICEVE (/turnisala) la legge con `parseSalaFocus`. Vivono qui, accanto alla
 * mappa M/P/N, perché i due lati devono restare d'accordo sui nomi dei
 * parametri: scriverli a mano in due file è come si rompono queste cose.
 *
 * Parametri: m=YYYY-MM, d=giorno, t=M|P|N, c=cognome, n=nome (facoltativo).
 * La persona viaggia per COGNOME+NOME (non per user_id) perché la board
 * riconosce le persone con i nomi del PDF (`matchesCognome`): è l'unica chiave
 * che la board sa usare.
 */
/** Il nome per esteso del turno di sala («M» → «Mattina»): serve ai messaggi
 *  (avviso «non è in sala nel turno …») e a tutto ciò che parla all'utente. */
export const SALA_SHIFT_LABEL: Record<SalaShiftType, ShiftType> = {
  M: 'Mattina',
  P: 'Pomeriggio',
  N: 'Notte',
}

/** Quanto dura il FLASH di «vengo da qui» (/turnisala): 3s (richiesta
 *  19/09/2026 — lampeggio, non un contorno statico che resta). Lo leggono la
 *  board (spegnimento) e la pagina (pulizia della URL, poco dopo) → una sola
 *  durata, un solo posto. Deve restare allineata a `.desk-card-flash`
 *  (app/globals.css): 4 battiti da 0,75s = 3s. */
export const SALA_FLASH_MS = 3000

export interface SalaFocus {
  /** Mese della board da aprire (YYYY-MM). */
  month: string
  day: number
  shift: SalaShiftType
  cognome: string
  nome: string | null
  /** Impronta della richiesta: identifica «questa» navigazione (per non
   *  riapplicarla a ogni render e per non ripetere l'avviso se non trovato). */
  token: string
}

export function buildSalaFocusUrl(input: {
  shiftDate: string
  offeredShift: ShiftType
  cognome: string
  nome?: string | null
  /** Parametri di CONTESTO della pagina di partenza da portarsi dietro (es. il
   *  bypass del guard PWA `dev=…`, o l'impersonazione `as=…`): il salto non deve
   *  far perdere il contesto in cui l'utente sta lavorando. I parametri della
   *  feature (m/d/t/c/n) vincono sempre. */
  from?: URLSearchParams | null
}): string | null {
  const month = input.shiftDate.slice(0, 7)
  const day = Number(input.shiftDate.slice(8, 10))
  const shift = SHIFT_TO_SALA[input.offeredShift]
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(day) || day < 1 || !shift) return null
  const params = new URLSearchParams({ m: month, d: String(day), t: shift, c: input.cognome })
  if (input.nome) params.set('n', input.nome)
  for (const [key, value] of input.from ?? []) {
    if (!params.has(key)) params.set(key, value)
  }
  return `/turnisala?${params.toString()}`
}

export function parseSalaFocus(search: string | URLSearchParams): SalaFocus | null {
  const params = typeof search === 'string'
    ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    : search
  const month = params.get('m') ?? ''
  const day = Number(params.get('d'))
  const shift = params.get('t') as SalaShiftType | null
  const cognome = params.get('c') ?? ''
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  if (!Number.isFinite(day) || day < 1 || day > 31) return null
  if (shift !== 'M' && shift !== 'P' && shift !== 'N') return null
  if (!cognome) return null
  const nome = params.get('n')
  return { month, day, shift, cognome, nome: nome || null, token: `m=${month}&d=${day}&t=${shift}&c=${cognome}&n=${nome ?? ''}` }
}

export interface ParsedShift {
  shift: SalaShiftType
  section: string
  slot: 'T' | 'S' | null
  isTir: boolean
}

export function isShiftCode(token: string): boolean {
  // Sezione anche in MAIUSCOLE MISTE (MDCIFTir, Miap, piaptir: richieste
  // 22/09/2026): [A-Za-z0-9@] invece di [A-Z0-9]. «Na» resta escluso
  // (disponibilità nave) e restano INVISIBILI per decisione utente 22/09:
  // NDis* (notti trasferta → gruppo Trasferte via isPresentNoSection),
  // MSb/PSb/GSb (sabati) e MSp@/GSp@/PSp@ (e-learning con turno).
  if (/^na$/i.test(token)) return false
  if (/^N?Dis/i.test(token)) return false
  if (/^[MNP]?Sb$/i.test(token)) return false
  if (/^[MNP]?Sp@$/i.test(token)) return false
  // prima lettera anche minuscola (il PDF scrive «piaptir»)
  return /^[MNPmnp][A-Za-z0-9@]+$/.test(token)
}

/**
 * Turno di lavoro M/P/N in qualsiasi forma: con sezione (M7S), «nudo» senza
 * sezione (M, N, P: es. SPAGNULO) o variante a maiuscole miste del PDF
 * (Mric, Miap, piaptir…). «Na»/«na» (disponibilità nave) inizia con N ma NON è
 * un turno; «NDisNa» neanche (seconda lettera maiuscola). Richiesta
 * 13/09/2026: questi codici non finiscono nella categoria U.
 */
export function isShiftWorkCode(token: string): boolean {
  const t = (token ?? '').trim()
  return (
    /^[MNP][A-Z0-9]/.test(t) ||
    /^[MNP]$/.test(t) ||
    (/^[MNPmnp][a-z]/.test(t) && !/^na$/i.test(t))
  )
}

export function parseShiftCode(token: string): ParsedShift {
  const shift = token[0].toUpperCase() as SalaShiftType
  const isTir = /TIR$/i.test(token)
  const raw = token.slice(1).replace(/TIR$/i, '')
  const m = raw.match(/^(\d+)([ST])?$/)
  if (m) return { shift, section: m[1], slot: (m[2] as 'T' | 'S') ?? null, isTir }
  // Sezione alfabetica: il PDF mescola maiuscole/minuscole (MRIC/Mric, MIAP/Miap,
  // IAP/iap…) — normalizzo così le colonne della giornata si fondono.
  const section = /^[A-Za-z]+$/.test(raw) ? raw.toUpperCase() : raw
  return { shift, section, slot: null, isTir }
}

export const ABSENT_CODES = new Set([
  'A', 'AG', 'F', 'RM', 'RC', 'RI', 'VS', 'D',
])

/**
 * Famiglia ASSENZE del PDF (richiesta 23/09/2026, blocco «Assenti» di
 * /turnisala): i codici base (ABSENT_CODES) più le varianti con qualificatore
 * che il PDF aggiunge («AG7», «F.E.» = ferie estiva). NON sono assenze le
 * presenze/attività invisibili per decisione utente (G, GIAP, GRicTir, TIR,
 * Na, MSb, 12.14…): restano fuori dal blocco Assenti.
 */
export function isAbsenceCode(token: string): boolean {
  const t = (token ?? '').trim()
  if (!t) return false
  if (ABSENT_CODES.has(t)) return true
  if (/^AG\d+$/i.test(t)) return true
  if (/^F\.?E\.?$/i.test(t)) return true
  return false
}

export function isPresentNoSection(token: string): boolean {
  if (ABSENT_CODES.has(token)) return false
  // Famiglie case-insensitive: il PDF mescola maiuscole (SpN/SPN/spn, SPCA,
  // SPW/ISPW, DisNa/DisCas…). Richiesta 13/09/2026.
  if (/^Sp[A-Za-z@]/i.test(token)) return true
  if (/^ISp[A-Za-z]/i.test(token)) return true
  // Dis* E NDis* (NDisNa = notte trasferta Napoli — utente 22/09/2026):
  // tutte le trasferte sede finiscono tra le altre presenti, gruppo Trasferte.
  if (/^N?Dis[A-Za-z]/i.test(token)) return true
  return false
}

/**
 * Attività senza sezione da mostrare tra le «Altri presenti» (richiesta
 * 22/09/2026): TUTOR con turno qualsiasi (MTUTOR/PTUTOR/GTUTOR — di tutta la
 * famiglia G solo GTUTOR è stato approvato dall'utente; G, GIAP, GRicTir,
 * GRICTIR restano invisibili) e Trasf (trasferta generica).
 */
export const NON_SECTION_DUTIES = new Set(['TUTOR'])

/**
 * DOVE LA BOARD METTE UN TOKEN — l'unica risposta a «dove lo vedo?»
 * (richiesta 19/09/2026: la verifica e la board devono rispondere la STESSA cosa).
 *
 * Riproduce, ramo per ramo, `applyTokenToDay` — l'unico posto in cui la board
 * decide DOVE scrive un nome:
 *   `card`  → una card di SEZIONE (l'unica cosa che si illumina come card);
 *   `altri` → la pillola della riga «Trasferte/Corsi/Istruttori/Altre attività»
 *             (presente in sala, nessuna sezione: turni «nudi» `M`/`N`/`P` es.
 *             SPAGNULO, `Sp*`, `ISp*`, `Dis*`/`NDis*` trasferte, `TUTOR`/`MTUTOR`);
 *   `null`  → la board non lo mostra affatto (riposi, assenze, codici invisibili
 *             per decisione utente: `G`, `MSb`, `12.14`, `Na`…).
 *
 * PERCHÉ esiste: la verifica del salto in sala chiedeva «che turno ha questa
 * persona?» a `salaCodeInfo`, che chiama `work` anche `MTUTOR`/`M`/`NDisNa`
 * (prima lettera M/N/P) → rispondeva «Mattina» e faceva partire il salto, ma la
 * board non ha nessuna card con quel nome → vecchio avviso GIALLO «non è in sala
 * …», anche nei mesi col PDF caricato.
 */
export type BoardPlacement =
  | { kind: 'card'; section: string }
  | { kind: 'altri' }

export function boardPlacementOf(token: string | null | undefined): BoardPlacement | null {
  const t = (token ?? '').trim()
  if (!t || ABSENT_CODES.has(t)) return null
  if (/^[MNP]$/.test(t)) return { kind: 'altri' }
  if (isPresentNoSection(t)) return { kind: 'altri' }
  if (isAltriPresentiToken(t)) return { kind: 'altri' }
  if (!isShiftCode(t)) return null
  const { section } = parseShiftCode(t)
  if (NON_SECTION_DUTIES.has(section.toUpperCase())) return { kind: 'altri' }
  return { kind: 'card', section }
}

/** Sezione (e turno) del token, quando la board lo mette su una CARD. */
export function sectionTurnOf(
  token: string | null | undefined,
): { section: string; shift: SalaShiftType } | null {
  const dove = boardPlacementOf(token)
  if (dove?.kind !== 'card') return null
  return { section: dove.section, shift: parseShiftCode((token ?? '').trim()).shift }
}

/** true se il token finisce in una card di SEZIONE della board (vedi `sectionTurnOf`). */
export function isSectionTurnToken(token: string | null | undefined): boolean {
  return boardPlacementOf(token)?.kind === 'card'
}

/** true se il token finisce nella riga «Altre attività» (pillola), non su una card. */
export function isAltriPresentiPlacementToken(token: string | null | undefined): boolean {
  return boardPlacementOf(token)?.kind === 'altri'
}

/**
 * Token del quale registrare la presenza senza sezione (per il raggruppamento).
 */
export function isAltriPresentiToken(token: string): boolean {
  if (ABSENT_CODES.has(token)) return false
  // TUTOR con qualunque turno, incluse le guardie (GTUTOR — utente 22/09/2026;
  // G, GIAP, GRicTir, GRICTIR SENZA tutor restano invisibili).
  if (/^(?:[MNP]|G)?TUTOR$/i.test(token)) return true
  if (/^Trasf$/i.test(token)) return true
  return false
}

export function emptyShift(): SectionShiftData {
  return { surnames: { T: [], S: [], noSlot: [] }, tirocinanti: [] }
}

/**
 * Applica un token turno a un giorno della programmazione. Ritorna false se il
 * token non produce presenze (assente, riposo, disponibilità o codice ignoto).
 *
 * Quando `day.altriPresentiTokens` esiste (opzionale), ogni presenza senza
 * sezione vi registra anche il TOKEN originale — la board /turnisala lo usa
 * per raggruppare le altre presenti per tipologia (richiesta 22/09/2026).
 */
export function applyTokenToDay(day: DaySchedule, name: string, token: string): boolean {
  if (!token || ABSENT_CODES.has(token)) return false

  // Turno «nudo» senza sezione (M, N, P: es. SPAGNULO): presente, ma la sezione
  // non è indicata nel PDF — finisce tra le altre presenze, non in una colonna.
  if (/^[MNP]$/.test(token)) {
    day.altriPresenti.push(name)
    day.altriPresentiTokens?.push({ name, token })
    return true
  }

  if (isPresentNoSection(token)) {
    day.altriPresenti.push(name)
    day.altriPresentiTokens?.push({ name, token })
    return true
  }

  if (isAltriPresentiToken(token)) {
    day.altriPresenti.push(name)
    day.altriPresentiTokens?.push({ name, token })
    return true
  }

  if (!isShiftCode(token)) return false

  const { shift, section, slot, isTir } = parseShiftCode(token)

  if (NON_SECTION_DUTIES.has(section.toUpperCase())) {
    day.altriPresenti.push(name)
    day.altriPresentiTokens?.push({ name, token })
    return true
  }

  const secs = day.sections
  if (!secs[section]) secs[section] = { M: emptyShift(), N: emptyShift(), P: emptyShift() }
  const shiftData = secs[section][shift]

  if (isTir) {
    shiftData.tirocinanti.push(name)
  } else {
    const key = slot ?? 'noSlot'
    shiftData.surnames[key as 'T' | 'S' | 'noSlot'].push(name)
  }
  return true
}