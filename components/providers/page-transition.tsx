'use client'
import { usePathname } from 'next/navigation'

/**
 * L'ARRIVO DI UNA PAGINA (M8 del piano, 22/09/2026).
 *
 * Prima erano tre numeri scritti nel JSX di framer-motion: `duration: 0.2`,
 * `ease: 'easeOut'`, `y: 7`. Tre scelte del web che nessuna delle due skin
 * conosceva, e una promessa di accessibilità non mantenuta — `prefers-reduced-
 * motion` non spegneva niente, perché framer anima comunque.
 *
 * Ora la classe `.pagina-arrivo` (in `app/globals.css`) prende durata e curva dai
 * token delle molle, quindi il passo è quello della piattaforma, e con «riduci
 * movimento» l'animazione non parte affatto. La `key` sul percorso resta: è ciò
 * che fa RIGIOCARE l'animazione a ogni navigazione (React rimonta l'elemento),
 * senza che il componente debba sapere niente di animazioni.
 *
 * Il `div` resta un `div`: nessuna libreria, nessun `transform` permanente, e il
 * layout è quello di prima.
 */
export function PageTransitionWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="pagina-arrivo">
      {children}
    </div>
  )
}
