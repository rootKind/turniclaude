import type { DaySchedule, SalaMonthData } from '@/types/database'
import { NON_SECTION_DUTIES, applyTokenToDay, isPresentNoSection, isShiftWorkCode, parseShiftCode } from '@/lib/shift-tokens'
import { matchesCognome } from '@/lib/utils'
import { personNameMatches, type PersonRef } from '@/lib/person-shift'
import type { BareOwnerMap } from '@/lib/shift-teams-matching'

/**
 * Turni reali (dal PDF) di UNA persona in un mese, con i codici COMPLETI:
 * turni, riposi, assenze, disponibilità e attività senza sezione.
 */
export interface MonthPersonShifts {
  name: string
  /** Codice effettivo per ogni giorno (indice 0 = giorno 1); '' se la cella è vuota. */
  days: string[]
  /** Codice teorico pre-stampato sul PDF (riga base, senza le correzioni). */
  teorico: string[]
  /** Giorni (1-based) con sfondo giallo nel PDF = «turno da confermare». */
  yellow: number[]
}

// ─── dizionario / codifica compatta ──────────────────────────────────────────

/** Codifica la forma compatta «colonnare» (v2) a partire dalle persone del mese. */
export function encodeSalaMonth(people: MonthPersonShifts[], days: number): SalaMonthData {
  const index = new Map<string, number>([['', 0]])
  const codes: string[] = ['']
  const intern = (token: string | undefined): number => {
    const t = token ?? ''
    let i = index.get(t)
    if (i === undefined) {
      i = codes.length
      codes.push(t)
      index.set(t, i)
    }
    return i
  }

  const names: string[] = []
  const rows = people.map(p => {
    names.push(p.name)
    const row = {
      d: Array.from({ length: days }, (_, i) => intern(p.days[i])),
      t: Array.from({ length: days }, (_, i) => intern(p.teorico[i])),
    } as SalaMonthData['rows'][number]
    if (p.yellow.length) row.y = [...p.yellow].sort((a, b) => a - b)
    return row
  })

  return { v: 2, days, codes, names, rows }
}

/** True se il jsonb salvato è già nella forma compatta v2. */
export function isSalaMonthData(raw: unknown): raw is SalaMonthData {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as SalaMonthData
  return r.v === 2 && Array.isArray(r.names) && Array.isArray(r.rows) && Array.isArray(r.codes)
}

/** Espande la forma compatta in persone con i codici per giorno. */
export function decodeSalaMonth(data: SalaMonthData): MonthPersonShifts[] {
  const code = (i: number | undefined): string => data.codes[i ?? 0] ?? ''
  const len = data.days
  return data.names.map((name, r) => {
    const row = data.rows[r]
    return {
      name,
      days: Array.from({ length: len }, (_, i) => code(row?.d?.[i])),
      teorico: Array.from({ length: len }, (_, i) => code(row?.t?.[i])),
      yellow: row?.y ?? [],
    }
  })
}

/**
 * Ricostruisce la vista per-giorno (sezioni + altri presenti) usata da turnisala.
 * È la stessa cosa che faceva il parser v1, ma a partire dai codici salvati.
 */
export function buildScheduleFromMonthData(data: SalaMonthData): Record<number, DaySchedule> {
  const schedule: Record<number, DaySchedule> = {}
  for (let d = 1; d <= data.days; d++) schedule[d] = { sections: {}, altriPresenti: [], altriPresentiTokens: [] }
  for (const p of decodeSalaMonth(data)) {
    for (let d = 1; d <= data.days; d++) applyTokenToDay(schedule[d], p.name, p.days[d - 1] ?? '')
  }
  return schedule
}

// ─── persona ↔ utente ────────────────────────────────────────────────────────

/**
 * Persona del mese corrispondente all'utente (match per nome, come nel resto
 * dell'app). `bareOwners` (lib/shift-teams-matching): con omonimi LEGATI via
 * user_id, la riga PDF con il solo cognome appartiene SOLO al legato.
 */
export function findMonthPerson(
  people: MonthPersonShifts[] | null | undefined,
  user: PersonRef | null | undefined,
  duplicateCognomi?: Set<string>,
  bareOwners?: BareOwnerMap | null,
): MonthPersonShifts | null {
  if (!people?.length || !user?.cognome) return null
  return people.find(p => personNameMatches(p.name, user, duplicateCognomi, bareOwners)) ?? null
}

