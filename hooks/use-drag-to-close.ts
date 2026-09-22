'use client'

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { fotogrammiMolla, mollaPerRuolo } from '@/lib/motion'
import { usePlatform } from '@/components/providers/platform-provider'

/**
 * IL FOGLIO SI CHIUDE TRASCINANDOLO (M8 del piano, 22/09/2026).
 *
 * Lo chiedono **entrambe** le guide: l'action sheet di iOS si trascina verso il
 * basso, la bottom sheet di Material 3 pure. Fino a ieri la scriminatura era
 * disegnata e basta — un'affordance che non fa niente, che è peggio di non
 * disegnarla, perché insegna un gesto che non esiste.
 *
 * QUESTO È L'UNICO POSTO IN CUI LA MOLLA DEVE ESSERE **VIVA**. Nel foglio di
 * stile una molla è una `linear(...)`, cioè un tempo già deciso: va benissimo per
 * un pannello che si apre, non va bene per un gesto, dove il tempo lo decide il
 * dito e la molla deve rispondere mentre il dito si muove — e poi **ripartire
 * dalla velocità che il dito le lascia**. Quindi qui la fisica non è un token: è
 * `lib/motion.ts` integrata passo a passo (`fotogrammiMolla`), la stessa molla che
 * il foglio usa per arrivare. Il foglio che si trascina torna su con la molla con
 * cui è entrato, e non con una curva che gli somiglia.
 *
 * LE TRE DECISIONI CHE RENDONO IL GESTO CREDIBILE (e che si sbagliano sempre):
 *
 *  1. **Resistenza verso l'alto.** Il foglio non sale: chi lo tira in su trova
 *     una molla contraria (un quarto dello spostamento). Senza, il foglio
 *     seguirebbe il dito oltre il bordo e sembrerebbe staccato dalla pagina.
 *  2. **La velocità conta più della distanza.** Un colpo secco verso il basso
 *     chiude anche se il foglio si è mosso di poco: è così che si usa davvero un
 *     action sheet. Quindi si chiude se lo spostamento supera un quarto
 *     dell'altezza OPPURE se la velocità supera 600px/s.
 *  3. **Il dito non anima: comanda.** Durante il trascinamento il `transform` si
 *     scrive direttamente nell'elemento (niente stato React per fotogramma) e si
 *     legge nella riga dopo; l'animazione (Web Animations) parte solo al
 *     rilascio, da dove il dito ha lasciato il foglio e alla sua velocità.
 *
 * CHI HA CHIESTO MENO MOVIMENTO non ha un gesto che si muove e uno che no: qui la
 * molla sparisce — la chiusura è immediata e il ritorno è istantaneo. È la stessa
 * promessa di M7, applicata a un gesto invece che a una transizione.
 *
 * DOVE SI PRENDE: solo la scriminatura (la riga in cima, dichiarata nel CSS con
 * `touch-action: none`), non tutto il foglio. È una scelta di prudenza: agganciare
 * il trascinamento anche al corpo del foglio funziona solo se il contenitore è
 * già in cima, e un errore lì è un foglio che non scorre più. La riga è il posto
 * che le due guide indicano come maniglia, ed è quella che l'utente prova.
 */

/** Oltre questa frazione dell'altezza, al rilascio il foglio si chiude. */
const SOGLIA_ALTEZZA = 0.25
/** Oltre questa velocità (px/s) si chiude anche se il foglio si è mosso poco. */
const SOGLIA_VELOCITA = 600
/** Quanto il foglio accetta di salire: un quarto del movimento del dito. */
const RESISTENZA = 0.25

