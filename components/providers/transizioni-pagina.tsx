'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { flushSync } from 'react-dom'
import { usaWebKit } from '@/lib/platform'

/**
 * LA TRANSIZIONE FRA PAGINE LA DISEGNA IL BROWSER — M8b del piano (23/09/2026).
 *
 * Cosa c'era prima: `.pagina-arrivo`, una `@keyframes` scritta a mano che faceva
 * entrare la pagina nuova (dal 7px, con la molla della piattaforma). Era già un
 * passo avanti rispetto a framer-motion, ma restava **una cosa nostra**: due
 * schermate che si scambiano il posto senza che il browser sappia niente.
 *
 * Da qui in poi la scena la prende la **View Transition** della piattaforma: il
 * browser fotografia la pagina che esce, monta quella che entra e interpola lui.
 * Non è teoria — è l'unico modo di ottenere due cose che a mano non esistono:
 *
 *  1. **Il predictive back su Chrome Android.** Il gesto indietro di sistema
 *     disegna l'anteprima della pagina precedente usANDO la transizione definita
 *     per quel viaggio: senza una View Transition da usare, il gesto resta un
 *     salto secco. È la voce 3 di M8 che il piano chiamava per nome.
 *  2. **Una transizione sola per tutto.** Le due skin non si scrivono l'animazione:
 *     la scelgono (`--motion-duration-*` + molle), e la composizione la fa la
 *     piattaforma — quindi non c'è nessuna `@keyframes` da tenere allineata.
 *
 * PERCHÉ UN INTERCETTATORE DI CLIC, E NON IL FLAG DI NEXT. `next.config.ts` accende
 * `experimental.viewTransition`, che è il pezzo lato server (il payload RSC dentro
 * la transizione). Ma **il router non avvolge da solo le navigazioni**: misurato
 * con una sonda che conta le chiamate a `document.startViewTransition`, una
 * navigazione client (clic su una voce della barra) ne fa **zero**. Quindi la
 * transizione si avvolge dove la navigazione nasce: sul clic.
 *
 * Il clic si prende in fase di CATTURA, sul documento, per due ragioni: vale per
 * ogni `<Link>` dell'app senza doverne toccare uno, e arriva prima del gestore di
 * Next — che quindi va fermato (`preventDefault` + `stopPropagation`) perché non
 * parta una seconda navigazione senza transizione. Da lì si chiama lo stesso
 * router (`router.push`), che è esattamente quello che avrebbe fatto `<Link>`
 * (il prefetch di `<Link>` continua a lavorare: lo fa al passaggio del mouse e
 * alla comparsa, non al clic).
 *
 * COSA NON COPRE, DICHIARATO: le navigazioni **programmatiche** (`router.push`
 * dentro un gestore, senza clic). Per quelle c'è `navigaConTransizione`, da usare
 * al posto di `router.push` dove la transizione conta; senza, la pagina cambia
 * senza animazione — che è meglio di un'animazione che parte a metà.
 */

/**
 * SI PUÒ USARE LA VIEW TRANSITION? Due condizioni, e la seconda è una misura.
 *
 * 1. L'API deve esserci (Chromium 111+, Safari 18.2+).
 * 2. **Il motore non deve essere WebKit.** Nominare la pagina (`view-transition-name`)
 *    e fotografarla fa **crashare** WebKit quando dentro c'è un discendente
 *    `position: fixed` — la testata di M8b, i pannelli della board, il selettore
 *    del giorno. Non è un'ipotesi: misurato, e con `view-transition-name: none`
 *    la stessa navigazione passa. Su WebKit resta quindi la molla di M8.
 *    Il costo è dichiarato: su iPhone le transizioni fra pagine sono le nostre,
 *    non quelle del motore. Il **predictive back** però vive su Chrome Android,
 *    che è Chromium — cioè esattamente dove la View Transition serve.
 */
export function supportaViewTransition(): boolean {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') return false
  return !usaWebKit(navigator.userAgent)
}

/**
 * Il verso del viaggio, scritto sul `<html>` PRIMA della transizione: il CSS lo
 * legge per far entrare la pagina da destra (avanti) o da sinistra (indietro),
 * che è la convenzione delle due piattaforme. Senza, tutti i viaggi si
 * assomiglierebbero e tornare indietro sembrerebbe andare avanti.
 */
export type VersoNavigazione = 'avanti' | 'indietro'

/** Porta a termine una navigazione dentro una View Transition. */
export function navigaConTransizione(
  spingi: () => void,
  verso: VersoNavigazione = 'avanti',
): void {
  if (!supportaViewTransition()) {
    spingi()
    return
  }
  const radice = document.documentElement
  radice.dataset.nav = verso
  /* `data-vt` dice al foglio di stile che questa navigazione la disegna il
     browser: la molla di M8 (`.pagina`) deve tacere, altrimenti la pagina
     arriverebbe due volte — una per la transizione e una per l'animazione. */
  radice.dataset.vt = '1'
  const transizione = document.startViewTransition(() => {
    // `flushSync` non è un dettaglio: dentro la transizione l'aggiornamento deve
    // essere COMMESSO prima che il browser fotografi la pagina nuova. Con un
    // aggiornamento asincrono la fotografia arriverebbe prima del render, e la
    // transizione animerebbe due volte la stessa pagina.
    flushSync(spingi)
  })
  transizione.finished.finally(() => {
    delete radice.dataset.nav
    delete radice.dataset.vt
  })
}

export function TransizioniPagina() {
  const router = useRouter()

  useEffect(() => {
    const alClic = (evento: MouseEvent) => {
      if (evento.defaultPrevented || evento.button !== 0) return
      if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return
      if (!supportaViewTransition()) return

      const ancora = (evento.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!ancora) return
      if (ancora.target && ancora.target !== '_self') return
      if (ancora.hasAttribute('download')) return
      if (ancora.dataset.senzaTransizione !== undefined) return

      const destinazione = new URL(ancora.href, window.location.href)
      if (destinazione.origin !== window.location.origin) return
      // Stessa pagina (es. i mesi della board, `?m=…`): una transizione qui
      // animerebbe il chrome sopra un contenuto che si sta già aggiornando da sé.
      if (
        destinazione.pathname === window.location.pathname &&
        destinazione.search === window.location.search
      ) {
        return
      }

      // La navigazione la fa il router, dentro la transizione: a `<Link>` restano
      // il prefetch e le sue regole (modificatori, `replace` dichiarato…), ma il
      // viaggio vero passa di qui.
      evento.preventDefault()
      evento.stopPropagation()
      navigaConTransizione(() => router.push(destinazione.pathname + destinazione.search + destinazione.hash))
    }

    document.addEventListener('click', alClic, true)
    return () => document.removeEventListener('click', alClic, true)
  }, [router])

  return null
}
