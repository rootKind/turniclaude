'use client'
// DATI DI /TUOTURNO LETTI DAL CLIENT (13/10/2026).
//
// Prima li preparava la pagina server a ogni render — e, da quando i bottoni
// della barra sono `<Link prefetch>`, anche a ogni PREFETCH dei link vicini: la
// materia prima (i mesi PDF) e il predittore del teorico si calcolavano sul
// server per un utente che magari non aveva ancora aperto la pagina. Misurato:
// tutte e cinque le render che restavano al server erano prefetch di /turnisala
// e /tuoturno.
//
// Qui c'è la STESSA materia prima, con lo STESSO calcolo: la storia resta
// completa (tutti i mesi v2 caricati, non solo quelli visitati) perché il
// predittore «cycle/rotation» si regge sui cicli lunghi. Cambia solo DOVE gira:
// nella cache del client (react-query), letta contro Supabase dalla sessione del
// browser — che è esattamente ciò che questa pagina fa già per i singoli mesi.
import { createClient } from '@/lib/supabase/client'
import { buildDuplicateCognomi } from '@/lib/utils'
import { buildBareOwners, type BareOwner } from '@/lib/shift-teams-matching'
import { buildPersonTheoretical, type PersonTheoretical } from '@/lib/person-cycle'
import type { SalaMonthData, ShiftTeamTree } from '@/types/database'
import type { UserProfile } from '@/types/database'

/** Anagrafica minima di un utente, la stessa riga del selettore «Turni di chi?». */
export type TuoturnoUser = Pick<
  UserProfile,
  'id' | 'nome' | 'cognome' | 'is_secondary' | 'is_manager' | 'show_in_compare'
>

/** Un mese PDF in forma compatta v2 (le righe «teorico» del parser). */
export interface TuoturnoMonth {
  month: string
  schedule: SalaMonthData
}

/**
 * I mesi PDF caricati, in forma compatta v2.
 *
 * Si scaricano i mesi INTERI (≈18 KB l'uno, ~129 KB i sette di oggi) invece dei
 * soli predittori calcolati (~46 KB): è il prezzo di non far più renderizzare il
 * server, ed è un costo che la cache del client paga una volta per sessione. I
 * mesi ancora da caricare non hanno righe teoriche e non servono al predittore:
 * si scartano qui, come faceva la pagina server.
 */
export async function fetchTuoturnoMonths(): Promise<TuoturnoMonth[]> {
  const supabase = createClient()
  const { data, error } = await supabase.from('sala_schedule').select('month, schedule')
  if (error) throw error

  const months: TuoturnoMonth[] = []
  for (const row of data ?? []) {
    const raw = row.schedule as unknown
    if (raw && typeof raw === 'object' && (raw as { v?: unknown }).v === 2) {
      months.push({ month: row.month, schedule: raw as SalaMonthData })
    }
  }
  return months
}

/**
 * Predittore del teorico per ogni utente + mappa degli omonimi ridotti al solo
 * cognome («NEVANO P./G.»), che il client vorrà come coppie perché le Map non
 * attraversano un confine serializzato.
 *
 * Il calcolo è quello della pagina server fino al 13/10/2026: le righe base dei
 * PDF sono la fonte esatta, il predittore copre i mesi che un PDF non ce l'hanno.
 * Essendo puro, gira nel client con gli stessi ingressi (mesi v2 + utenti +
 * albero squadre).
 */
export function buildTuoturnoTheoretical(
  months: TuoturnoMonth[],
  users: TuoturnoUser[],
  tree: ShiftTeamTree,
): { personTheoretical: Record<string, PersonTheoretical>; bareOwners: Array<[string, BareOwner]> } {
  const duplicateCognomi = buildDuplicateCognomi(users)
  // Omonimi e righe NUDE: di chi è il solo cognome lo decide il ROSTER — l'unico
  // collega IN TURNO con quel cognome (chi è fuori dai turni non rende ambiguo il
  // cognome di chi ci sta). Il membro legato serve per l'iniziale; l'identità
  // basta quando l'iniziale non c'è.
  const bareOwners = buildBareOwners(tree, duplicateCognomi, users)

  const pdfMonths = new Map<string, SalaMonthData>()
  for (const m of months) pdfMonths.set(m.month, m.schedule)

  const personTheoretical: Record<string, PersonTheoretical> = {}
  if (pdfMonths.size > 0) {
    for (const u of users) {
      const src = buildPersonTheoretical(pdfMonths, u, duplicateCognomi, bareOwners)
      if (src) personTheoretical[u.id] = src
    }
  }

  return { personTheoretical, bareOwners: [...bareOwners.entries()] }
}
