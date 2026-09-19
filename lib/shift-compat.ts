import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalaMonthData, ShiftTeamTree, ShiftType } from '@/types/database'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { decodeSalaMonth, findMonthPerson, salaCodeInfo } from '@/lib/sala-month'
import { theoreticalTokenFor } from '@/lib/person-shift'
import { boardPlacementOf, type BoardPlacement } from '@/lib/shift-tokens'
import { buildDuplicateCognomi } from '@/lib/utils'
import { buildBareOwners, buildRosterUserIds, omonimiaInSala } from '@/lib/shift-teams-matching'

/**
 * Compatibilità fra una richiesta di cambio turno e il turno dell'utente in un
 * giorno (richiesta 12/09/2026): il turno UPGRADE riguarda il giorno in cui il
 * richiedente Cede il turno — per poterlo prendere devo avere io quel giorno uno
 * dei turni che cerca (P chi cerca M, ecc.). La mia fonte è:
 *   1. il turno REALE dal PDF del mese (la verità, se il mese è caricato);
 *   2. in mancanza, il turno TEORICO (riga base non disponibile lato API: si usa
 *      la rotazione delle squadre del DB via `theoreticalTokenFor`).
 * Un giorno di riposo/assenza non copre nessun turno.
 */

/** 'M' | 'P' | 'N' da un token sala (M7S → M, P10 → P, N5TIR → N, piaptir → P). */
export function salaTokenToShiftType(token: string | null | undefined): ShiftType | null {
  const kind = salaCodeInfo(token).kind
  if (kind !== 'work') return null
  const c = (token ?? '').trim().charAt(0).toUpperCase()
  return c === 'M' ? 'Mattina' : c === 'P' ? 'Pomeriggio' : 'Notte'
}

export interface UserShiftOnDate {
  /** Turno dell'utente nel giorno, se lavorativo. */
  shift: ShiftType | null
  source: 'real' | 'theoretical' | 'none'
  token: string
  /** DOVE LA BOARD MOSTRA QUESTO TOKEN (`boardPlacementOf`): su una CARD di
   *  sezione, nella riga «Altre attività» (pillola) o da nessuna parte.
   *  `shift` da solo non basta: `MTUTOR`, `M` «nudo», `NDisNa` sono letti come
   *  turno M/P/N (`salaCodeInfo` → `work`) ma la board non li mette su nessuna
   *  card — la loro evidenzia è la PILLOLA (richiesta 19/09/2026). */
  placement: BoardPlacement | null
  /** Sezione del token (`7`, `DCIF`, `M3M40`…) quando sta su una card. */
  section: string | null
  /**
   * Vero se il turno trovato è attribuibile a QUESTA persona senza dubbi.
   * Falso quando il cognome è OMONIMO fra i colleghi IN TURNO (dal roster, vedi
   * `omonimiaInSala`), o quando il roster non è legato agli utenti e quindi non
   * si sa chi lavora: la riga «NEVANO» e il membro «NEVANO» possono essere del
   * gemello. Chi usa il dato per DECIDERE deve guardarlo (vedi
   * `ownShiftMatchesOffer`); chi lo usa per MOSTRARE — il salto in sala dalla
   * dashboard — continua come prima.
   */
  certain: boolean
}

/** Com'è la board a vedere questo token: card, pillola o niente. */
function conDestinazione(info: Omit<UserShiftOnDate, 'placement' | 'section'>): UserShiftOnDate {
  const dove = boardPlacementOf(info.token)
  return { ...info, placement: dove, section: dove?.kind === 'card' ? dove.section : null }
}

/**
 * Turno dell'utente nel giorno: reale dal PDF del mese, altrimenti teorico.
 * `schedule` è la riga `sala_schedule` GREZZA (jsonb v1 o v2): qui si decodifica.
 */
