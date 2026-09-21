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
import { isBareOwnedName, ownsBareNameFor, type BareOwnerMap } from '@/lib/shift-teams-matching'
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
 *
 * `bareOwners` (lib/shift-teams-matching): omonimi con membro LEGATO via user_id —
 * la riga PDF con il solo cognome («NEVANO») vale SOLO per il legato (Pietro);
 * gli altri omonimi matchano solo con l'iniziale («NEVANO G.»).
 */
export function personNameMatches(
  fullName: string,
  user: PersonRef | null | undefined,
  duplicateCognomi?: Set<string>,
  bareOwners?: BareOwnerMap | null,
): boolean {
  if (!user?.cognome) return false
  const fn = fullName.trim().toLowerCase()
  const cognome = user.cognome.trim().toLowerCase()
  if (!fn || !cognome) return false
  // Nome BARE (solo cognome) con proprietario nell'albero: matcha solo il
  // proprietario (Pietro per «NEVANO», Giuseppe no). L'identità vale più
  // dell'iniziale: se l'id c'è, decide quello (`ownsBareNameFor`).
  if (isBareOwnedName(fn, bareOwners)) return ownsBareNameFor(user, bareOwners)
  if (fn === cognome) return true

  const prefixed = fn.match(/^(.*)\s+([a-z]+)\.$/)
  if (prefixed && prefixed[1] === cognome) {
    const nome = (user.nome ?? '').trim().toLowerCase()
    return !!nome && nome.startsWith(prefixed[2])
  }

  // Fallback per i nomi senza suffisso riconoscibile
  return matchesCognome([fullName], user.cognome, user.nome, duplicateCognomi, bareOwners)
}

function anyNameMatches(
  names: string[] | undefined,
  user: PersonRef | null | undefined,
  duplicateCognomi?: Set<string>,
  bareOwners?: BareOwnerMap | null,
): boolean {
  if (!names?.length) return false
  return names.some(n => personNameMatches(n, user, duplicateCognomi, bareOwners))
}

/**
 * Membro della struttura teorica corrispondente all'utente. L'`user_id` (se
 * valorizzato) ha priorità; in mancanza si confronta il `full_name`.
 * `bareOwners` serve al match per nome degli omonimi legati (caso NEVANO).
 */
export function findMemberForUser(
  tree: Pick<ShiftTeamTree, 'types'> | null | undefined,
  user: PersonRef | null | undefined,
  duplicateCognomi?: Set<string>,
  bareOwners?: BareOwnerMap | null,
): MemberRef | null {
  if (!tree || !user) return null
  let byName: MemberRef | null = null
  for (const type of tree.types) {
    for (const team of type.teams) {
      for (const member of team.members) {
        if (!member.is_active) continue
        if (user.id && member.user_id === user.id) return { type, team, member }
        if (!byName && personNameMatches(member.full_name, user, duplicateCognomi, bareOwners)) {
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
  bareOwners?: BareOwnerMap | null,
): string {
  if (!tree) return ''
  const ref = findMemberForUser(tree, user, duplicateCognomi, bareOwners)
  if (!ref) return ''
  return tokenForMember(ref.type, ref.member, ref.team.id, tree.adjustments, dateISO)
}

/**
 * IL FLASH «VENGO DA QUI»: la persona cercata è in questo elenco di nomi?
 * (richiesta 19/09/2026, dal caso del collega che vedeva «non è in sala» su una
 * persona che c'era).
 *
 * Prima la regola STRETTA della board (`matchesCognome`: per gli omonimi serve
 * l'iniziale del nome, e `bareOwners` decide chi possiede una riga col solo
 * cognome), poi la regola della VERIFICA (`personNameMatches`, che accetta anche
 * la riga col solo cognome). È la stessa domanda che ha già autorizzato il salto,
 * quindi le due non possono più contraddirsi: senza questo ripiego bastava un
 * elenco utenti o un albero squadre incompleto nel browser — il fetch client può
 * tornare 0 righe sotto RLS, è documentato in `useShiftTeamTreeData`) perché
 * `bareOwners` risultasse vuoto e il flash non riconoscesse un omonimo con la
 * riga «ROMANO» (senza iniziale), mentre la verifica lo riconosceva.
 *
 * Effetto collaterale accettato: con la riga col solo cognome e DUE omonimi in
 * sala si accendono entrambe le card (il PDF non dice quale). Meglio due card
 * accese che un «non è in sala» falso.
 */
export function matchesFocusPerson(
  names: string[] | undefined,
  cognome: string | null | undefined,
  nome: string | null | undefined,
  duplicateCognomi?: Set<string>,
  bareOwners?: BareOwnerMap | null,
): boolean {
  if (!names?.length || !cognome) return false
  if (matchesCognome(names, cognome, nome, duplicateCognomi, bareOwners)) return true
  return names.some(n => personNameMatches(n, { cognome, nome }, duplicateCognomi, bareOwners))
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
  bareOwners?: BareOwnerMap | null,
): RealShiftInfo {
  if (!day || !user?.cognome) return NO_REAL_SHIFT

  for (const [section, byShift] of Object.entries(day.sections ?? {})) {
    for (const [shift, data] of Object.entries(byShift ?? {}) as [SalaShiftType, SectionShiftData][]) {
      if (anyNameMatches(data.surnames?.T, user, duplicateCognomi, bareOwners)) {
        return { token: `${shift}${section}T`, shift, section, slot: 'T', presentNoSection: false }
      }
      if (anyNameMatches(data.surnames?.S, user, duplicateCognomi, bareOwners)) {
        return { token: `${shift}${section}S`, shift, section, slot: 'S', presentNoSection: false }
      }
      if (anyNameMatches(data.surnames?.noSlot, user, duplicateCognomi, bareOwners)) {
        return { token: `${shift}${section}`, shift, section, slot: null, presentNoSection: false }
      }
      if (anyNameMatches(data.tirocinanti, user, duplicateCognomi, bareOwners)) {
        return { token: `${shift}${section}TIR`, shift, section, slot: null, presentNoSection: false }
      }
    }
  }

  if (anyNameMatches(day.altriPresenti, user, duplicateCognomi, bareOwners)) {
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
function tokenCompareKey(token: string | null | undefined): string {
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
