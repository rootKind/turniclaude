import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * IL CAMPO DI TESTO A DOPPIA SKIN (M4 del design system, 20/09/2026).
 *
 * Anche qui il JSX non cambia per piattaforma: forma e materia sono nei token
 * `--input-*` (M4 in `globals.css`):
 *  - **iOS**: un inserto PIENO (fill a 6% del contenuto), SENZA bordo, angoli
 *    continui a 10pt — il campo di iOS ha un fondo, non un contorno;
 *  - **Android**: campo pieno di M3 — fondo pieno, angoli alti a 4dp e bassi a
 *    0, e la SOTTOLINEATURA che al focus diventa primaria (l'«active
 *    indicator», regola CSS nel blocco M4);
 *  - **desktop**: bordo e fondo trasparente di sempre (valori di base).
 *
 * L'altezza NON è un token: i chiamanti la scrivono (h-8 ovunque, app densa) e
 * cambiarla in blocco romperebbe le barre — è la stessa deroga scritta per i
 * touch target della board.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-[var(--input-radius)] border border-[var(--input-border)] border-b-[var(--input-underline)] bg-[var(--input-bg)] px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
