"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { usePlatform } from "@/components/providers/platform-provider"

/**
 * IL MESSAGGIO A COMPARSA, DUE PIATTAFORME (M3 del design system, 20/09/2026).
 *
 * Il report contestava il toast in alto al centro con le icone nostre (issue n. 5):
 * iOS non ha un linguaggio per i toast in-app persistenti (usa feedback inline e
 * allarmi di sistema), Material 3 ha lo **snackbar**, che sta in BASSO, dura 4-10
 * secondi e ne mostra UNO alla volta. Qui si fa la cosa che si può fare senza
 * riscrivere ogni chiamata `toast(...)` dell'app (che sono centinaia): la
 * superficie cambia per piattaforma.
 *
 *  - **Android**: snackbar in basso, sopra la navigation bar (il token
 *    `--nav-height` dice quanto spazio lasciare), 4 secondi, uno alla volta, e i
 *    colori INVERSI (superficie scura con testo chiaro, in chiaro; e viceversa),
 *    che è il modo in cui M3 stacca lo snackbar dal contenuto.
 *  - **iOS**: banner discreto in alto, come prima. Il passo successivo —
 *    convertire i toast di conferma in feedback inline e tenere gli allarmi per
 *    gli errori bloccanti — è un lavoro sui CHIAMANTI, non su questa superficie:
 *    si fa quando una milestone tocca le pagine, non qui di straforo.
 *  - **Desktop**: identico a prima.
 *
 * Il colore dei tipi (successo, errore…) resta quello di `richColors`: il rosso
 * dell'avviso di sala è un'informazione, non una decorazione (lo verifica
 * `tests/card-cambio-to-sala.spec.ts`).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const piattaforma = usePlatform()
  const android = piattaforma === "android"

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={android ? "bottom-center" : "top-center"}
      /* M3: 4-10 secondi e un solo snackbar alla volta (una fila di messaggi che
         si accavallano è la cosa che il report contestava). Su iOS i valori
         restano quelli di sonner, cioè quelli che l'app ha oggi. */
      duration={android ? 4000 : undefined}
      visibleToasts={android ? 1 : undefined}
      offset={
        android
          ? { bottom: "calc(var(--nav-edge) + 12px)" }
          : undefined
      }
      mobileOffset={
        android
          ? { bottom: "calc(var(--nav-edge) + 12px)" }
          : undefined
      }
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": android ? "var(--foreground)" : "var(--popover)",
          "--normal-text": android ? "var(--background)" : "var(--popover-foreground)",
          "--normal-border": android ? "var(--foreground)" : "var(--border)",
          "--border-radius": android ? "var(--radius-control)" : "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          // Testo dei popup: se la frase non ci sta in una riga, va a capo in
          // modo EQUILIBRATO (due righe di lunghezza simile) invece di lasciare
          // l'ultima parola da sola su una seconda riga (richiesta 19/09/2026).
          // `text-wrap: balance` non AGGIUNGE righe: se la frase ci sta, resta
          // su una riga; se non ci sta, la divide in parti pari.
          title: "text-balance",
          description: "text-balance",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
