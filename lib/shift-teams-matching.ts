// Matching nome ↔ anagrafica quando più UTENTI condividono il COGNOME.
//
// CASO NEVANO (richiesta 14/09/2026): Pietro (scorte di rilievo) e Giuseppe
// (senza squadra). Il membro di squadra è rinominato «NEVANO P.» e LEGATO a
// Pietro con shift_team_members.user_id. I PDF però scrivono di solito solo
// «NEVANO»: la regola è che una riga PDF con il SOLO cognome appartiene alla
// persona legata via user_id (il «bare owner», Pietro); l'omonimo matcha solo
// con l'iniziale («NEVANO G.» → Giuseppe).
//
// La mappa è calcolata in UN punto (buildBareOwners: albero squadre + set dei
// cognomi duplicati fra gli utenti) e passata ai matcher (matchesCognome,
// personNameMatches, findMonthPerson, realShiftFor…): gli algoritmi esistenti
// non cambiano, ricevono solo un contesto opzionale in più — senza mappa il
// comportamento resta quello di prima.
import type { ShiftTeamTree } from '@/types/database'

/** Proprietario del nome BARE (solo cognome) per un cognome omonimo. */
export interface BareOwner {
  /** full_name del membro legato, es. «NEVANO P.» */
  fullName: string
  /** «nevano p.» — identifica il proprietario nel match esatto. */
  nameNorm: string
  /** chiave cognome, es. «nevano» */
  cognomeKey: string
  /** utente legato (shift_team_members.user_id), se c'è. */
  userId: string | null
  /** iniziale del nome dal full_name («p»); '' se il membro è senza iniziale. */
  initial: string
}

/** cognome normalizzato → proprietario del nome BARE. */
export type BareOwnerMap = Map<string, BareOwner>

