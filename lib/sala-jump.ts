'use client'

import type { ShiftType } from '@/types/database'

/**
 * MEMORIA BREVE DEL TURNO DI UNA PERSONA IN UN GIORNO (richiesta 19/09/2026:
 * «rendi istantaneo il salto dalla card di un cambio»).
 *
 * La card di un cambio, prima di portare in /turnisala, chiede ai turni se quella
 * persona ha davvero quel turno quel giorno (PDF del mese, altrimenti rotazione
 * teorica: `getUserShiftOnDate`). È una risposta che costa qualche decimo di
 * secondo — e prima si pagava TUTTA dopo il tap, con la card in attesa.
 *
 * Qui si tengono due cose, entrambe piccole e per forza di cose brevi:
 *  1. l'esito già noto, per `userId|giorno` (TTL sotto): il tap successivo non
 *     chiede più niente, salta subito;
 *  2. la richiesta IN VOLO, condivisa: il `pointerdown` la avvia e il `click`
 *     della stessa card ne riceve la stessa promessa invece di aprirne una
 *     seconda. È questo che rende il salto immediato: quando il dito arriva al
 *     click, la risposta o è già lì o è a un microtask di distanza.
 *
 * Perché un TTL e non una memoria «per sempre»: i turni cambiano. Un cambio
 * confermato sposta la persona, un PDF nuovo riscrive il mese. Un minuto è la
 * finestra in cui la risposta è ragionevolmente la stessa, e va ben oltre il
 * gesto che stiamo servendo (tap e ritap della stessa card).
 *
 * Gli ERRORI non si memorizzano: il prossimo tap riprova.
 */

/** Per quanto un esito resta valido (ms). */
export const SHIFT_LOOKUP_TTL_MS = 60_000

interface Esito {
  shift: ShiftType | null
  at: number
}

const remembered = new Map<string, Esito>()
const inFlight = new Map<string, Promise<ShiftType | null>>()

/** Chiave della memoria: la persona E il giorno (mai solo la persona). */
export function shiftLookupKey(userId: string, dateISO: string): string {
  return `${userId}|${dateISO}`
}

/** Esito già noto e ancora fresco; `undefined` = da chiedere ai turni. */
export function rememberedShift(key: string, now = Date.now()): ShiftType | null | undefined {
  const e = remembered.get(key)
  if (!e) return undefined
  if (now - e.at > SHIFT_LOOKUP_TTL_MS) {
    remembered.delete(key)
    return undefined
  }
  return e.shift
}

export function rememberShift(key: string, shift: ShiftType | null, now = Date.now()): void {
  remembered.set(key, { shift, at: now })
}

/** Dimentica un esito (o tutta la memoria, senza chiave). */
export function forgetShift(key?: string): void {
  if (key) remembered.delete(key)
  else remembered.clear()
}

/**
 * Lettura passante: risponde dalla memoria se c'è, altrimenti condivide la
 * richiesta già in volo, altrimenti chiede (`load`).
 */
export function loadShiftOnce(
  key: string,
  load: () => Promise<ShiftType | null>,
): Promise<ShiftType | null> {
  const known = rememberedShift(key)
  if (known !== undefined) return Promise.resolve(known)
  const pending = inFlight.get(key)
  if (pending) return pending
  const p = load().then(
    shift => {
      inFlight.delete(key)
      rememberShift(key, shift)
      return shift
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
