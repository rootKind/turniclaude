/**
 * PIATTAFORMA — iOS / Android / desktop (20/09/2026).
 *
 * Perché esiste: prima di questo file l'app riconosceva la piattaforma in TRE
 * posti diversi, ognuno con la sua copia della stessa regex sullo User-Agent
 * (`app/installa/page.tsx`, `components/shifts/shift-dialog.tsx`,
 * `components/settings/notification-help-dialog.tsx`) e senza modo di sapere
 * «su che piattaforma sto girando» da dentro i componenti. Qui la logica è una
 * sola, PURA (nessun accesso al DOM, nessun `navigator`): la usano il server
 * (che la chiama sullo User-Agent della richiesta) e le spec.
 *
 * Il design system duale poggia su due cose: l'attributo `data-platform` su
 * `<html>` — scritto dal SERVER nel layout root, così la skin giusta è già
 * nell'HTML iniziale e non esiste un frame con quella sbagliata — e questo file,
 * che è l'unico punto in cui si decide «di che piattaforma si tratta».
 */

export type Platform = 'ios' | 'android' | 'desktop'

/** Attributo su `<html>` che pilota i token di piattaforma in `app/globals.css`. */
export const PLATFORM_ATTR = 'data-platform'

/** Chiave di localStorage dell'override di QA (per guardare la skin dell'altra piattaforma). */
export const PLATFORM_OVERRIDE_KEY = 'turni-platform-override'

export const PLATFORMS: readonly Platform[] = ['ios', 'android', 'desktop']

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value)
}

/**
 * Quale piattaforma descrive questo User-Agent.
 *
 * Ordine e dettagli contano:
 * - Android per primo: uno UA Android non contiene mai «iPhone», ma è meglio non
 *   far dipendere la risposta dall'ordine dei controlli.
 * - iPadOS 13+ si dichiara «Macintosh» (desktop mode): l'unico modo per
 *   distinguerlo da un Mac vero è `maxTouchPoints > 1`, che va passato da chi
 *   ha accesso a `navigator` (il server non ce l'ha, e in quel caso un iPad
 *   resta «desktop»: sul server non possiamo saperlo, ed è il limite dichiarato
 *   di questa funzione — la skin iOS su iPad in desktop mode arriva con
 *   l'override, non indovinata).
 * - Tutto il resto è desktop, che è anche il valore SENZA attributo: i token di
 *   base valgono i valori di sempre, e una piattaforma sconosciuta non vede una
 *   skin a caso.
 */
export function detectPlatformFromUA(
  ua: string | null | undefined,
  opts?: { maxTouchPoints?: number },
): Platform {
  if (!ua) return 'desktop'
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPod/i.test(ua)) return 'ios'
  if (/iPad/i.test(ua)) return 'ios'
  // iPadOS 13+ in desktop mode: si presenta come Mac, ma ha il touch.
  if (/Macintosh/i.test(ua) && (opts?.maxTouchPoints ?? 0) > 1) return 'ios'
  return 'desktop'
}

/** `?platform=ios|android|desktop` — override per una singola apertura (spec e QA a mano). */
export function parsePlatformParam(search: string): Platform | null {
  const value = new URLSearchParams(search).get('platform')
  return isPlatform(value) ? value : null
}

/**
 * L'override di QA, se c'è: la query vince sulla scelta persistita.
 * Solo client (legge `location` e `localStorage`): sul server risponde `null`.
 */
export function readPlatformOverride(): Platform | null {
  if (typeof window === 'undefined') return null
  const fromQuery = parsePlatformParam(window.location.search)
  if (fromQuery) return fromQuery
  try {
    const stored = window.localStorage.getItem(PLATFORM_OVERRIDE_KEY)
    return isPlatform(stored) ? stored : null
  } catch {
    // localStorage negato (Safari in modalità privata, ITP): nessun override.
    return null
  }
}
