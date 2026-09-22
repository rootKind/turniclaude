'use client'

import { useLayoutEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useSwipeBack } from '@/hooks/use-swipe-back'

/**
 * IL CONTENITORE DELLA PAGINA (M8, riscritto in M8b il 23/09/2026).
 *
 * Tre incarichi, e sono tre contratti:
 *
 *  1. **Ha un nome per la View Transition** (`view-transition-name: pagina`,
 *     scritto in `globals.css` — ma SOLO mentre la transizione corre: vedi il
 *     commento lì, è una riga che ha una misura dietro): è l'elemento che il
 *     browser fotografa prima e dopo la navigazione. Il chrome (barra in basso,
 *     testata, avvisi) sta FUORI, quindi non entra nella fotografia e non si
 *     muove.
 *  2. **Porta la molla di arrivo di M8 quando la transizione non c'è** — e non è
 *     un ripiego di seconda scelta: su WebKit la fotografia del motore fa
 *     crashare la pagina (vedi `usaWebKit`), e le navigazioni programmatiche non
 *     passano dall'intercettatore. La `key` sul percorso è ciò che fa rigiocare
 *     l'animazione: React ricrea l'elemento, e un elemento nuovo riparte da capo.
 *  3. **È la superficie che si trascina** con il gesto di ritorno dal bordo su
 *     iOS (`hooks/use-swipe-back.ts`): è esattamente quello che si sposta su un
 *     iPhone quando si tira dal bordo — il contenuto della schermata, non il
 *     resto dell'app.
 *
 * LA RIGA DEL `useLayoutEffect` È QUELLA CHE IMPEDISCE L'ARRIVO DOPPIO. Quando la
 * navigazione la disegna il browser, la molla di M8 deve tacere: `data-arrivo="no"`
 * lo dice al foglio di stile. Deve succedere **prima del primo disegno**
 * (`useLayoutEffect`, non `useEffect`), altrimenti un fotogramma di molla
 * uscirebbe sopra la transizione; e deve restare scritto sull'ELEMENTO e non su
 * un flag globale, perché un flag globale cancellato alla fine della transizione
 * farebbe ripartire l'animazione proprio allora — cioè a cose fatte.
 *
 * `data-slot="pagina"` NON è un dettaglio da test: è l'aggancio del nome della
 * View Transition e della regola del gesto (`[data-slot='pagina'][data-swipe]`),
 * e le spec lo usano per misurare la pagina. Un attributo, tre consumatori.
 */
export function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const pagina = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  useSwipeBack(pagina)

  useLayoutEffect(() => {
    const nodo = pagina.current
    if (!nodo) return
    if (document.documentElement.dataset.vt) nodo.setAttribute('data-arrivo', 'no')
    else nodo.removeAttribute('data-arrivo')
  }, [pathname])

  return (
    <div key={pathname} ref={pagina} data-slot="pagina" className="pagina">
      {children}
    </div>
  )
}