/** Normalizzazione condivisa (stessa di lib/turni-teorici.normName). */
export function normNameKey(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Chiave COGNOME: toglie l'ultimo token SOLO se è un'iniziale («NEVANO P.» → «nevano»). */
export function cognomeKeyOf(fullName: string): string {
  const n = normNameKey(fullName)
  const parts = n.split(' ')
  const last = parts[parts.length - 1]
  return parts.length > 1 && /^[a-z]\.?$/.test(last) ? parts.slice(0, -1).join(' ') : n
}

/**
 * Costruisce la mappa «cognome → bare owner». Serve la CONGIUNZIONE di due
 * segnali: la omonimia fra UTENTI (duplicateCognomi, da buildDuplicateCognomi)
 * e il membro di squadra LEGATO a un utente (user_id) con quel cognome — il
 * suo full_name porta l'iniziale che identifica il proprietario («NEVANO P.»).
 * Cognomi non duplicati non entrano (il matching per cognome già funziona);
 * cognomi duplicati senza membro legato non entrano (il bare resta ambiguo).
 */
export function buildBareOwners(
  tree: Pick<ShiftTeamTree, 'types'> | null | undefined,
  duplicateCognomi?: Set<string> | null,
): BareOwnerMap {
  const out: BareOwnerMap = new Map()
  if (!tree?.types || !duplicateCognomi?.size) return out
  // cognome normalizzato → membri attivi dell'albero con quel cognome
  const byCognome = new Map<string, Array<{ fullName: string; norm: string; bound: boolean }>>()
  // duplicateCognomi ha le chiavi COME SONO SCRITTE in users.cognome («Nevano»):
  // si confronta in entrambe le forme (normale e minuscola).
  const dupKeys = new Set<string>()
  for (const k of duplicateCognomi) dupKeys.add(normNameKey(k))
  for (const type of tree.types) {
    for (const team of type.teams) {
      for (const member of team.members) {
        if (!member.is_active) continue
        const key = cognomeKeyOf(member.full_name)
        // solo i cognomi OMONIMI fra gli utenti interessano
        if (!key || !dupKeys.has(key)) continue
        const list = byCognome.get(key) ?? []
        list.push({ fullName: member.full_name, norm: normNameKey(member.full_name), bound: !!member.user_id })
        byCognome.set(key, list)
      }
    }
  }
  for (const [cognomeKey, members] of byCognome) {
    const owner = members.find(m => m.bound)
    if (!owner) continue
    // iniziale dal full_name («nevano p.» → «p»); '' se il membro è bare
    const tail = owner.norm.slice(cognomeKey.length).trim()
    const initial = /^[a-z]$/.test(tail.replace(/\.$/, '')) ? tail.replace(/\.$/, '') : ''
    out.set(cognomeKey, {
      fullName: owner.fullName,
      nameNorm: owner.norm,
      cognomeKey,
      userId: null,
      initial,
    })
  }
  return out
}

/** Proprietario del cognome, solo se il nome PDF è BARE (solo cognome). */
export function bareOwnerOfName(name: string, bareOwners?: BareOwnerMap | null): BareOwner | null {
  if (!bareOwners?.size) return null
  const key = cognomeKeyOf(name)
  if (!key || !bareOwners.has(key)) return null
  return normNameKey(name) === key ? bareOwners.get(key)! : null
}

/** Vero se il nome PDF è BARE e ha un proprietario («NEVANO» con mappa popolata). */
export function isBareOwnedName(name: string, bareOwners?: BareOwnerMap | null): boolean {
  return !!bareOwnerOfName(name, bareOwners)
}

/**
 * L'UTENTE (cognome+nome) è il proprietario del nome bare del suo cognome?
 * Riconosciuto per iniziale («NEVANO P.» → Pietro); con membro bare senza
 * iniziale non c'è modo di distinguere: l'omonimo NON è considerato proprietario.
 */
export function userOwnsBareName(
  cognome: string | null | undefined,
  nome: string | null | undefined,
  bareOwners?: BareOwnerMap | null,
): boolean {
  const owner = bareOwners?.size && cognome ? bareOwners.get(normNameKey(cognome)) : undefined
  if (!owner) return false
  if (!owner.initial) return false
  return (nome ?? '').trim().charAt(0).toLowerCase() === owner.initial
}

/**
 * Nome utente ridotto alla forma «Cognome P.» quando il COGNOME è omonimo fra
 * gli utenti: l'iniziale evita gli equivoci (richiesta 14/09/2026). Gli altri
 * cognomi restano solo cognome. (Specchio di formatDisplayName di lib/utils,
 * ma senza dipendere dal set completo dei duplicati: qui basta il flag.)
 */
export function formatSurnameInitial(cognome: string | null | undefined, nome: string | null | undefined, isOmonimo: boolean): string {
  if (!cognome) return (nome ?? '')
  if (!isOmonimo || !nome) return cognome
  const initial = nome.trim().charAt(0).toUpperCase()
  return initial ? `${cognome} ${initial}.` : cognome
}

/**
 * Risolve un nome DEL PDF («NEVANO», «NEVANO G.», «Nevano Pietro») contro la
 * mappa di visualizzazione costruita dal chiamante (desk-board): contiene per
 * gli omonimi le TRE forme — «cognome nome», «cognome» (solo per il proprietario
 * del bare), «cognome p.» (iniziale) — tutte mappate al displayName con
 * l'iniziale («Nevano P.»). Null se il nome non è di un omonimo noto.
 */
export function lookupNameDisplay(
  pdfName: string,
  nameDisplay?: Map<string, string> | null,
): string | null {
  if (!nameDisplay?.size) return null
  const key = normNameKey(pdfName)
  if (nameDisplay.has(key)) return nameDisplay.get(key)!
  // «NEVANO G.» → chiave iniziale «nevano g.»
  const m = key.match(/^(.+?)\s+([a-z])\.?$/)
  if (m && nameDisplay.has(`${m[1]} ${m[2]}.`)) return nameDisplay.get(`${m[1]} ${m[2]}.`)!
  return null
}
