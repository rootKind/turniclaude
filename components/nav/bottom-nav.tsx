'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Alert } from '@/components/ui/alert'
import { FeedbackDialog } from '@/components/settings/feedback-dialog'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { NavBar } from './nav-bar'
import { NavActionSurface } from './nav-action-surface'
import { useNavActions } from './use-nav-actions'
import { activeDestinationId, destinationById, type NavDestination } from './nav-destinations'
import { useRememberGroupPage, useTurniLastPage } from './use-last-page'

/**
 * LA BARRA (M2 del design system, 20/09/2026).
 *
 * Questo file era 600 righe: quattro destinazioni, un pulsante centrale che
 * cambiava mestiere per pagina, cinque overlay di «mini-FAB» con backdrop, una
 * pressione lunga con timer, il giro del manager, il badge dei feedback e il
 * dialog delle segnalazioni — tutto insieme. Ora fa il **dispatcher** e nient'altro:
 *
 *   1. legge il percorso e i ruoli;
 *   2. chiede a `use-nav-actions.ts` quali azioni ha questa pagina;
 *   3. disegna la barra (`nav-bar.tsx`: tab bar o navigation bar M3) e la
 *      superficie delle azioni (`nav-action-surface.tsx`: pill o FAB, e l'elenco
 *      in una sheet nativa).
 *
 * Il valore di smontarlo così non è l'estetica del file: le due skin condividono
 * le stesse cinque destinazioni perché le leggono dallo stesso elenco, e la
 * matrice delle azioni (ruolo × pagina) si può leggere — e provare — senza
 * browser.
 */
interface Props {
  feedbackUnread?: number
  isAdmin?: boolean
  isManager?: boolean
}

export function BottomNav({ feedbackUnread = 0, isAdmin = false, isManager = false }: Props) {
  const pathname = usePathname()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  /**
   * L'ALLARME della cronologia (M3, 20/09/2026). Prima «Elimina tutte» nella
   * lista delle azioni SVUOTAVA E BASTA: una cancellazione irreversibile senza
   * una domanda — è l'issue n. 6 del report. Ora l'azione APRE l'allarme e a
   * svuotare ci pensa la conferma, che è l'unico posto in cui si distrugge
   * qualcosa.
   */
  const [confermaSvuota, setConfermaSvuota] = useState(false)
  const { markAllRead, clearAll, unreadCount, history } = useNotificationHistory()

  const turni = destinationById('turni')
  const turniLastPage = useTurniLastPage()
  useRememberGroupPage(pathname, turni.paths)

  const actions = useNavActions({
    pathname,
    isAdmin,
    isManager,
    notifiche: {
      markAllRead,
      clearAll: () => setConfermaSvuota(true),
      unreadCount,
      hasHistory: history.length > 0,
    },
    onFeedback: () => setFeedbackOpen(true),
  })

  /** Dove porta una destinazione: solo i gruppi ricordano l'ultima vista. */
  function hrefFor(destination: NavDestination): string {
    return destination.remembersLastPage ? turniLastPage : destination.href
  }

  return (
    <>
      <NavBar
        activeId={activeDestinationId(pathname)}
        hrefFor={hrefFor}
        badges={feedbackUnread > 0 ? { impostazioni: feedbackUnread } : undefined}
      />

      {/* Le azioni vivono SOPRA la barra. L'ordine nel DOM conta: dopo la barra e
          alla sua stessa quota (z-50), così l'elenco — che è modale — copre anche
          la barra; dentro il pannello sta a z-60 sopra lo scrim.

          `pointer-events-none` su TUTTI i contenitori, e `auto` solo sul pulsante
          e sulla superficie dell'elenco (`nav-action-surface.tsx`): se lo mettessi
          sulla riga `flex justify-end`, quella riga resta larga quanto lo schermo
          e diventa una BANDA INVISIBILE che mangia i click di tutto ciò che le sta
          sotto. È successo davvero — la suite l'ha trovata su iPhone, dove un
          pulsante di /dashboard finiva esattamente dietro la banda: il click non
          arrivava mai e il test andava in timeout. Sul desktop le card di quella
          pagina non arrivano a quell'altezza, quindi il difetto sarebbe passato. */}
      {actions.length > 0 && (
        <div
          // z-40, cioè SOTTO i modali dell'app (z-50) e sotto la barra: un FAB
          // flottante copre il contenuto (è il suo mestiere), ma non deve coprire
          // una finestra aperta — è successo col pannello dei minimi, la cui
          // «Salva» finiva esattamente dietro il pulsante, e il test l'ha preso.
          // L'elenco delle azioni, che invece È modale, esce in un portale a z-60
          // (vedi `nav-action-surface.tsx`): il portale è l'unico modo di
          // scavalcare lo stacking context di questo contenitore.
          className="pointer-events-none fixed left-0 right-0 z-40 mx-auto max-w-lg"
          style={{
            // `--nav-edge` e non l'altezza della barra: da M8 su iPhone la barra è
            // un'isola staccata dal bordo, quindi il suo bordo alto sta un
            // distacco più su. Con l'altezza soltanto, il pulsante sarebbe
            // finito DENTRO l'isola — e la spec che pretende «le azioni stanno
            // sopra la barra» l'avrebbe detto. Su Android e desktop il valore è
            // identico a prima.
            bottom: 'calc(var(--nav-edge) + var(--fab-offset))',
          }}
        >
          <div className="flex justify-end px-4">
            <NavActionSurface actions={actions} controlLabel={actionControlLabel(pathname)} />
          </div>
        </div>
      )}

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      <Alert
        open={confermaSvuota}
        onOpenChange={setConfermaSvuota}
        title="Svuotare la cronologia delle notifiche?"
        description={
          unreadCount > 0
            ? `Spariscono tutte le notifiche di questo dispositivo, comprese le ${unreadCount} non lette. Non si possono recuperare.`
            : 'Spariscono tutte le notifiche di questo dispositivo. Non si possono recuperare.'
        }
        confirmLabel="Elimina tutte"
        destructive
        onConfirm={clearAll}
      />
    </>
  )
}

/**
 * Il nome accessibile del comando che apre l'elenco. È per pagina e non per
 * ruolo: «Azioni sala» non dice cosa c'è dentro, ma dice **dove sei**, che è
 * l'informazione che serve quando il pulsante è lo stesso in tre pagine diverse.
 * Le etichette sono quelle che l'app usava già (le spec E2E le conoscono).
 */
function actionControlLabel(pathname: string): string {
  switch (pathname) {
    case '/turnisala':
      return 'Azioni sala'
    case '/turniferie':
      return 'Azioni ferie'
    case '/tuoturno':
      return 'Azioni turno'
    case '/notifiche':
      return 'Azioni notifiche'
    default:
      return 'Azioni'
  }
}
