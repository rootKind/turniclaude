import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"
import { haptics } from "@/lib/haptics"

const buttonVariants = cva(
  // `touch-expand` (M6): su iOS l'area di tocco si allarga a 44pt SENZA cambiare il
  // disegno (la HIG chiede l'area, non la taglia) — la regola sta in globals.css e
  // vale solo sotto `[data-platform='ios']`. Su Android non ha effetto: lì il
  // ripple richiede `overflow: hidden` e la via è la taglia vera (M9).
  "touch-expand group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
        /* IL GRADINO GRANDE (M9). L'altezza vera la scrive `globals.css` dalla
           scala `--control-h-*` (su Android è 56, su iOS/desktop 44 come qui),
           perché la misura è una proprietà della PIATTAFORMA, non di questa
           pagina: qui resta la parte che non cambia — imbottitura, testo,
           icona. */
        xl: "h-11 gap-2 rounded-lg px-4 text-base has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * IL BOTTONE A DOPPIA SKIN (M4 del design system, 20/09/2026).
 *
 * Il JSX qui NON cambia per piattaforma: la skin la scrivono i token e le regole
 * in `globals.css` (blocco M4), che mirano a `[data-slot='button']` — attributo
 * che prima MANCAVA (i componenti Base UI non lo scrivono da soli: era la ragione
 * per cui niente poteva mirare a «tutti i bottoni»).
 *
 *  - **Android**: al passaggio e alla pressione una VELATURA del colore del
 *    contenuto (state layer, 8%/12%) e la pressione INCRESPA dal punto del dito:
 *    qui si scrivono `--ripple-x/y` al pointerdown, perché un ripple che nasce
 *    sempre al centro è la versione povera del gesto. M3 non abbassa il
 *    controllo: la regola non in layer `transform: none` batte la utility
 *    `active:translate-y-px` (convenzione web che su Material è un difetto).
 *  - **iOS**: il controllo non si muove e non si vela — sotto il dito il suo
 *    CONTENUTO si spegne un po' (la regola `opacity` su `:active`).
 *  - **Desktop**: i token sono trasparenti e nessuna regola lo mira: com'era.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  onPointerDown,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  // Le coordinate del ripple, nel sistema LOCALE del bottone: sono ciò che
  // distingue «l'onda parte da dove ho toccato» da un cerchio al centro.
  const doveHoToccato = (e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty("--ripple-x", `${e.clientX - r.left}px`)
    el.style.setProperty("--ripple-y", `${e.clientY - r.top}px`)
  }

  return (
    <ButtonPrimitive
      data-slot="button"
      /* Il GRADINO della scala, scritto sul DOM: è ciò che lega il componente
         alle regole `[data-slot='button'][data-size='…']` di `globals.css`,
         dove l'altezza diventa un token di piattaforma (M9). Senza questo
         attributo la scala resterebbe una convenzione fra classi Tailwind. */
      data-size={size ?? 'default'}
      className={cn(buttonVariants({ variant, size, className }))}
      onPointerDown={(e) => {
        doveHoToccato(e)
        haptics.tap()
        onPointerDown?.(e)
      }}
      {...props}
    />
  )
}

export { Button, buttonVariants }