export interface TrascinamentoFoglio {
  /** Da spargere sulla superficie che si trascina (la scriminatura). */
  props: { onPointerDown: (evento: ReactPointerEvent) => void }
  /**
   * Il foglio da muovere. Lo ref CREA l'hook e non glielo passa il chiamante: il
   * gesto gli SCRIVE dentro (`style.transform`), e il compilatore di React vieta
   * di modificare quello che arriva da fuori — un ref proprio è invece la via di
   * fuga prevista. Per chi chiama cambia una riga: `<div ref={rif}>`.
   */
  rif: React.RefObject<HTMLDivElement | null>
}

export function useDragToClose({
  attivo,
  onClose,
}: {
  /** La superficie è un foglio trascinabile? (dialog centrati: no) */
  attivo: boolean
  onClose: () => void
}): TrascinamentoFoglio {
  const platform = usePlatform()
  const rif = useRef<HTMLDivElement>(null)

  // Il ciclo di vita del gesto sta in ref, non in stato: sono valori che cambiano
  // a ogni movimento del dito e non devono far ridisegnare React.
  const gesto = useRef<{ id: number; y0: number; t0: number; y: number; t: number; v: number } | null>(null)
  const animazione = useRef<Animation | null>(null)
  /**
   * L'ULTIMA `onClose`, letta al rilascio del dito. Il sincronismo sta in un
   * effetto e non nel corpo del componente perché scrivere un ref durante il
   * render è vietato dal lint di questo repo (il compilatore di React lo legge
   * come un effetto collaterale nel render) — e il gesto dura comunque più di un
   * render, quindi il valore che serve è sempre l'ultimo.
   */
  const chiudiRef = useRef(onClose)
  useEffect(() => {
    chiudiRef.current = onClose
  })

  /** La molla del ruolo `pop` della piattaforma: la stessa che fa entrare il foglio. */
  const molla = mollaPerRuolo('pop', platform === 'android' ? 'android' : 'ios')

  useEffect(() => () => animazione.current?.cancel(), [])

  function riduciMovimento(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  /**
   * Suona la molla sull'elemento, da `da` (px, positivo = verso il basso).
   *
   * `bersaglio` è dove finisce: 0 per il ritorno al suo posto, l'altezza del
   * foglio per l'uscita — perché quando si chiude il foglio non deve tornare su,
   * deve finire fuori dallo schermo, e con la stessa molla.
   */
  function suona(da: number, velocita: number, aFine?: () => void, bersaglio = 0) {
    const nodo = rif.current
    if (!nodo) return
    const traiettoria = fotogrammiMolla(molla, da, velocita, { bersaglio })
    const durata = ((traiettoria.length - 1) / 60) * 1000
    animazione.current?.cancel()
    animazione.current = nodo.animate(
      traiettoria.map((posizione) => ({ transform: `translate3d(0, ${posizione}px, 0)` })),
      { duration: durata, easing: 'linear', fill: 'forwards' },
    )
    animazione.current.addEventListener('finish', () => {
      // Finita l'animazione l'elemento torna a farsi disegnare dal CSS: se il
      // `fill: forwards` restasse attaccato, il foglio non potrebbe più aprirsi.
      animazione.current?.cancel()
      nodo.style.transform = ''
      aFine?.()
    })
  }

  function onPointerDown(evento: ReactPointerEvent) {
    if (!attivo) return
    // Un comando dentro la maniglia (la «Chiudi» del foglio) non è una maniglia.
    if ((evento.target as HTMLElement).closest('button, a, input, textarea, select')) return
    if (evento.pointerType === 'mouse' && evento.button !== 0) return

    gesto.current = {
      id: evento.pointerId,
      y0: evento.clientY,
      t0: performance.now(),
      y: evento.clientY,
      t: performance.now(),
      v: 0,
    }
    /*
     * LA CATTURA DEL PUNTATORE È UN'OTTIMIZZAZIONE, NON UN REQUISITO, e su WebKit
     * può lanciare: lì `setPointerCapture` su un puntatore sintetizzato da un
     * tocco non sempre è valido, e un errore qui interrompeva l'hook PRIMA di
     * agganciare i listener — quindi il foglio restava immobile e il rilascio non
     * decideva niente (misurato: nessun log di rilascio, foglio fermo a 0). Senza
     * cattura i movimenti arrivano lo stesso, perché li ascolta `window`: si perde
     * solo la garanzia che arrivino con il puntatore sopra l'elemento.
     */
    try {
      ;(evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId)
    } catch {
      // Niente cattura: i listener su `window` bastano (vedi sopra).
    }
    const nodo = rif.current
    if (nodo) {
      /*
       * CHI METTE IL DITO SUL FOGLIO PRENDE IL COMANDO, e non è un dettaglio:
       * il foglio entra con un'animazione CSS (M3: sale dal basso in 300ms), e
       * un'animazione CSS **vince** sullo stile in linea — quindi afferrando la
       * maniglia mentre il foglio sta ancora arrivando il `transform` scritto dal
       * dito verrebbe scavalcato, e il foglio continuerebbe la sua corsa da solo
       * sotto il pollice. Misurato: con l'animazione in corso, 240px di
       * trascinamento muovevano il foglio di 82px e il rilascio finiva nella
       * direzione sbagliata (tornava su invece di uscire). Si annullano le
       * animazioni in corso su questo elemento — l'entrata e anche il ritorno
       * della molla, se è ancora in volo.
       */
      nodo.getAnimations().forEach((inCorso) => inCorso.cancel())
      nodo.style.transition = 'none'
    }
    animazione.current = null

    const muovi = (e: PointerEvent) => {
      const g = gesto.current
      const nodo = rif.current
      if (!g || e.pointerId !== g.id || !nodo) return
      const grezzo = e.clientY - g.y0
      const spostamento = grezzo < 0 ? grezzo * RESISTENZA : grezzo
      // La velocità è una media mobile sul tratto appena percorso: l'ultima
      // lettura da sola è rumorosa (e su un dito fermo vale zero, che è giusto).
      const dt = Math.max(e.timeStamp - g.t, 1)
      g.v = (g.v * 0.7 + ((e.clientY - g.y) / dt) * 1000 * 0.3) || 0
      g.y = e.clientY
      g.t = e.timeStamp
      nodo.style.transform = `translate3d(0, ${spostamento}px, 0)`
    }

    const finisci = (e: PointerEvent) => {
      const g = gesto.current
      const nodo = rif.current
      gesto.current = null
      window.removeEventListener('pointermove', muovi)
      window.removeEventListener('pointerup', finisci)
      window.removeEventListener('pointercancel', finisci)
      if (!g || !nodo) return

      const grezzo = e.clientY - g.y0
      const spostamento = grezzo < 0 ? grezzo * RESISTENZA : grezzo
      const altezza = nodo.getBoundingClientRect().height || 1
      nodo.style.transition = ''
      // Un gesto ANNULLATO (il sistema ha preso il puntatore) non ha una velocità
      // da consegnare alla molla: il foglio deve solo tornare al suo posto.
      const velocitaFinale = e.type === 'pointercancel' ? 0 : g.v

      const chiude = spostamento > altezza * SOGLIA_ALTEZZA || velocitaFinale > SOGLIA_VELOCITA


      if (riduciMovimento()) {
        nodo.style.transform = ''
        if (chiude) chiudiRef.current()
        return
      }
      if (chiude) {
        // Esce dalla parte da cui è entrato, con la stessa molla: il bersaglio è
        // l'altezza del foglio, cioè tutto sotto il bordo dello schermo.
        suona(Math.max(spostamento, 0), Math.max(velocitaFinale, 0), () => chiudiRef.current(), altezza)
      } else {
        suona(spostamento, velocitaFinale)
      }
    }

    window.addEventListener('pointermove', muovi)
    window.addEventListener('pointerup', finisci)
    window.addEventListener('pointercancel', finisci)
  }

  return { props: { onPointerDown }, rif }
}