/** Come sopra ma con la variante «solo cognome» usata dal calendario di sala. */
export function findMonthPersonByCognome(
  people: MonthPersonShifts[] | null | undefined,
  cognome: string | null | undefined,
  nome?: string | null,
  duplicateCognomi?: Set<string>,
  bareOwners?: BareOwnerMap | null,
): MonthPersonShifts | null {
  if (!people?.length || !cognome) return null
  return people.find(p => matchesCognome([p.name], cognome, nome, duplicateCognomi, bareOwners)) ?? null
}

// ─── significato dei codici ─────────────────────────────────────────────────

export type SalaCodeKind = 'empty' | 'work' | 'rest' | 'availability' | 'absence' | 'duty' | 'other'

export interface SalaCodeInfo {
  kind: SalaCodeKind
  /** Etichetta estesa («Riposo», «Altre presenze», «Turno M»…). */
  label: string
  /** Codice breve così com'è sul PDF. */
  short: string
}

const REST_CODES = new Set(['RM', 'RC', 'RI'])

/**
 * Codici di assenza/congedo. «F.E.» compare a luglio su 237 celle e non è in
 * legenda: dal contesto (solo nei mesi estivi) è ferie estive.
 */
const ABSENCE_LABELS: Record<string, string> = {
  A: 'Altre presenze',
  'F.E.': 'Ferie',
  F: 'Ferie',
  AG: 'Assenza',
  VS: 'Visita sanitaria',
  Trasf: 'Trasferta',
  /** Assenza generica con ore (es. AG7): non è un'attività. */
  AG7: 'Assenza',
}

/**
 * Interpreta un codice del PDF. `work` = turno M/P/N con sezione, cioè l'unico
 * tipo che finisce sulle card di turnisala; tutti gli altri sono assenze,
 * riposi, disponibilità o attività senza sezione.
 */
export function salaCodeInfo(token: string | null | undefined): SalaCodeInfo {
  const t = (token ?? '').trim()
  if (!t) return { kind: 'empty', label: '', short: '' }
  if (REST_CODES.has(t)) return { kind: 'rest', label: 'Riposo', short: t }
  if (t === 'D') return { kind: 'availability', label: 'Disponibilità', short: t }
  if (ABSENCE_LABELS[t]) return { kind: 'absence', label: ABSENCE_LABELS[t], short: t }
  if (isShiftWorkCode(t)) {
    const shift = t[0].toUpperCase() === 'M' ? 'Mattina' : t[0].toUpperCase() === 'P' ? 'Pomeriggio' : 'Notte'
    return { kind: 'work', label: `Turno ${shift}`, short: t }
  }
  // Tutto il resto (SpN, ISpN, SPW, DisNa/DisCas, RIC/PRIC, GIAP, TUTOR, G,
  // orari…) è attività senza sezione: presente, ma non in sezione.
  return { kind: 'duty', label: 'Attività senza sezione', short: t }
}

export interface PersonDayShift extends SalaCodeInfo {
  /** Giorno con sfondo giallo nel PDF: «turno da confermare». */
  pending: boolean
}

/**
 * Sigla pillola per il datepicker di inserimento richiesta cambio (richiesta
 * 13/09/2026): il codice del PDF ridotto al TIPO (M7T → M), così l'utente vede
 * sopra ogni cifra del calendario il suo turno — con le stesse tinte delle
 * pillole P/M/N già usate in tutta l'app. Resti e assenze non rendono nulla.
 * Le attività senza sezione (SPCA, RIC, TUTOR, …: presenti ma SENZA turno da
 * 8 ore, quindi non oggetto di cambi) rendono la sigla «G» VERDE (prima «U»,
 * cambiata 18/09/2026 su richiesta dell'utente), la stessa
 * tinta delle card duty de «Il tuo turno» (richiesta 13/09/2026).
 */
export function shiftCodePill(token: string | null | undefined): { code: string; kind: SalaCodeKind; cssClass: string } | null {
  const info = salaCodeInfo(token)
  if (info.kind === 'work') {
    // toUpperCase: il PDF scrive anche «piaptir»/«Miap» → la pillola è comunque P/M.
    return { code: info.short.charAt(0).toUpperCase(), kind: info.kind, cssClass: SHIFT_CODE_PILL_CLASS[info.short.charAt(0).toUpperCase()] }
  }
  if (info.kind === 'duty') return { code: 'G', kind: info.kind, cssClass: 'pill-g' }
  return null
}

const SHIFT_CODE_PILL_CLASS: Record<string, string> = {
  M: 'pill-mattina',
  P: 'pill-pomeriggio',
  N: 'pill-notte',
}

