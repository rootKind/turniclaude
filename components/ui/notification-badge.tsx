/**
 * Badge contatore notifiche (nav, campanella, pannello admin).
 *
 * Dalla richiesta del 17/09/2026: stile del tasto «Esci» (riempimento rosso
 * traslucido + bordo destructive/40, commit f5c0f00) MA il traslucido fa
 * trasparire le linee dell'icona sotto il badge. Soluzione: DUE strati —
 * uno sfondo opaco del colore della superficie sottostante («taglio») con la
 * STESSA forma arrotondata del badge, e sopra il badge vero e proprio, visivamente
 * identico a prima. Lo strato opaco non si vede dove non c'è sovrapposizione.
 *
 * `surface` = colore della superficie su cui il badge poggia: «background»
 * (barra nav, campanella) o «card» (pannello admin).
 */
export function NotificationBadge({
  count,
  surface = 'background',
  className,
}: {
  count: number
  surface?: 'background' | 'card'
  className?: string
}) {
  return (
    <span className={`inline-flex rounded-full ${surface === 'card' ? 'bg-card' : 'bg-background'} ${className ?? ''}`}>
      <span className="min-w-[16px] h-4 px-1 text-[10px] font-bold rounded-full border border-destructive/40 bg-destructive/10 dark:bg-destructive/20 text-destructive flex items-center justify-center">
        {count > 99 ? '99+' : count}
      </span>
    </span>
  )
}