export async function getUserShiftOnDate(
  supabase: SupabaseClient,
  userId: string,
  dateISO: string,
): Promise<UserShiftOnDate> {
  const month = dateISO.slice(0, 7)

  /* ROSTER + ELENCO UTENTI, una volta sola per entrambi i rami (reale e teorico).
     Servono a due domande diverse:
       • il ROSTER (`buildRosterUserIds`) dice chi è in turno — la dev lega
         «NEVANO P.» a Pietro, la produzione non lega nessuno;
       • l'ELENCO UTENTI dice chi esiste nell'app.
     Da qui `certain`: una riga ridotta al solo cognome è di qualcuno SOLO se il
     roster lo identifica (un solo collega in turno con quel cognome). Altrimenti
     non si attribuisce niente a nessuno, e chi decide tace (vedi `omonimiaInSala`). */
  let tree: ShiftTeamTree | null = null
  let users: Array<{ id: string; nome: string | null; cognome: string | null }> = []
  try {
    tree = await fetchShiftTeamTree(supabase)
  } catch { /* roster non disponibile: resta la regola per nome */ }
  try {
    const { data } = await supabase.from('users').select('id, nome, cognome')
    users = (data ?? []) as typeof users
  } catch { /* elenco utenti non disponibile */ }

  const me = users.find(u => u.id === userId)
  const { ambigua, proprietarioId } = omonimiaInSala(me?.cognome, users, buildRosterUserIds(tree))
  /** Il turno trovato è attribuibile a QUESTA persona senza dubbi? */
  const certo = !ambigua && (!proprietarioId || proprietarioId === userId)

  const duplicateCognomi = buildDuplicateCognomi(users)
  // Mappa «riga nuda → proprietario»: la decide il ROSTER (l'unico collega in
  // turno con quel cognome), con l'elenco utenti a disposizione.
  const bareOwners = buildBareOwners(tree, duplicateCognomi, users)

  // 1. REALE: riga del PDF del mese, se caricata.
  try {
    const { data: row } = await supabase
      .from('sala_schedule')
      .select('schedule')
      .eq('month', month)
      .maybeSingle()
    const raw = row?.schedule as { v?: unknown } | null | undefined
    if (raw && typeof raw === 'object' && raw.v === 2) {
      const people = decodeSalaMonth(raw as unknown as SalaMonthData)
      const person = findMonthPerson(people, { id: userId, nome: me?.nome, cognome: me?.cognome }, undefined, bareOwners)
      const token = person?.days[Number(dateISO.slice(8, 10)) - 1] ?? ''
      const shift = salaTokenToShiftType(token)
      if (shift) return conDestinazione({ shift, source: 'real', token, certain: certo })
      if (token) return conDestinazione({ shift: null, source: 'real', token, certain: certo }) // riposo/assenza: non copre nulla
    }
  } catch {
    /* PDF mancante o formato vecchio: si passa al teorico */
  }

  // 2. TEORICO: rotazione delle squadre (stesso motore della pagina Il tuo turno).
  try {
    if (tree) {
      const token = theoreticalTokenFor(tree, me ?? { id: userId }, dateISO, duplicateCognomi, bareOwners)
      const shift = salaTokenToShiftType(token)
      if (shift) return conDestinazione({ shift, source: 'theoretical', token, certain: certo })
      if (token) return conDestinazione({ shift: null, source: 'theoretical', token, certain: certo })
    }
  } catch {
    /* squadre non disponibili: nessuna verifica possibile */
  }

  return conDestinazione({ shift: null, source: 'none', token: '', certain: certo })
}

/**
 * TRUE se l'utente può soddisfare la richiesta: il suo turno del giorno offerto
 * è fra i `requestedShifts` (per il motore di match esistente la corrispondenza
 * è sul TIPO di turno: M/P/N).
 */
export function userCoversRequest(shift: ShiftType | null, requestedShifts: ShiftType[]): boolean {
  return !!shift && requestedShifts.includes(shift)
}

/**
 * LA VERIFICA PRE-PUBBLICAZIONE (rifatta il 25/09/2026): il turno che offro è
 * QUELLO CHE QUEL GIORNO HO DAVVERO?
 *
 * Prima la stessa domanda del filtro notifiche (`userCoversRequest`) veniva
 * riusata sul richiedente: «il mio turno è fra quelli che cerco?». Sono due
 * domande diverse. Quella ha senso per CHI RICEVE (posso coprire il tuo cambio
 * solo se quel giorno ho uno dei turni che chiedi); sul richiedente diventa
 * impossibile da soddisfare — l'UI non permette di cercare il turno che offri —
 * quindi il popup usciva SEMPRE: «Pietro Nevano ha offerto notte per mattina il
 * 25/09 e, pur avendo notte (N5T nel PDF), ha avuto l'avviso» (richiesta utente).
 *
 * La domanda giusta è di POSSESSO: non si cede un turno che quel giorno non si
 * ha. `true` (nessun avviso) anche quando il dato non c'è — assenza di fonti o
 * cognome omonimo fra colleghi in turno — perché l'ignoranza non è una colpa:
 * senza questa uscita la produzione, dove nessun membro è legato, tornerebbe ad
 * accusare i gemelli. Il cognome di chi NON è in turno, però, non rende ambiguo
 * quello di chi lo è: è la regola del roster (`omonimiaInSala`).
 */
export function ownShiftMatchesOffer(
  mine: Pick<UserShiftOnDate, 'shift' | 'source' | 'certain'>,
  offered: ShiftType | null | undefined,
): boolean {
  if (!offered) return true
  if (mine.source === 'none' || !mine.certain) return true
  return mine.shift === offered
}
