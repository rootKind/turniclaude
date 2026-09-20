'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * L'ULTIMA PAGINA DI UN GRUPPO (estratto da `bottom-nav.tsx` in M2, 20/09/2026).
 *
 * «Turni» è una destinazione sola con due viste (`/turnisala` e `/turniferie`):
 * perché non riporti sempre alla stessa, la barra ricorda l'ultima guardata. Lo
 * fa in localStorage — la scelta vale anche dopo un riavvio dell'app — e lo
 * legge via `useSyncExternalStore` con uno snapshot PRIMITIVO (una stringa,
 * confrontata per valore): è lo stesso schema di prima, e serve a evitare sia il
 * loop «getSnapshot should be cached» sia il `setState` dentro un effect, che il
 * lint di questo repo vieta.
 *
 * La scrittura emette un evento. Non è un dettaglio: senza, la voce di barra
 * resterebbe puntata alla pagina precedente finché la pagina non si rimonta, e
 * il tap successivo porterebbe nel posto sbagliato (un difetto che si vede solo
 * tornando indietro).
 */
const NAV_LAST_EVENT = 'nav-lastpage'

export const TURNI_LAST_PAGE_KEY = 'turni-last-page'

function subscribeNavLast(onChange: () => void) {
  window.addEventListener(NAV_LAST_EVENT, onChange)
  return () => window.removeEventListener(NAV_LAST_EVENT, onChange)
}

const readTurniLast = () => localStorage.getItem(TURNI_LAST_PAGE_KEY) ?? '/turnisala'

/** Dove porta la voce «Turni» adesso. */
export function useTurniLastPage(): string {
  return useSyncExternalStore(subscribeNavLast, readTurniLast, () => '/turnisala')
}

/**
 * Registra `pathname` come ultima pagina del gruppo. È un effect perché scrive
 * su un sistema esterno (localStorage + evento): non produce stato React, quindi
 * non c'è nulla da sincronizzare e nessun render in più.
 */
export function rememberGroupPage(pathname: string, groupPaths: readonly string[]) {
  if (!groupPaths.includes(pathname)) return
  localStorage.setItem(TURNI_LAST_PAGE_KEY, pathname)
  window.dispatchEvent(new Event(NAV_LAST_EVENT))
}

/** Da chiamare nel componente della barra: tiene aggiornata la memoria del gruppo. */
export function useRememberGroupPage(pathname: string, groupPaths: readonly string[]) {
  useEffect(() => {
    rememberGroupPage(pathname, groupPaths)
  }, [pathname, groupPaths])
}
