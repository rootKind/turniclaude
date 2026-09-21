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
function normNameKey(s: string): string {
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
 * Costruisce la mappa «cognome → bare owner», cioè DI CHI È una riga PDF ridotta
 * al solo cognome («NEVANO»). Serve la CONGIUNZIONE di due segnali: la omonimia
 * fra UTENTI (duplicateCognomi, da buildDuplicateCognomi) e il membro di squadra
 * LEGATO a un utente (user_id) con quel cognome. Cognomi non duplicati non
 * entrano (il matching per cognome già funziona); cognomi duplicati senza membro
 * legato non entrano (il nudo resta ambiguo).
 *
 * CON L'ELENCO UTENTI (`users`) LA DECISIONE È DEL ROSTER (25/09/2026): il
 * proprietario è l'unico COLLEGA IN TURNO con quel cognome, e il nome nudo NON è
 * di nessuno quando in turno ce ne sono due o più (lì servono le iniziali). È la
 * stessa regola di `omonimiaInSala`, applicata alla MATCHING di ogni schermata
 * della sala: chi è fuori dai turni — Giuseppe Nevano, assente dai PDF — non
 * rende ambiguo il cognome di chi ci sta. Quando invece il roster non è legato a
 * nessun utente (la produzione di oggi: 87 membri, zero `user_id`) si torna alla
 * regola del solo legame: non si sa chi lavora, quindi non si attribuisce.
 */
export function buildBareOwners(
  tree: Pick<ShiftTeamTree, 'types'> | null | undefined,
  duplicateCognomi?: Set<string> | null,
  users?: Array<{ id?: string | null; cognome?: string | null }> | null,
): BareOwnerMap {
  const out: BareOwnerMap = new Map()
  if (!tree?.types || !duplicateCognomi?.size) return out
  // cognome normalizzato → membri attivi dell'albero con quel cognome
  const byCognome = new Map<string, Array<{ fullName: string; norm: string; bound: boolean; userId: string | null }>>()
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
        list.push({ fullName: member.full_name, norm: normNameKey(member.full_name), bound: !!member.user_id, userId: member.user_id })
        byCognome.set(key, list)
      }
    }
  }
  // Chi è IN TURNO per cognome: se l'elenco utenti c'è, decide lui.
  const inTurnoPerCognome = new Map<string, string[]>()
  if (users) {
    const rosterIds = buildRosterUserIds(tree)
    for (const u of users) {
      if (!u.id || !u.cognome || !rosterIds.has(u.id)) continue
      const k = normNameKey(u.cognome)
      inTurnoPerCognome.set(k, [...(inTurnoPerCognome.get(k) ?? []), u.id])
    }
  }

  for (const [cognomeKey, members] of byCognome) {
    let owner: (typeof members)[number] | undefined
    if (users) {
      const inTurno = inTurnoPerCognome.get(cognomeKey) ?? []
      // Due o più colleghi in turno con lo stesso cognome: il nome nudo non è di
      // nessuno dei due (si distinguono solo con l'iniziale).
      if (inTurno.length > 1) continue
      if (inTurno.length === 1) {
        // Il proprietario lo dice il roster; il membro serve per l'INIZIALE, e se
        // il suo nome non ce l'ha (produzione: membro «NEVANO» legato a Pietro)
        // resta comunque proprietario — il match passa dall'id (`ownsBareNameFor`).
        owner = members.find(m => m.userId === inTurno[0])
          ?? { fullName: '', norm: '', bound: true, userId: inTurno[0] }
      } else {
        // Nessun collega IN TURNO con quel cognome: il roster non è legato (o
        // non lo porta), quindi vale la regola del solo legame.
        owner = members.find(m => m.bound)
      }
    } else {
      owner = members.find(m => m.bound)
    }
    if (!owner || !owner.userId) continue
    // iniziale dal full_name («nevano p.» → «p»); '' se il membro è bare
    const tail = owner.norm.slice(cognomeKey.length).trim()
    const initial = /^[a-z]$/.test(tail.replace(/\.$/, '')) ? tail.replace(/\.$/, '') : ''
    out.set(cognomeKey, {
      fullName: owner.fullName,
      nameNorm: owner.norm,
      cognomeKey,
      userId: owner.userId,
      initial,
    })
  }
  return out
}

