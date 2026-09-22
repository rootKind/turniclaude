'use client'

import { useEffect, type RefObject } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { fotogrammiMolla, mollaPerRuolo } from '@/lib/motion'
import { usePlatform } from '@/components/providers/platform-provider'
import { NAV_DESTINATIONS } from '@/components/nav/nav-destinations'
import { navigaConTransizione } from '@/components/providers/transizioni-pagina'

/**
 * IL GESTO DI RITORNO DAL BORDO — M8b del piano (23/09/2026).
 *
 * È il gesto che su iPhone si fa senza pensarci: si parte dal bordo sinistro e si
 * trascina verso destra. **In una PWA standalone non esiste** — WebKit lo dà alle
 * app native e a Safari, non alla pagina che gira a tutto schermo — quindi finora
 * l'unico modo di tornare indietro era il pulsante dentro la pagina. Questa è la
 * ragione per cui il gesto entra nel chrome di M8b e non fra le rifiniture.
 *
 * TRE DECISIONI, E NESS UNA È ESTETICA:
 *
 *  1. **Solo da iOS.** Su Android quel gesto è del SISTEMA (ed è già predittivo:
 *     l'anteprima la disegna Chrome con la View Transition che M8b ha acceso).
 *     Aggiungerne uno nostro sarebbe un secondo gesto sopra il primo.
 *  2. **Alle cinque destinazioni NON si torna indietro.** Lì dietro non c'è una
 *     pagina dell'app ma la cronologia di prima, e un gesto che porta fuori
 *     dall'app è il difetto peggiore che un gesto possa fare. Si guarda dove si è
 *     (`NAV_DESTINATIONS`), non quanta cronologia esiste: è la stessa verità che
 *     l'utente vede nella barra in basso.
 *  3. **Il dito comanda, la molla conclude.** Il trascinamento scrive il
 *     `transform` direttamente (niente stato React per fotogramma) e al rilascio
 *     decide la molla: la stessa `pop` della piattaforma, integrata da
 *     `lib/motion.ts` — la fisica di M8, applicata a un gesto di sistema invece
 *     che a un foglio.
 *
 * LA DIREZIONE SI CHIUDE ALL'INIZIO, NON A METÀ: il gesto nasce solo nei primi 20px
 * dal bordo, e si impegna solo quando il movimento **orizzontale** supera quello
 * verticale. Senza quel blocco, scorrere una lista con il pollice appoggiato al
 * bordo sposterebbe la pagina invece di farla scorrere — che è il modo in cui un
 * gesto fatto male si fa odiare.
 *
 * E NON LITIGA CON CHI SCORRE DI LATO: se sotto il dito c'è un contenitore che
 * scorre in orizzontale (la tabella di confronto, il selettore dei mesi), il gesto
 * non parte. Lì il trascinamento è già di qualcun altro.
 */

/** I px dal bordo sinistro in cui il gesto ha inizio (HIG: ~20pt). */
const BORDO = 20
/** Oltre questa frazione della larghezza, al rilascio si torna indietro. */
const SOGLIA = 0.35
/** Oltre questa velocità (px/s) si torna indietro anche con un gesto corto. */
const VELOCITA = 400
/** Quanto movimento serve prima di prendere il gesto (e chiudere la direzione). */
const ATTIVAZIONE = 12

const DESTINAZIONI = new Set<string>(NAV_DESTINATIONS.map((d) => d.href))

/** C'è, sotto il dito, qualcosa che scorre di lato? (allora il gesto non è nostro) */
function dentroUnoScorrimentoOrizzontale(partenza: Element, confine: Element): boolean {
  let nodo: Element | null = partenza
  while (nodo && nodo !== confine) {
    const stile = getComputedStyle(nodo)
    if ((stile.overflowX === 'auto' || stile.overflowX === 'scroll') && nodo.scrollWidth > nodo.clientWidth + 1) {
      return true
    }
    nodo = nodo.parentElement
  }
  return false
}

