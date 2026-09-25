/**
 * LE CHIP «COMPATIBILI» E «A CATENA» DELLA LISTA FERIE (richiesta 25/09/2026).
 *
 * Finora la compatibilità si vedeva solo PUBBLICANDO una nuova richiesta (il
 * dialog mostra match e catene): prima di pubblicare, scorrendo la lista, non
 * si capiva chi potesse accettare il proprio periodo. Qui si risponde con lo
 * STESSO motore del dialog (findCompatibleVacationRequests +
 * findVacationChains in lib/queries/vacations.ts, così lista e dialog non
 * possono contraddirsi), ma partendo dalle richieste GIÀ PUBBLICATE
 * dell'utente nell'anno visto:
 *
 *   • DIRETTE  — scambio a due: l'altro offre un periodo che voglio e vuole un
 *     periodo che offro (il ciclo A↔B);
 *   • CATENE   — giri chiusi da ≥ 3 persone: tu → B → C → tu, dove ognuno cede
 *     al successivo (BFS identica a quella del dialog, max 4 nodi intermedi).
 *
 * La logica è PURA: i dati arrivano già caricati nel browser (elenco richieste
 * dell'anno con interessi, hook use-vacation-requests) — nessuna lettura nuova.
 * Le richieste dell'utente stesso restano fuori dai gruppi: non ci si scambia
 * con sé stessi.
 */
import type { VacationRequestWithInterests, VacationPeriod } from '@/types/database'
import { findCompatibleVacationRequests, findVacationChains } from '@/lib/queries/vacations'

/** Il minimo di richiesta propria che serve per il confronto. */
export type RichiestaPropria = Pick<
  VacationRequestWithInterests,
  'user_id' | 'offered_period' | 'target_periods'
>

export interface CatenaFerie {
  /** Intestazione del gruppo: «Catena a 3: tu P2 → Rossi P6 → Bianchi P3 → tu». */
  titolo: string
  /** I nodi intermedi, nell'ordine del giro (il primo riceve il MIO periodo). */
  requests: VacationRequestWithInterests[]
  /** Il periodo che OTTIENI chiudendo il giro (l'offerto dall'ultimo nodo). */
  ottieni: VacationPeriod
}

export interface CompatFerie {
  /** Scambi diretti a due (una sola card per richiesta, senza doppioni). */
  dirette: VacationRequestWithInterests[]
  /** Un gruppo PER catena; una richiesta può stare in più catene diverse. */
  catene: CatenaFerie[]
}

/** «Catena a 3: tu P2 → Di Monda P6 → Sabia P3 → tu»: ogni nome cede il P che sta dopo di lui.
 *  Il numero è le PERSONE coinvolte (i nodi + chi guarda), come nel dialog. */
export function titoloCatena(
  propria: RichiestaPropria,
  nodi: VacationRequestWithInterests[],
): string {
  const parti: string[] = [`tu P${propria.offered_period}`]
  for (const nodo of nodi) {
    parti.push(`${nodo.user?.cognome ?? '?'} P${nodo.offered_period}`)
  }
  parti.push('tu')
  return `Catena a ${nodi.length + 1}: ${parti.join(' → ')}`
}

/**
 * Divide le richieste altrui in scambi diretti e catene, rispetto a TUTTE le
 * richieste proprie dell'anno. Nessun doppione fra le dirette; le catene sono
 * distinte per sequenza di nodi (richieste proprie multiple confrontano tutte).
 */
export function gruppiCompatibiliFerie(
  requests: readonly VacationRequestWithInterests[],
  propri: readonly RichiestaPropria[],
): CompatFerie {
  const dirette = new Map<number, VacationRequestWithInterests>()
  const catene = new Map<string, CatenaFerie>()

  for (const propria of propri) {
    for (const r of findCompatibleVacationRequests(
      requests as VacationRequestWithInterests[],
      propria.offered_period as VacationPeriod,
      propria.target_periods as VacationPeriod[],
      propria.user_id,
    )) {
      dirette.set(r.id, r)
    }
    for (const nodi of findVacationChains(
      requests as VacationRequestWithInterests[],
      propria.offered_period as VacationPeriod,
      propria.target_periods as VacationPeriod[],
      propria.user_id,
    )) {
      const chiave = nodi.map(n => n.id).join('-')
      if (!catene.has(chiave)) {
        catene.set(chiave, {
          titolo: titoloCatena(propria, nodi),
          requests: nodi,
          ottieni: nodi[nodi.length - 1].offered_period,
        })
      }
    }
  }

  return { dirette: [...dirette.values()], catene: [...catene.values()] }
}
