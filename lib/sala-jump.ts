'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ShiftType } from '@/types/database'
import { getSalaLayout } from '@/lib/queries/sala-layout'
import type { BoardPlacement } from '@/lib/shift-tokens'

/**
 * MEMORIA BREVE DEL SALTO IN SALA (richiesta 19/09/2026: «rendi istantaneo il
 * salto dalla card di un cambio»; revisione 19/09/2026: la risposta è diventata
 * più larga, perché non basta più il turno).
 *
 * La card di un cambio, prima di portare in /turnisala, chiede ai turni se quella
 * persona ha davvero quel turno quel giorno E se la board la metterebbe su una
 * card di sezione (`getUserShiftOnDate` + `boardSectionKeys`). È una risposta che
 * costa qualche decimo di secondo — e prima si pagava TUTTA dopo il tap.
 *
 * Qui si tengono due cose, entrambe piccole e per forza di cose brevi:
 *  1. l'esito già noto, per `userId|giorno` (TTL sotto): il tap successivo non
 *     chiede più niente, salta subito;
 *  2. la richiesta IN VOLO, condivisa: il `pointerdown` la avvia e il `click`
 *     della stessa card ne riceve la stessa promessa invece di aprirne una
 *     seconda. È questo che rende il salto immediato.
 *
 * Perché un TTL e non una memoria «per sempre»: i turni cambiano. Un cambio
 * confermato sposta la persona, un PDF nuovo riscrive il mese, e la piantina si
 * può modificare dall'admin. Un minuto è la finestra in cui la risposta è
 * ragionevolmente la stessa, e va ben oltre il gesto che stiamo servendo.
 *
 * Gli ERRORI non si memorizzano: il prossimo tap riprova.
 */

/** Per quanto un esito resta valido (ms). */
const SHIFT_LOOKUP_TTL_MS = 60_000

/** Quello che la card deve sapere per decidere: il turno E dove la board mostra
 *  la persona (`UserShiftOnDate` in lib/shift-compat, `BoardPlacement` in
 *  lib/shift-tokens). */
export interface EsitoSala {
  shift: ShiftType | null
  /** Il token grezzo del giorno (`M7S`, `MTUTOR`, `RM`…): serve a spiegare. */
  token: string
  /** Card di sezione, pillola delle «Altre attività», o niente. */
  placement: BoardPlacement | null
  /** Sezione del token (`7`, `DCIF`, `M3M40`…), quando sta su una card. */
  section: string | null
}

interface Salvato {
  esito: EsitoSala
  at: number
}

const remembered = new Map<string, Salvato>()
const inFlight = new Map<string, Promise<EsitoSala>>()

/** Chiave della memoria: la persona E il giorno (mai solo la persona). */
export function shiftLookupKey(userId: string, dateISO: string): string {
  return `${userId}|${dateISO}`
}

/** Esito già noto e ancora fresco; `undefined` = da chiedere ai turni. */
export function rememberedEsito(key: string, now = Date.now()): EsitoSala | undefined {
  const e = remembered.get(key)
  if (!e) return undefined
  if (now - e.at > SHIFT_LOOKUP_TTL_MS) {
    remembered.delete(key)
    return undefined
  }
  return e.esito
}

export function rememberEsito(key: string, esito: EsitoSala, now = Date.now()): void {
  remembered.set(key, { esito, at: now })
}

/** Dimentica un esito (o tutta la memoria, senza chiave). */

/**
 * Lettura passante: risponde dalla memoria se c'è, altrimenti condivide la
 * richiesta già in volo, altrimenti chiede (`load`).
 */
export function loadEsitoOnce(
  key: string,
  load: () => Promise<EsitoSala>,
): Promise<EsitoSala> {
  const known = rememberedEsito(key)
  if (known !== undefined) return Promise.resolve(known)
  const pending = inFlight.get(key)
  if (pending) return pending
  const p = load().then(
    esito => {
      inFlight.delete(key)
      rememberEsito(key, esito)
      return esito
    },
    err => {
      // Niente memoria per gli errori: la prossima volta si riprova.
      inFlight.delete(key)
      throw err
    },
  )
  inFlight.set(key, p)
  return p
}

/**
 * LE SEZIONI CHE UNA CARD PUÒ ILLUMINARE — la piantina della board, una volta
 * per sessione di pagina.
 *
 * La board scrive un nome su una card solo se la sua sezione è collegata a una
 * card (`card.sectionKey ?? card.title`, vedi `lookupKey` in desk-board): una
 * persona in una sezione senza card (`IAP`, `5T10`…) è in sala ma su nessuna
 * card, quindi NON è illuminabile. Senza questo dato la verifica direbbe «sì» e
 * la board risponderebbe con il vecchio avviso giallo — la contraddizione che
 * vogliamo chiudere.
 *
 * `null` = piantina non leggibile: il chiamante torna al comportamento di prima
 * (fidarsi del solo turno), così un errore di rete non blocca i salti legittimi.
 */
let sezioniBoard: Promise<Set<string> | null> | null = null

export function boardSectionKeys(supabase: SupabaseClient): Promise<Set<string> | null> {
  if (!sezioniBoard) {
    const p = getSalaLayout(supabase)
      .then(layout => new Set(layout.cards.map(c => c.sectionKey ?? c.title).filter(Boolean)))
      .catch(() => null)
    // Un fallimento non si tiene in memoria per tutta la sessione: il prossimo
    // tap riprova (la piantina è l'unica cosa che può renderlo utile).
    void p.then(keys => { if (keys === null) sezioniBoard = null })
    sezioniBoard = p
  }
  return sezioniBoard
}

/** Dimentica la piantina letta (test e cambi di layout nella stessa sessione). */
