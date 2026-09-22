'use client'

import { useEffect, useRef } from 'react'

/**
 * IL BACK DI SISTEMA CHIUDE L'OVERLAY PIÙ IN ALTO (M8 del piano, 22/09/2026).
 *
 * Il difetto che questo file chiude è il più grave della metà Android del piano, e
 * non si vede da un iPhone: nell'app non c'era **nessun** `pushState` e nessun
 * `popstate`. Gli overlay sono puro stato React, quindi su Android — dove il gesto
 * indietro è un tasto di sistema che l'utente ha sempre sotto il pollice — con un
 * foglio aperto il gesto **usciva dalla pagina** invece di chiudere il foglio.
 *
 * LA STRADA OVVIA, E PERCHÉ NON È QUESTA. Il modo «classico» è: all'apertura una
 * voce di cronologia (`pushState`, stessa URL), alla chiusura la si toglie con
 * `history.back()`. Funziona per un overlay solo, e su un sito lo si fa così. Ma
 * questa app ha un **router** (Next) che ascolta `popstate`, e una voce scritta da
 * noi **non è una voce sua**: misurato con una sonda su `/admin`, quando il
 * `back()` la attraversa il router la riconosce come estranea e RIFA la rotta da
 * capo (`__NA` e `__PRIVATE_NEXTJS_INTERNALS_TREE` riscritti nella voce). Effetto
 * visibile: chiudendo col pulsante l'allarme aperto sopra il pannello «Debug
 * notifiche», il pannello sotto spariva — il router aveva rimontato la pagina e
 * con essa lo stato. Un overlay che chiude l'altro è peggio del difetto di
 * partenza. Da qui una regola che vale per tutto il file: **questo hook non chiama
 * mai `history.back()`**.
 *
 * LA STRADA GIUSTA: la **Navigation API** (`window.navigation`), che esiste in
 * Chromium e in WebKit e ha una cosa che `popstate` non ha — si può **annullare un
 * attraversamento PRIMA che avvenga**. Verificato su entrambi i motori: `navigate`
 * con `navigationType: 'traverse'` e `canIntercept: true`, `preventDefault()` →
 * l'URL non cambia, **nessun `popstate`**, e il router non sa nemmeno che è
 * successo. Il gesto si consuma chiudendo l'overlay, e il resto del mondo non se
 * ne accorge.
 *
 * IL PREFISSO CHE SBLOCCA IL GESTO, E IL SUO PREZZO DICHIARATO. Un attraversamento
 * da annullare deve esistere: in una PWA appena aperta (`currentEntry.index === 0`)
 * dietro non c'è NIENTE, quindi il tasto indietro non è una navigazione — è il
 * sistema che chiude l'app, e non c'è gesto da annullare. In quel caso si scrive
 * UNA voce di scorta (stessa URL) al primo overlay che si apre, e **non la si
 * toglie più**: toglierla vorrebbe dire chiamare `history.back()`, cioè risvegliare
 * il router (vedi sopra). Il prezzo è dichiarato ed è di una pressione: quando non
 * c'è nessun overlay aperto, il primo «indietro» attraversa la scorta — stessa
 * URL, quindi l'utente non vede cambiare niente — e il secondo naviga davvero.
 * Un gesto sprecato una volta per sessione, contro una pagina che si rimonta da
 * sola a ogni chiusura: questa è la parte che si poteva solo misurare.
 *
 * COSA NON FA, E VA DETTO: senza Navigation API il gesto resta del browser e
 * l'overlay non si chiude. L'alternativa era riscrivere la cronologia e far rifare
 * le rotte al router, cioè il difetto qui sopra. Il piano lo dichiara fra le cose
 * che il web non può fare dappertutto.
 */

/** La chiave con cui riconosciamo la voce di scorta. */
const CHIAVE_VOCE = '__turniOverlay'

/**
 * Il minimo della Navigation API che serve qui, scritto a mano: il DOM di
 * TypeScript non la conosce ancora, e prendere i tipi da una libreria esterna per
 * tre proprietà sarebbe un pacchetto in più per niente.
 */
interface EventoDiNavigazione extends Event {
  readonly navigationType: string
  readonly canIntercept: boolean
}

interface Navigazione {
  readonly currentEntry: { index: number } | null
  addEventListener: (tipo: 'navigate', ascolta: (evento: EventoDiNavigazione) => void) => void
}

function navigazione(): Navigazione | null {
  const nav = (window as unknown as { navigation?: Navigazione }).navigation
  return nav && typeof nav.addEventListener === 'function' ? nav : null
}

interface Voce {
  /** Chiudi: riceve l'evento del gesto, così chi chiude sa PERCHÉ si sta chiudendo. */
  chiudi: (evento: Event) => void
}

/** Le voci in ordine di apertura: l'ULTIMA è l'overlay più in alto. */
const pila: Voce[] = []
/** La voce di scorta è viva? (una sola per sessione, vedi l'intestazione) */
let scortaScritta = false
let ascolto = false

function assicuraAscolto() {
  if (ascolto) return
  ascolto = true
  navigazione()?.addEventListener('navigate', (evento) => {
    // Solo il gesto (avanti/indietro): una navigazione del router (`push` o
    // `replace`) non ci riguarda. E solo se si può annullare: un attraversamento
    // fra documenti diversi non è annullabile, e lì il gesto resta del browser.
    if (evento.navigationType !== 'traverse' || !evento.canIntercept) return
    const voce = pila.at(-1)
    if (!voce) return
    // L'attraversamento NON avviene: l'URL resta, la cronologia resta, il router
    // resta a guardare. È tutto il vantaggio di questa API.
    evento.preventDefault()
    voce.chiudi(evento)
  })
}

/**
 * Registra un overlay aperto. `abilitato` è la piattaforma: sul desktop il
 * pulsante indietro del browser è visibile e ha il suo significato — la
 * cronologia — e riscriverlo per chiudere un popup sarebbe un sequestro.
 */
export function useBackToClose(attivo: boolean, chiudi: (evento: Event) => void, abilitato = true) {
  /** L'ultima `chiudi`, sincronizzata in un effetto (il lint vieta di scrivere sui
   *  ref durante il render). */
  const chiudiRef = useRef(chiudi)
  useEffect(() => {
    chiudiRef.current = chiudi
  })

  useEffect(() => {
    if (!attivo || !abilitato) return
    const nav = navigazione()
    if (!nav) return

    assicuraAscolto()
    const voce: Voce = { chiudi: (evento) => chiudiRef.current(evento) }
    pila.push(voce)

    // La scorta: solo se non c'è niente da attraversare, e solo una volta.
    if (nav.currentEntry?.index === 0 && !scortaScritta) {
      scortaScritta = true
      history.pushState({ ...history.state, [CHIAVE_VOCE]: true }, '')
    }

    return () => {
      const indice = pila.indexOf(voce)
      if (indice >= 0) pila.splice(indice, 1)
    }
  }, [attivo, abilitato])
}