/** Turno reale di una persona in un giorno (con il flag «da confermare»). */
export function personDayShift(
  person: MonthPersonShifts | null | undefined,
  day: number,
): PersonDayShift | null {
  if (!person) return null
  const token = person.days[day - 1]
  if (!token) return null
  return { ...salaCodeInfo(token), pending: person.yellow.includes(day) }
}

// ─── CELLE GIALLE del PDF: congedo + presunto sostituto (richiesta 24/09/2026) ───
//
// Sul PDF una cella gialla segnala una RICHIESTA di congedo/ferie e il suo
// PRESUNTO SOSTITUTO. Dall'analisi dei 5 mesi reali (100 gialli, 23 giorni con
// cluster) emergono due ruoli:
//  1. RICHIEDENTE: il congedo è GIÀ ACCETTATO → il codice REALE è un'assenza
//     (A/AG7/F.E./VS) o rimane quello teorico di sezione; il teorico è spesso
//     «D» (disponibilità, la cella di partenza della richiesta).
//  2. SOSTITUTO PRESUNTO: chiamato a coprire → lavora SUL PROPRIO RIPOSO
//     (RC/RM/RI in reale) o cambia TURNO rispetto al teorico (es. M→P).
// Non-gialli che soddisfano gli stessi criteri restano FUORI: il giallo è la
// firma del PDF, il classificatore può solo confermarla.

/** Ruolo della persona in una cella gialla del PDF. */
export interface YellowEntry {
  name: string
  /** Codice reale (già nel codice della cella). */
  code: string
  role: 'richiedente' | 'sostituto'
  /** Card su cui sta la voce: 'teo' = sezione TEORICA (la persona resta
   *  nell'ELENCO della card col NOME DENTRO la chip gialla);
   *  'real' = lavora qui senza esservi previsto (SOSTITUTO: mai in elenco,
   *  riga in coda — caso Minicozzi D→P8). */
  target: 'teo' | 'real'
  /** Sigla del reale DENTRO la chip: SOLO assenze (A/AG/FE/VS) e attività
   *  senza sezione (corsi SpCA/SpN, trasferte Dis*, TUTOR…) — per i turni di
   *  sezione la card su cui sta la persona dice già dove lavora, niente sigla
   *  (richiesta 26/09/2026 v7). */
  showCode: boolean
}

/** true se il token è un'assenza di congedo (A, AG/AG7, F/ferie, F.E., VS). */
export function isLeaveToken(token: string): boolean {
  const t = (token ?? '').trim()
  if (!t) return false
  if (/^AG\d+$/i.test(t)) return true
  if (/^F\.?E\.?$/i.test(t)) return true
  return ['A', 'AG', 'F', 'VS'].includes(t.toUpperCase())
}

/** La sigla va DENTRO la chip gialla solo quando il reale NON è un turno di
 *  sezione: assenze (A/AG/FE/VS) e attività senza sezione (corsi Sp/ISp,
 *  trasferte Dis/NDis, TUTOR). Per i turni di sezione (anche cambi RC/D→P6T
 *  o spostamenti P7S→P4S) la persona è già posizionata sulla card adatta:
 *  chip con il solo nome (richiesta 26/09/2026 v7). */
function yellowShowsCode(real: string): boolean {
  const r = (real ?? '').trim()
  if (!r) return false
  if (isLeaveToken(r)) return true
  if (isPresentNoSection(r)) return true
  return false
}

/**
 * Classifica la cella gialla di una persona (giorno, codice reale, codice
 * teorico pre-stampato) nel suo ruolo. Ritorna null se i codici NON sono
 * compatibili con un congedo (giallo spurio: es. festività già gialle).
 */
