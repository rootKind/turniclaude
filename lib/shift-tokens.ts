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

/** Token del quale registrare la presenza senza sezione (per il raggruppamento). */
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