export function useSwipeBack(rif: RefObject<HTMLDivElement | null>): void {
  const platform = usePlatform()
  const pathname = usePathname()
  const router = useRouter()
  const molla = mollaPerRuolo('pop', platform === 'android' ? 'android' : 'ios')

  useEffect(() => {
    if (platform !== 'ios') return
    if (DESTINAZIONI.has(pathname)) return

    const forseIlNodo = rif.current
    if (!forseIlNodo) return
    /* Rileggere il valore in una costante NON opzionale non è pignoleria: le
       funzioni qui sotto sono dichiarazioni, quindi "sollevate", e TypeScript non
       tiene per loro la restrizione di tipo del controllo qui sopra. */
    const nodo: HTMLDivElement = forseIlNodo
    const larghezza = window.innerWidth

    const gesto = {
      attivo: false,
      bloccato: false,
      id: -1,
      x0: 0,
      y0: 0,
      x: 0,
      t: 0,
      v: 0,
      spostamento: 0,
    }
    let animazione: Animation | null = null

    const riduciMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

    /** Il viaggio di ritorno: molla fuori dallo schermo e poi la navigazione vera. */
    const concludi = () => {
      const parti = () => {
        nodo.style.transform = ''
        nodo.removeAttribute('data-swipe')
        navigaConTransizione(() => router.back(), 'indietro')
      }
      if (riduciMovimento()) {
        parti()
        return
      }
      const traiettoria = fotogrammiMolla(molla, gesto.spostamento, Math.max(gesto.v, 0), { bersaglio: larghezza })
      animazione = nodo.animate(
        traiettoria.map((posizione) => ({ transform: `translate3d(${posizione}px, 0, 0)` })),
        { duration: ((traiettoria.length - 1) / 60) * 1000, easing: 'linear', fill: 'forwards' },
      )
      animazione.finished.then(parti, parti)
    }

    /** Il gesto non conclude: la pagina torna al suo posto con la sua molla. */
    const torna = () => {
      const parti = () => {
        nodo.style.transform = ''
        nodo.removeAttribute('data-swipe')
      }
      if (riduciMovimento() || gesto.spostamento === 0) {
        parti()
        return
      }
      const traiettoria = fotogrammiMolla(molla, gesto.spostamento, gesto.v)
      animazione = nodo.animate(
        traiettoria.map((posizione) => ({ transform: `translate3d(${posizione}px, 0, 0)` })),
        { duration: ((traiettoria.length - 1) / 60) * 1000, easing: 'linear', fill: 'forwards' },
      )
      animazione.finished.then(parti, parti)
    }

    const suMovimento = (evento: PointerEvent) => {
      if (!gesto.attivo || evento.pointerId !== gesto.id) return
      const dx = evento.clientX - gesto.x0
      const dy = evento.clientY - gesto.y0

      if (!gesto.bloccato) {
        // La direzione si chiude qui: il verticale vince, il gesto non è nostro.
        if (Math.abs(dy) > Math.abs(dx) + 6 && dx < ATTIVAZIONE) {
          fine(true)
          return
        }
        if (dx < ATTIVAZIONE || dx <= Math.abs(dy)) return
        gesto.bloccato = true
        // Il dito prende il comando: via le animazioni in corso e la transizione
        // CSS, come per la maniglia dei fogli (M8).
        animazione?.cancel()
        animazione = null
        nodo.getAnimations().forEach((inCorso) => inCorso.cancel())
        nodo.style.transition = 'none'
        nodo.setAttribute('data-swipe', '')
      }

      // Oltre il bordo destro il dito tira a vuoto (resistenza): la pagina non
      // segue il dito fuori dallo schermo, e si capisce che il gesto è finito lì.
      gesto.spostamento = dx <= larghezza ? dx : larghezza + (dx - larghezza) * 0.15
      const dt = Math.max(evento.timeStamp - gesto.t, 1)
      gesto.v = (gesto.v * 0.7 + ((evento.clientX - gesto.x) / dt) * 1000 * 0.3) || 0
      gesto.x = evento.clientX
      gesto.t = evento.timeStamp
      nodo.style.transform = `translate3d(${gesto.spostamento}px, 0, 0)`
    }

    /**
     * La fine del gesto. `annullato` è il caso in cui il sistema ha preso il
     * puntatore (o il dito è uscito dal monitor): lì NON si naviga — un gesto che
     * il sistema ha interrotto non è un gesto che l'utente ha finito, ed è la
     * stessa regola della maniglia dei fogli in M8.
     */
    function fine(annullato = false) {
      window.removeEventListener('pointermove', suMovimento)
      window.removeEventListener('pointerup', suRilascio)
      window.removeEventListener('pointercancel', suAnnullamento)
      const avevaIlGesto = gesto.bloccato
      gesto.attivo = false
      gesto.bloccato = false
      if (!avevaIlGesto) return
      nodo.style.transition = ''
      const chiude =
        !annullato && (gesto.spostamento > larghezza * SOGLIA || gesto.v > VELOCITA)
      if (chiude) concludi()
      else torna()
    }

    function suRilascio(evento: PointerEvent) {
      if (evento.pointerId !== gesto.id) return
      fine()
    }

    function suAnnullamento(evento: PointerEvent) {
      if (evento.pointerId !== gesto.id) return
      fine(true)
    }

    const suPartenza = (evento: PointerEvent) => {
      if (evento.pointerType === 'mouse' && evento.button !== 0) return
      if (evento.clientX > BORDO) return
      // Un overlay aperto è un mondo a parte: lì il gesto indietro ha già il suo
      // contratto (M8, `use-back-to-close`), e la pagina sotto non si muove.
      if (document.querySelector('[role="dialog"]')) return
      const partenza = evento.target as Element | null
      if (!partenza || partenza.closest('[data-senza-swipe-back]')) return
      if (dentroUnoScorrimentoOrizzontale(partenza, nodo)) return
      if (animazione) return

      gesto.attivo = true
      gesto.bloccato = false
      gesto.id = evento.pointerId
      gesto.x0 = evento.clientX
      gesto.y0 = evento.clientY
      gesto.x = evento.clientX
      gesto.t = evento.timeStamp
      gesto.v = 0
      gesto.spostamento = 0

      window.addEventListener('pointermove', suMovimento)
      window.addEventListener('pointerup', suRilascio)
      window.addEventListener('pointercancel', suAnnullamento)
    }

    window.addEventListener('pointerdown', suPartenza)
    return () => {
      window.removeEventListener('pointerdown', suPartenza)
      window.removeEventListener('pointermove', suMovimento)
      window.removeEventListener('pointerup', suRilascio)
      window.removeEventListener('pointercancel', suAnnullamento)
      animazione?.cancel()
      nodo.style.transform = ''
      nodo.style.transition = ''
      nodo.removeAttribute('data-swipe')
    }
  }, [platform, pathname, router, rif, molla])
}
