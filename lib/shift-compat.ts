import type { SupabaseClient } from '@supabase/supabase-js'
import type { SalaMonthData, ShiftType } from '@/types/database'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { decodeSalaMonth, findMonthPerson, salaCodeInfo } from '@/lib/sala-month'
import { theoreticalTokenFor } from '@/lib/person-shift'
import { buildDuplicateCognomi } from '@/lib/utils'

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

/** 'M' | 'P' | 'N' da un token sala (M7S → M, P10 → P, N5TIR → N). */
export function salaTokenToShiftType(token: string | null | undefined): ShiftType | null {
  const kind = salaCodeInfo(token).kind
  if (kind !== 'work') return null
  const c = (token ?? '').trim()[0]
  return c === 'M' ? 'Mattina' : c === 'P' ? 'Pomeriggio' : 'Notte'
}

export interface UserShiftOnDate {
  /** Turno dell'utente nel giorno, se lavorativo. */
  shift: ShiftType | null
  source: 'real' | 'theoretical' | 'none'
  token: string
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
      const { data: u } = await supabase.from('users').select('nome, cognome').eq('id', userId).maybeSingle()
      const person = findMonthPerson(people, { id: userId, nome: u?.nome, cognome: u?.cognome })
      const token = person?.days[Number(dateISO.slice(8, 10)) - 1] ?? ''
      const shift = salaTokenToShiftType(token)
      if (shift) return { shift, source: 'real', token }
      if (token) return { shift: null, source: 'real', token } // riposo/assenza: non copre nulla
    }
  } catch {
    /* PDF mancante o formato vecchio: si passa al teorico */
  }

  // 2. TEORICO: rotazione delle squadre (stesso motore della pagina Il tuo turno).
  try {
    const tree = await fetchShiftTeamTree(supabase)
    if (tree) {
      const { data: users } = await supabase.from('users').select('id, nome, cognome')
      const duplicateCognomi = buildDuplicateCognomi(users ?? [])
      const me = (users ?? []).find(u => u.id === userId)
      const token = theoreticalTokenFor(tree, me ?? { id: userId }, dateISO, duplicateCognomi)
      const shift = salaTokenToShiftType(token)
      if (shift) return { shift, source: 'theoretical', token }
      if (token) return { shift: null, source: 'theoretical', token }
    }
  } catch {
    /* squadre non disponibili: nessuna verifica possibile */
  }

  return { shift: null, source: 'none', token: '' }
}

/**
 * TRUE se l'utente può soddisfare la richiesta: il suo turno del giorno offerto
 * è fra i `requestedShifts` (per il motore di match esistente la corrispondenza
 * è sul TIPO di turno: M/P/N).
 */
export function userCoversRequest(shift: ShiftType | null, requestedShifts: ShiftType[]): boolean {
  return !!shift && requestedShifts.includes(shift)
}
