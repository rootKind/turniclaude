'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { Alert } from '@/components/ui/alert'

/**
 * LA DOMANDA PRIMA DI DISTRUGGERE (M3 del design system, 20/09/2026).
 *
 * Il report contestava le conferme dell'app (issue n. 6): nella card di un cambio
 * turno la conferma era IN LINEA (due pulsanti che comparivano al posto di uno),
 * e nelle pagine admin era `window.confirm(...)` — la finestra del BROWSER, che
 * non è né HIG né Material, blocca la pagina, e in una PWA installata su iOS si
 * presenta come un avviso di sistema scollegato dall'app.
 *
 * Questo hook è il modo corto di fare la cosa giusta: chi deve distruggere
 * qualcosa chiama `chiedi({...})` e mette `{alert}` nel proprio JSX. La domanda è
 * un ALLARME (centrato su entrambe le piattaforme, azioni che si rispondono, mai
 * una ×), e l'azione parte SOLO dalla conferma — `run` non viene chiamata
 * altrove, quindi non esiste un secondo percorso che distrugge in silenzio.
 *
 * L'ordine conta: lo stato si azzera PRIMA di eseguire, così un'azione lenta (una
 * `fetch`) non lascia l'allarme aperto con la sua conferma ancora premibile — e
 * chi chiude col tocco fuori non esegue niente.
 */
export interface RichiestaDiConferma {
  /** La domanda, corta e in forma di domanda. */
  title: string
  /** Cosa sparisce e se è irreversibile: una riga, non un paragrafo. */
  description?: ReactNode
  /** Il verbo della scelta pericolosa. */
  confirmLabel?: string
  cancelLabel?: string
  /** `true` (default): la scelta si tinge di rosso, ed è un'informazione, non un'ornatura. */
  destructive?: boolean
  run: () => void | Promise<void>
}

export function useConferma() {
  const [richiesta, setRichiesta] = useState<RichiestaDiConferma | null>(null)

  const chiedi = useCallback((r: RichiestaDiConferma) => setRichiesta(r), [])

  const alert = (
    <Alert
      open={!!richiesta}
      onOpenChange={(aperto) => {
        if (!aperto) setRichiesta(null)
      }}
      title={richiesta?.title ?? ''}
      description={richiesta?.description}
      confirmLabel={richiesta?.confirmLabel ?? 'Conferma'}
      cancelLabel={richiesta?.cancelLabel}
      destructive={richiesta?.destructive ?? true}
      onConfirm={() => {
        const daEseguire = richiesta
        setRichiesta(null)
        void daEseguire?.run()
      }}
    />
  )

  return { chiedi, alert }
}
