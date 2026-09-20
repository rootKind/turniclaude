'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePlatform } from '@/components/providers/platform-provider'
import { cn } from '@/lib/utils'

/**
 * L'ALLARME (M3 del design system, 20/09/2026).
 *
 * Il report chiedeva due primitive per gli overlay, non una: i **task** (form,
 * liste, scelte) e gli **allarmi** (una decisione, una o due uscite). Il primo
 * caso è `DialogContent` che su iOS sale come foglio; questo è il secondo.
 *
 * PERCHÉ UN ALLARME NON È UN FOGLIO, su nessuna delle due piattaforme:
 *  - HIG: gli allarmi sono centrati, corti, con titolo e messaggio, e si
 *    rispondono — non si chiudono con una ×;
 *  - Material 3: i dialog sono centrati, con i pulsanti TESTUALI in fondo a
 *    destra e nessuna banda separatrice.
 * Per questo la forma è `shape="dialog"` su entrambe (il foglio si chiede, non si
 * eredita) e la × è spenta.
 *
 * QUELLO CHE CAMBIA FRA LE DUE è la disposizione delle azioni, ed è una
 * differenza STRUTTURALE, non di colore: su iOS sono righe a tutta larghezza
 * separate da una linea (la distruttiva sopra, l'annullamento sotto, e
 * l'annullamento non è MAI rosso); su Android due pulsanti di testo affiancati
 * nel bordo in basso a destra.
 *
 * L'ordine delle azioni è quello che le guide vogliono per un allarme
 * distruttivo: la scelta pericolosa è la PRIMA della pila (la si raggiunge senza
 * attraversarla), e «Annulla» resta l'uscita facile.
 */
export interface AlertProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** La domanda: corta, in forma di domanda («Eliminare tutte le notifiche?»). */
  title: string
  /** Cosa succede davvero, e se è irreversibile. Riga breve, non un paragrafo. */
  description?: ReactNode
  /** Il verbo della scelta pericolosa («Elimina», «Svuota», «Rimuovi»). */
  confirmLabel: string
  cancelLabel?: string
  /** Tinge di rosso la scelta: solo quando l'azione NON si può annullare. */
  destructive?: boolean
  /** L'azione è in corso: le uscite si spengono, così non si risponde due volte. */
  busy?: boolean
  onConfirm: () => void
}

export function Alert({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Annulla',
  destructive = false,
  busy = false,
  onConfirm,
}: AlertProps) {
  const piattaforma = usePlatform()
  const ios = piattaforma === 'ios'

  function conferma() {
    onOpenChange(false)
    onConfirm()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        shape="dialog"
        showCloseButton={false}
        /* `max-w` stretto e paddings a zero: l'allarme si costruisce qui dentro,
           zona per zona, invece di ereditare il padding del dialog generico. */
        className="max-w-[17.5rem] gap-0 p-0 sm:max-w-[17.5rem]"
      >
        <div className={cn('px-5 pt-5 pb-4', ios && 'text-center')}>
          <DialogTitle className="font-semibold">{title}</DialogTitle>
          {description && (
            <DialogDescription className="mt-1.5 leading-snug">
              {description}
            </DialogDescription>
          )}
        </div>

        {ios ? (
          <div className="flex flex-col border-t border-border">
            <button
              type="button"
              disabled={busy}
              onClick={conferma}
              className={cn(
                'flex w-full items-center justify-center border-0 bg-transparent text-body transition-colors hover:bg-muted disabled:opacity-50',
                destructive ? 'text-destructive' : 'text-[var(--primary-action)]',
              )}
              style={{ minHeight: 'var(--touch-min)' }}
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="flex w-full items-center justify-center border-0 border-t border-border bg-transparent text-body font-semibold text-[var(--on-surface)] transition-colors hover:bg-muted disabled:opacity-50"
              style={{ minHeight: 'var(--touch-min)' }}
            >
              {cancelLabel}
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-1 px-2 pb-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={conferma}
              className={cn('font-semibold', destructive && 'text-destructive')}
            >
              {confirmLabel}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
