"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

/**
 * LO SWITCH A DOPPIA SKIN (M4 del design system, 20/09/2026).
 *
 * Un solo componente, due controlli nativi, zero rami nel JSX: la geometria e i
 * colori arrivano dai token `--switch-*` (M4 in `globals.css`), che le due
 * piattaforme dichiarano nei loro blocchi.
 *
 *  - **iOS**: il toggle di sistema — 51×31pt, pollice 27 che NON cambia
 *    misura, e la traccia accesa è il VERDE di sistema (`--switch-on`): non è
 *    una tinta di brand, è il segnale con cui iOS dice «acceso» da sempre.
 *  - **Android**: lo switch M3 — traccia 52×32 con contorno da 2dp quando è
 *    spento, pollice che CRESCONO da 16 a 24 accendendolo, traccia primaria.
 *  - **Desktop**: i valori di base (32×18.4, pollice 16) = com'era: zero pixel.
 *
 * Il pollice si sposta con un `calc()` sui token (traccia − pollice − gioco) e
 * parte dalla stessa distanza di gioco a sinistra: con le misure di base il
 * conto fa esattamente la corsa e le posizioni di prima (thumb a 2px dal bordo
 * spento, a 2px dal bordo acceso) — zero pixel sul desktop.
 *
 * `size="sm"` resta una misura web fissa (24×14): è la variante per i pannelli
 * densi, dove un toggle da 51pt non c'entra — stessa deroga scritta per i touch
 * target sulla board (vedi knowledge.md, M1).
 */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        // Le tracce: accesa = token di piattaforma, spenta = il grigio di sempre.
        "data-checked:bg-[var(--switch-on)] data-unchecked:bg-input dark:data-unchecked:bg-input/80",
        // Variante SM: misura web fissa, com'era.
        "data-[size=sm]:h-[14px] data-[size=sm]:w-[24px]",
        // Variante DEFAULT: la skin. La traccia spenta di M3 porta il suo
        // contorno da 2dp (`--switch-unchecked-border`: 0 altrove, quindi la
        // dichiarazione è innocua sulle altre piattaforme). SOLO DA SPENTO
        // (richiesta 26/09/2026): il bordo applicato anche da acceso incorniciava
        // la traccia piena con un anello che il pollice copriva a tratti —
        // l'effetto «sbrindellato» dello screenshot. Acceso: niente bordo.
        "data-[size=default]:h-[var(--switch-track-h)] data-[size=default]:w-[var(--switch-track-w)] data-[size=default]:border-border data-[size=default]:data-unchecked:[border-width:var(--switch-unchecked-border)] data-[size=default]:border-solid data-[size=default]:data-checked:border-transparent",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-background ring-0 transition-[transform,width,height]",
          // M9 (Material 3 Expressive): il pollice dello switch M3 quando è
          // ACCESO non è un cerchio, è una PILLOLA 24×32 (la forma «pill
          // shaped thumb» della specifica). Il raggio lo scrive la regola CSS
          // in globals.css (`[data-platform='android'] … [data-slot='switch-thumb']`),
          // perché `data-platform` sta su <html> e una variante Tailwind qui
          // guarderebbe l'elemento sbagliato. Spento resta il cerchio 16 di M3.
          // Variante SM: com'era (corsa in % della propria misura).
          "group-data-[size=sm]/switch:size-3 group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-unchecked:translate-x-0",
          // Variante DEFAULT: il pollice di piattaforma. Spento è
          // `--switch-thumb-off` (16 su Android: il pollice piccolo di M3),
          // acceso cresce a `--switch-thumb` e corre a destra fino al gioco.
          "group-data-[size=default]/switch:size-[var(--switch-thumb-off)] group-data-[size=default]/switch:translate-x-[var(--switch-pad)] group-data-[size=default]/switch:data-checked:size-[var(--switch-thumb)] group-data-[size=default]/switch:data-checked:translate-x-[calc(var(--switch-track-w)-var(--switch-thumb)-var(--switch-pad))]",
          // I colori del pollice: com'erano (bianco nel chiaro, e in scuro la
          // stessa logica di contrasto col fondo della traccia) — anche iOS li
          // vuole così: pollice bianco su entrambi i temi.
          "dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
