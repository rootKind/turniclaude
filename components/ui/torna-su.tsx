'use client'

import { useSyncExternalStore } from 'react'
import { ArrowUp } from 'lucide-react'

/**
 * M12 — «TORNA SU» (23/09/2026).
 *
 * Il piano lo chiedeva per le liste lunghe, ed è una di quelle cose che si notano
 * solo quando mancano: le notifiche si accumulano, e dopo aver scorso fino in
 * fondo l'unico modo di risalire era ripercorrere tutta la pagina col pollice. Su
 * un telefono, con la barra di navigazione in basso, sono dieci secondi di pollice
 * a metà schermo.
 *
 * PERCHÉ NON `useState` + `useEffect`. La prima versione ascoltava lo scorrimento
 * e aggiornava uno stato: funzionava, ma solo per gli scorrimenti AVVENUTI DOPO
 * il montaggio. Se la pagina si apriva già scorsa (un reload a metà lista, il
 * ritorno dalla cache del browser, o semplicemente un dito veloce durante
 * l'idratazione) il pulsante non compariva — e sarebbe rimasto invisibile finché
 * non si fosse scorso di nuovo. La posizione di scorrimento è STATO ESTERNO, e si
 * legge con `useSyncExternalStore`: al primo render dice dov'è la pagina adesso
 * (`getSnapshot`), e da lì in poi basta l'ascoltatore. Niente `setState` in un
 * effetto, niente cascata, e il difetto non c'è più.
 *
 * Dettagli che sembrano dettagli e non lo sono:
 *  · **`prefers-reduced-motion`**: lo scorrimento «morbido» muove tutta la pagina
 *    — per chi ha chiesto di ridurre le animazioni si salta direttamente in cima;
 *  · **la distanza dal fondo** viene da `--nav-edge` (M8): altezza della barra più
 *    area sicura, altrimenti su iPhone il pulsante finirebbe sotto l'isola della
 *    barra e su Android sotto la barra gesti — e con la rail di M12f, dove la
 *    barra non è più in basso, è la sola area sicura;
 *  · **la distanza dal lato** viene da `--nav-start` (M12f): sotto la rail la
 *    pagina comincia 80dp più a destra, e un comando appoggiato al bordo dello
 *    schermo finirebbe sopra la colonna;
 *  · **`data-gl`**: risponde alla pressione con la deformazione degli altri
 *    controlli (M9) — è un controllo, non un'icona decorativa.
 */
function iscrivi(callback: () => void) {
  window.addEventListener('scroll', callback, { passive: true })
  return () => window.removeEventListener('scroll', callback)
}

export function TornaSu({ soglia = 600 }: { soglia?: number }) {
  const visibile = useSyncExternalStore(
    iscrivi,
    () => window.scrollY > soglia,
    () => false,
  )

  if (!visibile) return null

  return (
    <button
      type="button"
      data-gl
      aria-label="Torna all'inizio della pagina"
      onClick={() => {
        const riduciMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top: 0, behavior: riduciMovimento ? 'auto' : 'smooth' })
      }}
      // A SINISTRA, e non a destra come verrebbe naturale: in basso a destra
      // l'app ha già il suo controllo flottante (la campanella delle notifiche,
      // il FAB delle azioni di sala — lo stesso posto, `--fab-offset`). Due cerchi
      // impilati sono due cerchi che si coprono: la prima versione finiva
      // ESATTAMENTE sotto la campanella, e la prova del tocco l'ha detto.
      className="torna-su fixed z-40 flex h-11 w-11 items-center justify-center rounded-full border"
      style={{ left: 'calc(var(--nav-start) + 12px)', bottom: 'calc(var(--nav-edge) + 12px)' }}
    >
      <ArrowUp size={18} aria-hidden />
    </button>
  )
}
