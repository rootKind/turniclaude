import type {
  DaySchedule,
  SalaShiftType,
  SectionShiftData,
  ShiftTeam,
  ShiftTeamMember,
  ShiftTeamTree,
  ShiftTypeGroup,
} from '@/types/database'
import { matchesCognome } from '@/lib/utils'
import { tokenForMember } from '@/lib/turni-teorici'
import { isShiftWorkCode } from '@/lib/shift-tokens'

/** Anagrafica minima di una persona (utente o membro squadra). */
export interface PersonRef {
  id?: string | null
  nome?: string | null
  cognome?: string | null
}

export interface MemberRef {
  type: ShiftTypeGroup
  team: ShiftTeam
  member: ShiftTeamMember
}

/**
 * Confronta un nome come appare nei turni («ESPOSITO AU.», «DI FRAIA», «ROMANO R.»)
 * con l'anagrafica utente. Oltre al cognome secco gestisce il suffisso del nome:
 * «esposito au.» corrisponde a Esposito Aurora (il prefisso «au» deve essere
 * l'inizio del nome). È più tollerante di `matchesCognome`, che per gli omonimi
 * confronta solo il prefisso minimo (una lettera).
 */
export function personNameMatches(
  fullName: string,
  user: PersonRef | null | undefined,
  duplicateCognomi?: Set<string>,
): boolean {
  if (!user?.cognome) return false
  const fn = fullName.trim().toLowerCase()
  const cognome = user.cognome.trim().toLowerCase()
  if (!fn || !cognome) return false
  if (fn === cognome) return true

  const prefixed = fn.match(/^(.*)\s+([a-z]+)\.$/)
  if (prefixed && prefixed[1] === cognome) {
    const nome = (user.nome ?? '').trim().toLowerCase()
    return !!nome && nome.startsWith(prefixed[2])
  }

  // Fallback per i nomi senza suffisso riconoscibile
  return matchesCognome([fullName], user.cognome, user.nome, duplicateCognomi)
}

export function anyNameMatches(
  names: string[] | undefined,
  user: PersonRef | null | undefined,
  duplicateCognomi?: Set<string>,
): boolean {
  if (!names?.length) return false
  return names.some(n => personNameMatches(n, user, duplicateCognomi))
}

/**
 * Membro della struttura teorica corrispondente all'utente. L'`user_id` (se
 * valorizzato) ha priorità; in mancanza si confronta il `full_name`.
 */
export function findMemberForUser(
  tree: Pick<ShiftTeamTree, 'types'> | null | undefined,
  user: PersonRef | null | undefined,
  duplicateCognomi?: Set<string>,
): MemberRef | null {
  if (!tree || !user) return null
  let byName: MemberRef | null = null
  for (const type of tree.types) {
    for (const team of type.teams) {
      for (const member of team.members) {
        if (!member.is_active) continue
        if (user.id && member.user_id === user.id) return { type, team, member }
        if (!byName && personNameMatches(member.full_name, user, duplicateCognomi)) {
          byName = { type, team, member }
        }
      }
    }
  }
  return byName
}

/** Token teorico (es. «M7S», «RM», «D») per l'utente in una data YYYY-MM-DD. */
export function theoreticalTokenFor(
  tree: Pick<ShiftTeamTree, 'types' | 'adjustments'> | null | undefined,
  user: PersonRef | null | undefined,
  dateISO: string,
  duplicateCognomi?: Set<string>,
): string {
  if (!tree) return ''
  const ref = findMemberForUser(tree, user, duplicateCognomi)
  if (!ref) return ''
  return tokenForMember(ref.type, ref.member, ref.team.id, tree.adjustments, dateISO)
}

export interface RealShiftInfo {
  token: string | null          // es. «M7S», «N10TIR»
  shift: SalaShiftType | null
  section: string | null
  slot: 'T' | 'S' | null
  presentNoSection: boolean     // presente senza sezione (Sp/Dis/…)
}

const NO_REAL_SHIFT: RealShiftInfo = {
  token: null,
  shift: null,
  section: null,
  slot: null,
  presentNoSection: false,
}

/** Token reale assegnato all'utente nel calendario di un giorno. */
export function realShiftFor(
  day: DaySchedule | undefined,
  user: PersonRef | null | undefined,
  duplicateCognomi?: Set<string>,
): RealShiftInfo {
  if (!day || !user?.cognome) return NO_REAL_SHIFT

  for (const [section, byShift] of Object.entries(day.sections ?? {})) {
    for (const [shift, data] of Object.entries(byShift ?? {}) as [SalaShiftType, SectionShiftData][]) {
      if (anyNameMatches(data.surnames?.T, user, duplicateCognomi)) {
        return { token: `${shift}${section}T`, shift, section, slot: 'T', presentNoSection: false }
      }
      if (anyNameMatches(data.surnames?.S, user, duplicateCognomi)) {
        return { token: `${shift}${section}S`, shift, section, slot: 'S', presentNoSection: false }
      }
      if (anyNameMatches(data.surnames?.noSlot, user, duplicateCognomi)) {
        return { token: `${shift}${section}`, shift, section, slot: null, presentNoSection: false }
      }
      if (anyNameMatches(data.tirocinanti, user, duplicateCognomi)) {
        return { token: `${shift}${section}TIR`, shift, section, slot: null, presentNoSection: false }
      }
    }
  }

  if (anyNameMatches(day.altriPresenti, user, duplicateCognomi)) {
    return { ...NO_REAL_SHIFT, presentNoSection: true }
  }

  return NO_REAL_SHIFT
}

/**
 * True se il token è un turno di lavoro (M/P/N in qualsiasi forma: con sezione,
 * «nudo» M/N/P, variante a maiuscole miste tipo Mric — richiesta 13/09/2026).
 */
export function isWorkToken(token: string): boolean {
  return isShiftWorkCode(token)
}

/** Testo compatto del token: «M7S» → «M7» (lo slot non serve nella vista personale). */
export function tokenLabel(token: string): string {
  return token.replace(/^([MNP].*\d)[ST]$/, '$1')
}

/**
 * Chiave di confronto reale↔teorico: turno + sezione. Lo slot T/S e il suffisso
 * TIR NON differenziano due turni dello stesso tipo nella stessa sezione.
 */
export function tokenCompareKey(token: string | null | undefined): string {
  if (!token) return ''
  return tokenLabel(token).replace(/TIR$/, '')
}

/**
 * True se il turno reale diverge dal teorico: cambia il tipo (o la sezione),
 * oppure uno dei due è un turno di lavoro e l'altro no (riposo/assenza).
 */
export function realTheoreticalMismatch(
  realToken: string | null | undefined,
  theoreticalToken: string | null | undefined,
): boolean {
  const realWork = isWorkToken(realToken ?? '')
  const theoWork = isWorkToken(theoreticalToken ?? '')
  if (realWork !== theoWork) return true
  if (!realWork) return false
  return tokenCompareKey(realToken) !== tokenCompareKey(theoreticalToken)
}
