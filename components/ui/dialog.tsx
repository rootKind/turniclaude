"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { usePlatform } from "@/components/providers/platform-provider"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/**
 * IL VELO (M3 del design system, 20/09/2026).
 *
 * Prima era `bg-black/10` + `backdrop-blur-xs` scritti a mano: due scelte
 * «estetiche» che su un telefono non sono la convenzione di nessuna delle due
 * guide. HIG e Material SCHERMANO (Apple al 40%, Material al 32%) senza sfocare,
 * e la sfocatura dietro un contenuto modale lo fa intravedere invece di
 * staccarlo. Ora la ricetta sta nei token `--dialog-scrim*`, e i valori di BASE
 * sono quelli di prima: sul desktop il velo non cambia.
 *
 * `data-slot="dialog-overlay"` resta: è il selettore con cui la suite aspetta
 * che un popup sia sparito (`tests/sala-board.ts`, `tests/tuoturno.ts`).
 */
function DialogOverlay({
  className,
  style,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      style={{
        background: "var(--dialog-scrim)",
        backdropFilter: "var(--dialog-scrim-blur)",
        WebkitBackdropFilter: "var(--dialog-scrim-blur)",
        ...style,
      }}
      {...props}
    />
  )
}

/**
 * IL POPUP, DUE FORME (M3 del design system, 20/09/2026).
 *
 * Questo è il pezzo che il report contestava (issue n. 4: «overlay centrati
 * universali, close × ghost»). Un solo componente serve i 21 popup dell'app, e
 * la forma la decide la piattaforma:
 *
 *  - **iOS: un FOGLIO che sale dal basso.** HIG è esplicito — i dialoghi centrati
 *    servono agli allarmi (titolo, messaggio, una o due azioni), mentre i TASK
 *    (form, liste, scelte) si fanno nei sheet. Il foglio sale dal bordo inferiore,
 *    ha la scriminatura, e la sua via d'uscita è un comando scritto («Chiudi»),
 *    non una × appoggiata sul contenuto: la × fluttuante era il difetto
 *    segnalato, e su un foglio che scorre finiva sopra i controlli — è la
 *    ragione per cui esiste `tests/shift-dialog.spec.ts`.
 *  - **Android: il dialog di Material 3, centrato**, con raggio 28dp, elevazione
 *    e velo al 32% senza sfocatura.
 *  - **Desktop: esattamente quello di prima** (valori di BASE), perché la suite
 *    E2E gira anche da desktop ed è la prova che nessuna milestone ha spostato
 *    un pixel lì.
 *
 * `shape` esiste per gli ALLARMI: un allarme è centrato su ENTRAMBE le
 * piattaforme (HIG lo vuole centrato, M3 pure), quindi chi lo rende chiede
 * `shape="dialog"` e non si fa trasformare in foglio — vedi `components/ui/alert.tsx`.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  shape = "auto",
  style,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  /**
   * `auto` (default): foglio su iOS, dialog centrato altrove. `dialog`: centrato
   * SEMPRE (gli allarmi). `sheet`: foglio sempre (per provare iOS da desktop).
   */
  shape?: "auto" | "dialog" | "sheet"
}) {
  const platform = usePlatform()
  const sheet = shape === "auto" ? platform === "ios" : shape === "sheet"

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        /* La forma è dichiarata nel DOM: è ciò che le spec della piattaforma
           leggono per dire «questo è un foglio» o «questo è un dialog», senza
           dover indovinare dai pixel. */
        data-shape={sheet ? "sheet" : "dialog"}
        className={cn(
          "fixed z-50 grid w-full gap-4 bg-popover p-4 text-sm text-popover-foreground outline-none",
          sheet
            ? // Il foglio: colonna flessibile (le aree che scorrono dentro i
              // popup si aspettano un `flex-col` con `flex-1 min-h-0`), alto al
              // massimo 92dvh e con l'animazione che SALE dal bordo.
              "overlay-sheet inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-y-auto data-open:animate-in data-open:slide-in-from-bottom data-open:duration-300 data-closed:animate-out data-closed:slide-out-to-bottom data-closed:duration-200"
            : "top-1/2 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--dialog-radius)] shadow-[var(--elevation-dialog)] ring-1 ring-foreground/10 duration-100 sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        style={
          sheet
            ? {
                // Geometria IN LINE (non a classi): i popup passano i loro
                // `max-w-sm`/`max-w-md` e su un foglio quelle misure non hanno
                // senso — lo stile inline vince sulle classi del chiamante
                // senza obbligarlo a sapere su che piattaforma si trova.
                left: 0,
                right: 0,
                bottom: 0,
                top: "auto",
                transform: "none",
                maxWidth: "32rem",
                marginInline: "auto",
                borderRadius: "var(--radius-sheet) var(--radius-sheet) 0 0",
                paddingBottom: "max(var(--safe-bottom), 12px)",
                ...style,
              }
            : style
        }
        {...props}
      >
        {sheet ? (
          <>
            {/* Scriminatura + la via d'uscita scritta (vedi sopra). La riga è
                fuori dall'area che scorre: è la lezione di `shift-dialog`. */}
            <div className="relative flex h-6 shrink-0 items-center justify-center">
              <span className="h-1 w-9 rounded-full bg-border" aria-hidden />
              {showCloseButton && (
                <DialogClose
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute -top-1 right-0"
                    />
                  }
                >
                  Chiudi
                </DialogClose>
              )}
            </div>
            {children}
          </>
        ) : (
          <>
            {children}
            {showCloseButton && (
              <DialogClose
                render={
                  <Button
                    variant="ghost"
                    className="absolute top-2 right-2"
                    size="icon-sm"
                  />
                }
              >
                <XIcon />
                <span className="sr-only">Chiudi</span>
              </DialogClose>
            )}
          </>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Chiudi
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
