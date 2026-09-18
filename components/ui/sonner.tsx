"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
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
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
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