export function classifyYellowCell(
  real: string,
  teo: string,
): { role: 'richiedente' | 'sostituto' } | null {
  const r = (real ?? '').trim()
  const t = (teo ?? '').trim()
  if (isLeaveToken(r)) return { role: 'richiedente' }
  // Teorico «D» (disponibilità) + reale lavorativo → il chiamato a coprire.
  if (/^D$/i.test(t) && isShiftWorkCode(r)) return { role: 'sostituto' }
  // Sostituto sul PROPRIO RIPOSO: il teorico era RC/RM/RI e il reale è un
  // turno lavorativo — lavora dove era previsto il suo riposo
  // (es. CAIAZZO M. P6S/RI giallo il 19/03).
  if (['RC', 'RM', 'RI'].includes(t.toUpperCase()) && isShiftWorkCode(r)) return { role: 'sostituto' }
  // Richiesta PENDENTE: il PDF mostra ancora la persona nel turno/sezione
  // previsti (reale = teorico) e la cella gialla segnala la richiesta in attesa
  // (es. FATIGATI P6S/P6S giallo nel cluster congedi del 15/03).
  if (r && r.toUpperCase() === t.toUpperCase() && isShiftWorkCode(r)) return { role: 'richiedente' }
  // Cambio TURNO: reale e teorico lavorano, ma in turni diversi.
  if (isShiftWorkCode(r) && isShiftWorkCode(t) && r[0].toUpperCase() !== t[0].toUpperCase()) return { role: 'sostituto' }
  // Cambio SEZIONE a stesso turno (P7S→P4S): la persona si sposta di sezione
  // restando nel turno — il giallo la segue su entrambe le card (v3, 25/09).
  if (isShiftWorkCode(r) && isShiftWorkCode(t)) return { role: 'sostituto' }
  // v8: cambio LAVORO→LAVORO NON evidenziato (definitivo, es. DI MEO 24/09
  // MDCP vs PDCIF) → sostituto con la stessa semantica del giallo; i rami
  // sopra coprono già i sotto-casi, qui resta il filtro anti-falsi-positivi:
  // se NESSUN ramo ha combaciato, una divergenza non gialla non è marcata.
  // Attività SENZA sezione (corso/trasferta/istruttore: SpCA, SpN, ISp*,
  // Dis*, Trasf, TUTOR…) con teorico di SEZIONE: il PDF sposta la persona
  // fuori scheda ma la cella gialla la lega ancora alla sua sezione teorica
  // (i corsi SPCA del 23/9) → pallino giallo sulla card teorica, fuori dai
  // sottogruppi (richiesta 25/09/2026 v3).
  if (isPresentNoSection(r) && isShiftWorkCode(t)) return { role: 'richiedente' }
  return null
}

/**
 * Il contenuto GIALLO del PDF per un giorno (v8, 26/09/2026): SOLO le celle
 * evidenziate in giallo generano la chip — una divergenza SENZA giallo è un
 * fatto normale del foglio (il PDF la stampa senza evidenzia, es. DI MEO
 * 24/09 MDCP vs PDCIF) e NON va segnalata (richiesta esplicita 26/09/2026:
 * «solo quelle gialle devono essere segnalate»).
 *
 * Per ogni voce gialla la chip sta su UNA sola card:
 *  - richiedente (assenza/corso/proposta sul proprio turno): la sezione
 *    TEORICA ('teo' — il PDF la colloca ancora lì);
 *  - sostituto (chiamato da D/riposo, cambio turno o sezione): SOLO la card
 *    di DESTINAZIONE ('real') — la posizione dice già dove lavora, la card
 *    d'origine resta pulita (caso DI MEO 25/09 teo MDCIF → real NDCP: chip
 *    solo sulla notte della DCP).
 */
export function yellowForDay(
  people: MonthPersonShifts[],
  day: number,
): Map<string, YellowEntry[]> {
  const out = new Map<string, YellowEntry[]>()
  for (const p of people) {
    if (!p.yellow.includes(day)) continue
    const real = p.days[day - 1] ?? ''
    const teo = p.teorico[day - 1] ?? ''
    const cls = classifyYellowCell(real, teo)
    if (!cls) continue
    // v8: la chip sta su UNA sola card — teorica per il richiedente, di
    // DESTINAZIONE per il sostituto (mai entrambe).
    const teoSection = yellowSectionToken(teo)
    const realSection = yellowSectionToken(real)
    const [target, targetKind] =
      cls.role === 'richiedente'
        ? [teoSection, 'teo' as const]
        : cls.role === 'sostituto'
          ? [realSection, 'real' as const]
          : [null, null]
    if (!target || !targetKind) continue
    const same = normCodeEq(real, teo)
    // v7: la sigla in chip SOLO per assenze/corsi (mai per turni di sezione);
    // per il 'teo' con reale = teorico (pendente) comunque niente sigla.
    const showCode = yellowShowsCode(real) && !same
    const parsed = parseShiftCode(target)
    const key = `${parsed.section}|${parsed.shift}`
    const arr = out.get(key) ?? []
    if (!arr.some(e => e.name === p.name)) arr.push({ name: p.name, code: real, role: cls.role, target: targetKind, showCode })
    out.set(key, arr)
  }
  return out
}

