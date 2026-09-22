'use client'

import { useEffect, type RefObject } from 'react'

/**
 * LO STATO «LA PAGINA SI È MOSSA» (M8, 22/09/2026 · estratto in M8b, 23/09/2026).
 *
 * Serve a due cose che non possono saperlo da sole: la barra di navigazione (che
 * si alza quando il contenuto le scorre sotto) e la testata di pagina (la cui
 * barra compatta entra quando il titolo grande se n'è andato). Sono due elementi
 * diversi, con due vite diverse, ma **la stessa verità**: la pagina è scorsa.
 *
 * Perché un attributo scritto nel DOM e non uno `useState`: questo è un
 * ascoltatore di scorrimento, e ridisegnare React (con la barra e le sue voci, o
 * la testata e il suo titolo) a ogni evento sarebbe pagare un render per una riga
 * di CSS. È lo stesso meccanismo del provider di piattaforma, ed è anche più
 * onesto: il CSS legge la stessa verità che legge l'utente.
 *
 * La soglia di default (4px) non è un pixel preciso: è «la pagina si è mossa»,
 * cioè esattamente quando lo scorrimento è percettibile.
 *
 * L'attributo è `data-scrolled`, senza valore: le regole possono leggere
 * `[data-scrolled]` senza confrontare stringhe.
 */
export function useScrolledAttr(
  rif: RefObject<HTMLElement | null>,
  soglia = 4,
): void {
  useEffect(() => {
    const nodo = rif.current
    if (!nodo) return
    const leggi = () => {
      if (window.scrollY > soglia) nodo.setAttribute('data-scrolled', '')
      else nodo.removeAttribute('data-scrolled')
    }
    leggi()
    window.addEventListener('scroll', leggi, { passive: true })
    return () => window.removeEventListener('scroll', leggi)
  }, [rif, soglia])
}
