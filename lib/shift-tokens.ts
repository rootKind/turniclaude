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

export function parseShiftCode(token: string): ParsedShift {
  const shift = token[0] as SalaShiftType
  const isTir = token.endsWith('TIR')
  const raw = token.slice(1).replace(/TIR$/, '')
  const m = raw.match(/^(\d+)([ST])?$/)
  if (m) return { shift, section: m[1], slot: (m[2] as 'T' | 'S') ?? null, isTir }
  return { shift, section: raw, slot: null, isTir }
}

export const ABSENT_CODES = new Set([
  'A', 'AG', 'F', 'RM', 'RC', 'RI', 'VS', 'D',
])

export const NON_SECTION_DUTIES = new Set(['TUTOR'])

export function isPresentNoSection(token: string): boolean {
  if (ABSENT_CODES.has(token)) return false
  if (/^Sp[A-Za-z@]/.test(token)) return true
  if (/^ISp[A-Za-z]/.test(token)) return true
  if (token === 'SPW') return true
  if (token === 'SpNw') return true
  if (/^Dis[A-Z]/.test(token)) return true
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