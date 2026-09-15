import type { DaySchedule, SalaMonthData } from '@/types/database'
import { applyTokenToDay, isShiftWorkCode, parseShiftCode } from '@/lib/shift-tokens'
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
}

/** true se il token è un'assenza di congedo (A, AG/AG7, F/ferie, F.E., VS). */
export function isLeaveToken(token: string): boolean {
  const t = (token ?? '').trim()
  if (!t) return false
  if (/^AG\d+$/i.test(t)) return true
  if (/^F\.?E\.?$/i.test(t)) return true
  return ['A', 'AG', 'F', 'VS'].includes(t.toUpperCase())
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
  return null
}

/**
 * Il contenuto GIALLO del PDF per un giorno: richiedenti il congedo e presunti
 * sostituti, ciascuno aggregato sotto la chiave «sezione|turno» della card in
 * cui il PDF colloca la cella (per il richiedente la colonna TEORICA = dove
 * sarebbe stato; per il sostituto che cambia turno il REALE = dove va davvero).
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
    const key = yellowSectionKey(real, teo, cls.role)
    const arr = out.get(key) ?? []
    arr.push({ name: p.name, code: real, role: cls.role })
    out.set(key, arr)
  }
  return out
}

/** Chiave «sezione|turno» di una cella gialla (vedi yellowForDay). */
function yellowSectionKey(real: string, teo: string, role: 'richiedente' | 'sostituto'): string {
  const token = role === 'richiedente' ? (teo || real) : (real || teo)
  const parsed = parseShiftCode(token)
  return `${parsed.section}|${parsed.shift}`
}