/** Proprietario del cognome, solo se il nome PDF è BARE (solo cognome). */
function bareOwnerOfName(name: string, bareOwners?: BareOwnerMap | null): BareOwner | null {
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
 * L'UTENTE è il proprietario del nome bare del suo cognome?
 *
 * Prima si guarda l'IDENTITÀ (`user.id` contro `owner.userId`): è il segnale
 * forte, e non dipende da come è scritto il nome del membro in squadra (25/09/2026:
 * un membro «NEVANO» legato a Pietro è comunque di Pietro, senza doverlo
 * rinominare). Quando l'id non c'è — o il proprietario non ha un id — si ripiega
 * sull'INIZIALE («NEVANO P.» → Pietro), come si faceva prima: con un membro nudo
 * e senza legame l'omonimo NON è considerato proprietario.
 */
export function ownsBareNameFor(
  user: { id?: string | null; nome?: string | null; cognome?: string | null } | null | undefined,
  bareOwners?: BareOwnerMap | null,
): boolean {
  const owner = user?.cognome && bareOwners?.size ? bareOwners.get(normNameKey(user.cognome)) : undefined
  if (!owner) return false
  if (user?.id && owner.userId) return owner.userId === user.id
  if (!owner.initial) return false
  return (user?.nome ?? '').trim().charAt(0).toLowerCase() === owner.initial
}

/** Solo cognome + nome (nessun id): vedi `ownsBareNameFor`. */
export function userOwnsBareName(
  cognome: string | null | undefined,
  nome: string | null | undefined,
  bareOwners?: BareOwnerMap | null,
): boolean {
  return ownsBareNameFor({ nome, cognome }, bareOwners)
}

/**
 * CHI È IN TURNO (25/09/2026).
 *
 * Il ROSTER delle squadre è la fonte di chi lavora: un membro ATTIVO legato a un
 * utente (`shift_team_members.user_id`). Chi non ha nessun membro attivo non è
 * nei turni — e infatti non compare nei PDF che l'azienda carica.
 */
export function buildRosterUserIds(
  tree: Pick<ShiftTeamTree, 'types'> | null | undefined,
): Set<string> {
  const out = new Set<string>()
  for (const type of tree?.types ?? []) {
    // Come il motore teorico (lib/turni-teorici): tipologie e membri spenti non
    // generano turni, quindi non mettono nessuno «in turno».
    if (!type.is_active) continue
    for (const team of type.teams ?? []) {
      for (const member of team.members ?? []) {
        if (member.is_active && member.user_id) out.add(member.user_id)
      }
    }
  }
  return out
}

/**
 * IL COGNOME NUDO È DI UNO SOLO O DI NESSUNO? (dal ROSTER, 25/09/2026)
 *
 * Il caso reale: nell'app ci sono DUE Nevano, ma in squadra ne lavora UNO —
 * Giuseppe è fuori dai turni, e chi compila i PDF scrive «NEVANO» senza iniziale
 * (l'unico Nevano dei PDF è Pietro). Con l'elenco degli utenti da solo quel
 * cognome è ambiguo e la riga nuda non è di nessuno; col ROSTER no: due utenti
 * con lo stesso cognome contano come omonimia solo se sono DUE i colleghi IN
 * TURNO.
 *
 * Tre esiti:
 *   • `proprietarioId` — un solo collega in turno con quel cognome: la riga nuda
 *     è la SUA (è il caso dev, e la produzione appena il membro è legato);
 *   • `ambigua` — due o più colleghi in turno (le righe con l'iniziale restano
 *     l'unico modo di distinguerli), oppure NESSUNO in turno ma due utenti con
 *     quel cognome: il roster non è legato agli utenti (la produzione di oggi ha
 *     87 membri e zero `user_id`) e allora non si sa chi lavora → si tace;
 *   • né l'uno né l'altro — cognome non omonimo: nessun problema.
 *
 * Tacere quando il roster non è legato è deliberato: il difetto da non rifare è
 * un avviso FALSO (l'accusa a Pietro Nevano del 25/09/2026).
 */
export function omonimiaInSala(
  cognome: string | null | undefined,
  users: Array<{ id?: string | null; cognome?: string | null }> | null | undefined,
  rosterIds?: Set<string> | null,
): { ambigua: boolean; proprietarioId: string | null } {
  const key = normNameKey(cognome ?? '')
  if (!key) return { ambigua: false, proprietarioId: null }
  const omonimi = (users ?? []).filter(u => u.id && normNameKey(u.cognome ?? '') === key)
  if (omonimi.length < 2) return { ambigua: false, proprietarioId: null }
  const inTurno = omonimi.filter(u => rosterIds?.has(u.id as string))
  if (inTurno.length === 1) return { ambigua: false, proprietarioId: inTurno[0].id as string }
  return { ambigua: true, proprietarioId: null }
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
