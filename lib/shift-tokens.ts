import type { DaySchedule, SalaShiftType, SectionShiftData } from '@/types/database'

// ─── codici turno ────────────────────────────────────────────────────────────
// Logica condivisa tra il parser PDF (lib/pdf-parser.ts) e la generazione dei
// mesi teorici (lib/turni-teorici.ts).

export interface ParsedShift {
  shift: SalaShiftType
  section: string
  slot: 'T' | 'S' | null
  isTir: boolean
}

export function isShiftCode(token: string): boolean {
  return /^[MNP][A-Z0-9]+$/.test(token)
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

export const NON_SECTION_DUTIES = new Set(['TUTOR'])

export function isPresentNoSection(token: string): boolean {
  if (ABSENT_CODES.has(token)) return false
  // Famiglie case-insensitive: il PDF mescola maiuscole (SpN/SPN/spn, SPCA,
  // SPW/ISPW, DisNa/DisCas…). Richiesta 13/09/2026.
  if (/^Sp[A-Za-z@]/i.test(token)) return true
  if (/^ISp[A-Za-z]/i.test(token)) return true
  if (/^Dis[A-Za-z]/.test(token)) return true
  return false
}

export function emptyShift(): SectionShiftData {
  return { surnames: { T: [], S: [], noSlot: [] }, tirocinanti: [] }
}

/**
 * Applica un token turno a un giorno della programmazione. Ritorna false se il
 * token non produce presenze (assente, riposo, disponibilità o codice ignoto).
 */
export function applyTokenToDay(day: DaySchedule, name: string, token: string): boolean {
  if (!token || ABSENT_CODES.has(token)) return false

  // Turno «nudo» senza sezione (M, N, P: es. SPAGNULO): presente, ma la sezione
  // non è indicata nel PDF — finisce tra le altre presenze, non in una colonna.
  if (/^[MNP]$/.test(token)) {
    day.altriPresenti.push(name)
    return true
  }

  if (isPresentNoSection(token)) {
    day.altriPresenti.push(name)
    return true
  }

  if (!isShiftCode(token)) return false

  const { shift, section, slot, isTir } = parseShiftCode(token)

  if (NON_SECTION_DUTIES.has(section)) {
    day.altriPresenti.push(name)
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