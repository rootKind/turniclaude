"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { usePlatform } from "@/components/providers/platform-provider"
import { useBackToClose } from "@/hooks/use-back-to-close"
import { useDragToClose } from "@/hooks/use-drag-to-close"
import { XIcon } from "lucide-react"

/**
 * I DETTAGLI DELLA CHIUSURA, per base-ui (M8 del piano, 22/09/2026).
 *
 * `onOpenChange` di base-ui vuole due argomenti, e il secondo dice PERCHÉ si sta
 * chiudendo. Le due chiusure nuove di M8 (il gesto indietro e il trascinamento)
 * non nascono da un evento del browser che base-ui conosca, quindi il dettaglio
 * se lo costruisce il componente: `imperativeAction` è esattamente il motivo
 * giusto — «l'ha chiuso qualcosa dentro di noi, non un tocco fuori». `cancel()` e
 * `allowPropagation()` non hanno niente da annullare: a quel punto la chiusura è
 * già avvenuta.
 *
 * Serve perché i 30 chiamanti dell'app passano callback che leggono solo il
 * primo argomento, ma il TIPO è di base-ui: fabbricarlo per intero qui è la
 * differenza fra usare l'API e aggirarla con un cast.
 */
function dettagliDiChiusura(evento: Event): DialogPrimitive.Root.ChangeEventDetails {
  return {
    reason: 'imperative-action',
    event: evento,
    cancel: () => {},
    allowPropagation: () => {},
    isCanceled: false,
    isPropagationAllowed: false,
    trigger: undefined,
    preventUnmountOnClose: () => {},
  }
}

/**
 * LA VIA PER CHIUDERE, per i figli. Il foglio deve poter chiedere la chiusura al
 * rilascio del trascinamento, e chi conosce `onOpenChange` è il Root — che è
 * SOPRA il foglio nella gerarchia, non un suo antenato diretto con le prop
 * giuste. Un contesto di tre righe evita di far sapere a 30 chiamanti che esiste
 * un trascinamento: la maniglia la disegna `DialogContent`, e basta.
 */
const ContestoChiusura = React.createContext<(() => void) | null>(null)

function Dialog({ open, onOpenChange, children, ...props }: DialogPrimitive.Root.Props) {
  const platform = usePlatform()

  /**
   * IL BACK DI SISTEMA CHIUDE QUESTO DIALOG (M8 del piano, 22/09/2026).
   *
   * Sta QUI, sul Root, e non nei 30 chiamanti: ogni overlay dell'app passa da
   * `<Dialog open onOpenChange>` (fogli, dialog centrati e allarmi compresi),
   * quindi il gesto indietro funziona su tutti e nessuno deve ricordarsene.
   *
   * Su desktop NO (`platform !== 'desktop'`): lì il pulsante «indietro» del
   * browser è visibile e ha un significato suo — la cronologia — e riscriverla
   * per chiudere un popup sarebbe un sequestro. Su iOS e Android il gesto è un
   * tasto di sistema che l'utente ha sempre sotto il pollice, e la convenzione è
   * l'opposto: prima si chiude quello che è aperto.
   */
  useBackToClose(
    open ?? false,
    (evento) => onOpenChange?.(false, dettagliDiChiusura(evento)),
    platform !== 'desktop',
  )

  const chiudi = React.useCallback(() => {
    // `cancel`ble no: la chiusura l'ha già decisa il gesto (vedi sopra).
    onOpenChange?.(false, dettagliDiChiusura(new Event('turni:chiusura-gesto')))
  }, [onOpenChange])

  // Il provider sta SOPRA il Root e non dentro: React porta il contesto anche
  // attraverso i portali, quindi il foglio (che esce su `document.body`) lo legge
  // lo stesso — e così `children` resta la prop di base-ui, che può essere un nodo
  // o una funzione sul payload del trigger.
  return (
    <ContestoChiusura.Provider value={chiudi}>
      <DialogPrimitive.Root data-slot="dialog" open={open} onOpenChange={onOpenChange} {...props}>
        {children}
      </DialogPrimitive.Root>
    </ContestoChiusura.Provider>
  )
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
  const chiudi = React.useContext(ContestoChiusura)

  /**
   * IL FOGLIO SI CHIUDE TRASCINANDOLO (M8 del piano, 22/09/2026).
   *
   * La scriminatura esisteva da M3 e non faceva NIENTE: un'affordance disegnata
   * che non mantiene il gesto che promette è peggio di nessuna affordance,
   * perché lo insegna. Lo chiedono entrambe le guide (action sheet HIG, bottom
   * sheet M3), e la fisica è quella di `lib/motion.ts` — la stessa molla con cui
   * il foglio entra, non una curva che le somiglia.
   */
  const { props: maniglia, rif: pannello } = useDragToClose({
    attivo: sheet,
    onClose: () => chiudi?.(),
  })

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        ref={pannello}
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
                fuori dall'area che scorre: è la lezione di `shift-dialog`.

                Da M8 è anche la MANIGLIA del foglio (`.drag-handle` porta
                `touch-action: none` senza il quale il gesto non esiste) e il suo
                centro è l'area che si afferra: trascinare il corpo del foglio
                funziona solo se il contenuto è già in cima, e un errore lì è un
                foglio che non scorre più — la riga invece non si sbaglia. */}
            <div
              className="drag-handle relative flex h-6 shrink-0 items-center justify-center"
              {...maniglia}
            >
              <span className="h-1 w-9 rounded-full bg-border" aria-hidden />
              {showCloseButton && (
                /* Il comando sta in un CONTENITORE posizionato, e non è pignoleria:
                   la «Chiudi» porta la classe `.touch-expand` di M6 (l'area di
                   tocco da 44pt, che vive di `::after` e quindi vuole
                   `position: relative` sull'elemento), e quella regola è scritta
                   FUORI dai layer — dove batte qualsiasi utility, `absolute`
                   compreso. Misurato su iPhone (M8): la «Chiudi» non stava in
                   alto a destra, stava come voce di flex al centro della riga,
                   esattamente sopra la maniglia, e la sua area da 44pt rendeva il
                   foglio non afferrabile dal centro. Il contenitore risolve la
                   posizione senza toccare la classe che disegna l'area. */
                <div className="absolute -top-1 right-0">
                  <DialogClose
                    render={<Button variant="ghost" size="sm" />}
                  >
                    Chiudi
                  </DialogClose>
                </div>
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
