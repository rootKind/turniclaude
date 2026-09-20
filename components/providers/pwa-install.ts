'use client'

import { useSyncExternalStore } from 'react'

/**
 * INSTALLAZIONE NATIVA (M5b del design system).
 *
 * Android/Chrome espone `beforeinstallprompt`: intercettandolo possiamo
 * disegnare il nostro pulsante «Installa» invece della mini-infobar di Chrome,
 * che arriva quando vuole e copre il contenuto. `prompt()` apre il foglio di
 * sistema vero — la stessa UI del menu ⋮ — quindi l'utente segue il percorso
 * nativo, non i passaggi a mano.
 *
 * iOS/Safari NON ha l'evento (l'installazione passa solo da Condivisione →
 * «Aggiungi a schermata Home»): su quella piattaforma la pagina /installa
 * continua a mostrare le istruzioni, ed è il motivo per cui questo modulo non
 * finge un fallback.
 *
 * Lo stato vive a livello di modulo (l'evento arriva una volta per sessione,
 * prima ancora che qualcuno chieda l'hook) e `useSyncExternalStore` lo rende
 * reattivo senza context né effetti per componente.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let isInstalled = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  // Già installata? `display-mode: standalone` è la verifica che funziona su
  // entrambe le piattaforme (iOS inclusa) senza API proprietarie.
  if (window.matchMedia('(display-mode: standalone)').matches) {
    isInstalled = true
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    // preventDefault disarma la mini-infobar di Chrome: la proposta la facciamo
    // noi, nel punto giusto della pagina, con la nostra grafica.
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    isInstalled = true
    deferredPrompt = null
    emit()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable'

export function usePwaInstall() {
  const canInstall = useSyncExternalStore(
    subscribe,
    () => deferredPrompt !== null && !isInstalled,
    () => false,
  )
  const installed = useSyncExternalStore(subscribe, () => isInstalled, () => false)

  return {
    /** L'evento nativo è disponibile: possiamo proporre il foglio di sistema. */
    canInstall,
    /** L'app gira già standalone (o l'installazione è appena avvenuta). */
    isInstalled: installed,
    /** Apre il foglio di installazione di Android. No-op su iOS/desktop Safari. */
    install: async (): Promise<InstallOutcome> => {
      if (!deferredPrompt) return 'unavailable'
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      // L'evento è monouso: Chrome non lo rilancia finché non si ricarica la
      // pagina, quindi dopo il primo tentativo la UI torna alle istruzioni.
      deferredPrompt = null
      emit()
      return outcome
    },
  }
}