/**
 * La sezione come TOKEN card «sezione+turno» per il giallo, SOLO se è una
 * sezione di turno M/P/N con vero numero/lettera di sezione. Le attività
 * SENZA sezione (SpCA, SpN, ISp*, Dis*, TUTOR…) e i riposi NON generano card —
 * la persona resta nei suoi sottogruppi (Corsi/Trasferte/…), i quali NON la
 * elencano quando è gialla: il pallino giallo sulla card teorica parla già
 * di lei (richiesta 24/09/2026 v3).
 */
function yellowSectionToken(t: string): string | null {
  if (!isShiftWorkCode(t)) return null
  if (isPresentNoSection(t)) return null
  const p = parseShiftCode(t)
  return NON_SECTION_DUTIES.has(p.section.toUpperCase()) ? null : t
}

/** Chiave «SEZIONE|TURNO» della card su cui il PDF colloca un codice di turno
 *  (null per riposi, assenze, disponibilità e attività senza sezione). Stessa
 *  forma delle chiavi di yellowForDay: la usa desk-board per trovare la card. */
function yellowCardKey(t: string): string | null {
  const token = yellowSectionToken(t)
  if (!token) return null
  const p = parseShiftCode(token)
  return `${p.section}|${p.shift}`
}

/**
 * Card SCOPERTE di un giorno (richieste 27/09 e 15/09/2026): chiave
 * «SEZIONE|TURNO» (stesse di yellowForDay) → numero di PERSONE MANCANTI.
 *
 * Due cause, che si SOMMANO (richiesta 15/09/2026) con la stessa dicitura in
 * card («— scoperto»):
 *
 *  1. MINIMO non coperto — `mins` (vedi lib/sala-minimi): le persone reali che
 *     lavorano sulla card sono meno del previsto per quella sezione e turno.
 *     È il caso che la vecchia regola non vedeva: ROTONDO, la cui squadra gira
 *     su 4/6/7/10 mentre il suo teorico è una serie di G, lascia la card con
 *     una persona in meno senza nessuna cella gialla di mezzo.
 *  2. GIALLO che ha spostato la persona — la chip sta sulla card di
 *     DESTINAZIONE e nessuno l'ha rimpiazzata (es. P DCIF il 24/09 e M DCIF il
 *     25/09, da cui DI MEO è stato chiamato sulla DCP). Restano FUORI i gialli
 *     che NON svuotano la card d'origine: il RICHIEDENTE (assenza/corso sul
 *     proprio turno) ci resta in elenco con la chip, e il sostituto che lavora
 *     nella STESSA card del teorico non toglie niente a nessuno.
 *
 * Il numero di mancanti NON è la somma delle due cause: la stessa persona
 * assente verrebbe contata due volte (una card con minimo 2, teorico 2 e reale 0
 * manca di 2, non di 4). Si prende il massimo fra le due letture.
 *
 * `mins` assente o nullo = minimo non configurato per quel giorno → vale solo
 * la causa gialla, esattamente come prima del 15/09/2026.
 */
export function scopertiForDay(
  people: MonthPersonShifts[],
  day: number,
  mins?: Map<string, number> | null,
): Map<string, number> {
  const attese = new Map<string, number>()
  const reali = new Map<string, number>()
  const spostate = new Map<string, number>()
  const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1)
  for (const p of people) {
    const real = p.days[day - 1] ?? ''
    const teo = p.teorico[day - 1] ?? ''
    const teoKey = yellowCardKey(teo)
    const realKey = yellowCardKey(real)
    if (teoKey) bump(attese, teoKey)
    if (realKey) bump(reali, realKey)
    if (!teoKey || !p.yellow.includes(day)) continue
    // Solo il SOSTITUTO lascia la card teorica: il richiedente ci resta in
    // elenco con la chip (target 'teo', vedi yellowForDay).
    if (classifyYellowCell(real, teo)?.role !== 'sostituto') continue
    if (realKey === teoKey) continue
    bump(spostate, teoKey)
  }
  const chiavi = new Set<string>([...spostate.keys(), ...(mins?.keys() ?? [])])
  const out = new Map<string, number>()
  for (const key of chiavi) {
    const n = reali.get(key) ?? 0
    const sottoMinimo = Math.max(0, (mins?.get(key) ?? 0) - n)
    const daGiallo = spostate.has(key) ? Math.max(0, (attese.get(key) ?? 0) - n) : 0
    const mancanti = Math.max(sottoMinimo, daGiallo)
    if (mancanti > 0) out.set(key, mancanti)
  }
  return out
}

/** Confronto di codici turno indipendente da maiuscole (SpCA = spca = SPCA). */
export function normCodeEq(a: string, b: string): boolean {
  return (a ?? '').trim().toUpperCase() === (b ?? '').trim().toUpperCase()
}
