'use client'
import type { PointerEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * LA CHIP FILTRO (M4 del design system, 20/09/2026).
 *
 * Le chip dei filtri (cambi turno, cambi ferie) erano cinque copie dello stesso
 * markup inline: `px-3 py-1.5 rounded-full text-[12px]` + condizionale
 * `chip-selected` / `bg-muted text-muted-foreground hover:bg-muted/80` +
 * variante col bordo tratteggiato. Cinque posti in cui correggere la stessa
 * cosa — ed è la ragione per cui la geometria ora sta in un componente e la
 * misura in token (`--chip-height`, `--chip-label` in `globals.css`, M4):
 *
 *  - **iOS**: pillola da 32pt, etichetta a 13 — la misura delle capsule di
 *    sistema;
 *  - **Android**: 32dp, etichetta a 14sp (label-large di M3) e contorno PIENO:
 *    il tratteggio è una cosa del web, non di Material;
 *  - **desktop**: i token danno 28px e 12px, cioè la geometria che veniva fuori
 *    da `py-1.5` — zero pixel.
 *
 * Lo stato selezionato resta la classe `.chip-selected` (i suoi colori hanno
 * override utente dal pannello colori: qui non si toccano), e il contatore
 * resta `.chip-count` — la spec `card-cambio-to-sala` li conosce.
 */
export function FilterChip({
  selected,
  children,
  count,
  icon,
  dashed,
  className,
  onPointerDown,
  ...props
}: React.ComponentProps<'button'> & {
  /** La chip accesa (`.chip-selected`). */
  selected?: boolean
  /** Il contatore del filtro, se c'è. */
  count?: number
  /** L'eventuale icona a sinistra dell'etichetta. */
  icon?: ReactNode
  /** Il contorno tratteggiato delle chip «azionabili» (Solo miei/compatibili). */
  dashed?: boolean
}) {
  // Come nel `<Button>` (M4): le coordinate del dito per l'increspatura di
  // Material — senza, l'onda partirebbe sempre dal centro.
  const doveHoToccato = (e: PointerEvent<HTMLButtonElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--ripple-x', `${e.clientX - r.left}px`)
    el.style.setProperty('--ripple-y', `${e.clientY - r.top}px`)
  }

  return (
    <button
      type="button"
      data-slot="chip"
      data-selected={selected || undefined}
      aria-pressed={selected}
      onPointerDown={(e) => {
        doveHoToccato(e)
        onPointerDown?.(e)
      }}
      className={cn(
        'touch-expand flex-shrink-0 flex items-center gap-1 transition-colors select-none',
        selected
          ? 'chip-selected'
          : cn(
              'bg-muted text-muted-foreground hover:bg-muted/80',
              dashed && 'border border-dashed border-muted-foreground/40',
            ),
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {count !== undefined && (
        <span className="chip-count" aria-hidden="true">
          {count}
        </span>
      )}
    </button>
  )
}
