import { cn } from '@/lib/utils'

/**
 * IL SEGNO DI CARICAMENTO A SETTE FORME — M9 del piano (23/09/2026).
 *
 * Material 3 Expressive non gira un cerchio: la forma **cambia mentre gira**, in
 * un ciclo continuo di sette forme. È il pezzo di M3E che si riconosce a colpo
 * d'occhio, ed è l'unico che si può fare *quasi* per intero sul web: le sette
 * forme sono poligoni da **otto vertici** che si interpolano (un `clip-path` con
 * un numero di punti diverso non si interpola: il browser salta, e si vede), e il
 * passaggio è a scatti invece che continuo. La curva vera la decide il sistema,
 * come per l'isola di M8 e per il titolo che si riduce di M8b: qui si dichiara
 * l'approssimazione invece di fingerla.
 *
 * DOVE È SPENTO: fuori da Android la forma resta un quadrato arrotondato che gira
 * (misura, giro e tinta vengono dai token `--load-shape-*`, che divergono per
 * skin). Il vocabolario espressivo è di Material; la HIG non ha un segno di
 * attesa a forme, e inventarlo per iOS sarebbe stato un secondo linguaggio.
 *
 * PERCHÉ `role="status"`: un segno che gira non dice niente a chi non lo vede, e
 * la pagina che lo mostra sta ASPETTANDO — è esattamente l'informazione che il
 * ruolo `status` annuncia (senza rubare il fuoco, che è ciò che lo distingue da
 * `alert`). L'etichetta visibile è `aria-hidden` perché la leggerebbe una seconda
 * volta: l'annuncio è dell'involucro.
 *
 * NON è `aria-busy` sul contenitore che attende: quello è un altro patto (M12),
 * e va messo dove si sa cosa si sta aspettando.
 */
export function LoadingShape({
  /** L'etichetta visibile accanto al segno (facoltativa: il segno da solo va
   *  bene quando il contesto lo dice già — per esempio dentro una card che si
   *  sta caricando). */
  etichetta,
  className,
}: {
  etichetta?: string
  className?: string
}) {
  return (
    <span
      role="status"
      aria-label={etichetta ?? 'Caricamento in corso'}
      className={cn('inline-flex items-center gap-2', className)}
    >
      <span data-slot="load-shape" aria-hidden />
      {etichetta && (
        <span aria-hidden className="text-footnote text-muted-foreground">
          {etichetta}
        </span>
      )}
    </span>
  )
}
