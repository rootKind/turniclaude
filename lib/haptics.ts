/**
 * LA VIBRAZIONE (M10 del piano, 22/09/2026) — il canale aptico dell'app.
 *
 * I navigatori desktop non vibrano, WebKit non distribuisce `navigator.vibrate`
 * alle PWA: la funzione esiste, l'effetto no. Chrome Android invece la spara da
 * una PWA installata — ed è lì che l'aptica di Material ha senso. La SKIN decide
 * se e quanto: le durate sono i token `--aptica-*` dei blocchi di piattaforma,
 * letti qui a ogni chiamata. Su iOS valgono `0ms`: il guard `> 0` spegne tutto,
 * senza un solo ramo condizionale nel codice che la usa — lo stesso patto delle
 * state layer di M4, che su iOS sono trasparenti e il componente non sa nulla.
 *
 * Quattro accenti, non uno: il vocabolario di M3 distingue il tocco riconosciuto
 * (tap), l'avviso prima di una scelta pesante (pressione lunga), la conferma di
 * una decisione distruttiva (doppio colpo forte) e il rifiuto di un'azione
 * (errore). Le durate sono corte di proposito: l'aptica è un accento, non un
 * massage vibrante.
 */

export type MomentoAptico = '--aptica-tap' | '--aptica-avviso' | '--aptica-conferma' | '--aptica-errore'

/**
 * I token si citano LETTERALMENTE nello switch: il contratto dei token
 * (`scripts/check-design-tokens.mjs`) riconosce un lettore solo da
 * `getPropertyValue('--x')` scritto in chiaro — un parametro dinamico sarebbe
 * un lettore invisibile, e la skin «mezza vestita» che quel controllo esiste
 * per impedire.
 */
function leggiDurata(momento: MomentoAptico): number {
  const stile = getComputedStyle(document.documentElement)
  switch (momento) {
    case '--aptica-tap':
      return parseInt(stile.getPropertyValue('--aptica-tap'), 10)
    case '--aptica-avviso':
      return parseInt(stile.getPropertyValue('--aptica-avviso'), 10)
    case '--aptica-conferma':
      return parseInt(stile.getPropertyValue('--aptica-conferma'), 10)
    case '--aptica-errore':
      return parseInt(stile.getPropertyValue('--aptica-errore'), 10)
  }
}

/** Fa vibrare il dispositivo per il momento dato. Silenzio dove non c'è né motore né permesso. */
export function aptica(momento: MomentoAptico): void {
  try {
    const durata = leggiDurata(momento)
    if (!Number.isFinite(durata) || durata <= 0) return
    navigator.vibrate?.(durata)
  } catch {
    /* Nessun DOM (SSR/test) o API assente: il silenzio è la firma della skin. */
  }
}

/** I quattro momenti in cui l'app tocca la mano. */
export const haptics = {
  tap: () => aptica('--aptica-tap'),
  avviso: () => aptica('--aptica-avviso'),
  conferma: () => aptica('--aptica-conferma'),
  errore: () => aptica('--aptica-errore'),
}
