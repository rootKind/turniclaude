'use client'

import { useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftRight,
  ArrowRight,
  Calendar,
  CheckCheck,
  GitCompareArrows,
  History,
  Lock,
  Palette,
  Pencil,
  Plus,
  Trash2,
  Upload,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react'

/**
 * LE AZIONI DI UNA PAGINA (M2 del design system, 20/09/2026).
 *
 * Il problema che questo file risolve è il **n. 2 del report**: il pulsante
 * centrale della barra cambiava mestiere a ogni pagina (crea turno, crea
 * richiesta ferie, segnalazione, pannello admin, cambia vista, menu azioni) e
 * stava DENTRO la barra, dove né HIG né Material 3 lo vogliono — la barra è
 * fatta di destinazioni, le azioni sono un'altra cosa.
 *
 * Qui le azioni sono un elenco, e l'elenco è **per pagina e per ruolo**, non un
 * pulsante che si trasforma. La prima voce è quella PRINCIPALE (quella che si
 * esegue col tap), le altre finiscono nel menu: la superficie che le disegna
 * (`nav-action-surface.tsx`) cambia forma fra iOS e Android, questa lista no, e
 * per questo si può provare senza browser.
 *
 * Due canali, per non riscrivere le pagine:
 *  - `href` naviga (Link: nessun ricaricamento del documento);
 *  - `event` emette il CustomEvent sul documento che le pagine GIÀ ascoltano
 *    (`sala-admin-upload`, `ferie-admin-swap`, `tuoturno-open-personalizza`…).
 *    Inventare un secondo canale avrebbe significato toccare /turnisala, e la
 *    board è la pagina che il report stesso segnala come pixel-sensibile.
 */

export interface NavAction {
  id: string
  label: string
  icon: LucideIcon
  /** `primary`: è l'azione principale della pagina. `danger`: distrugge qualcosa. */
  tone: 'primary' | 'neutral' | 'danger'
  /** Naviga. Si usa un Link, quindi il documento non si ricarica. */
  href?: string
  /** Emette questo CustomEvent sul documento (il canale delle pagine esistenti). */
  event?: string
  /** Tutto il resto (aprire un dialog, svuotare la cronologia…). */
  onSelect?: () => void
}

export interface NavActionOptions {
  pathname: string
  isAdmin: boolean
  isManager: boolean
  /** Le notifiche hanno due azioni che non sono eventi ma chiamate dello store. */
  notifiche?: { markAllRead: () => void; clearAll: () => void; unreadCount: number; hasHistory: boolean }
  /** Apre il dialog «segnalazione» (vive nel dispatcher: è uno stato di quella schermata). */
  onFeedback: () => void
}

/**
 * Il giro del manager fra le pagine di lavoro. Nato quando la barra aveva
 * quattro voci raggruppate (per saltare da una vista all'altra senza passare dai
 * gruppi); con le cinque destinazioni dirette resta come scorciatoia.
 */
const MANAGER_CYCLE = ['/dashboard', '/vacanze', '/turnisala', '/turniferie']

function nextManagerPage(current: string): string {
  const idx = MANAGER_CYCLE.indexOf(current)
  return MANAGER_CYCLE[(idx + 1) % MANAGER_CYCLE.length]
}

/**
 * Lo stato della vista CONFRONTO di /tuoturno (lo emette la pagina ad ogni
 * cambio): snapshot PRIMITIVO — un booleano letto da `window` — confrontato per
 * valore, come `nav-lastpage`. Serve perché la voce «Confronta» diventa «Tuo
 * turno» quando si sta già confrontando: riaprire il picker sarebbe fuorviante.
 */
const COMPARE_STATE_EVENT = 'tuoturno-compare-state'

function subscribeCompareState(onChange: () => void) {
  document.addEventListener(COMPARE_STATE_EVENT, onChange)
  return () => document.removeEventListener(COMPARE_STATE_EVENT, onChange)
}

const readCompareState = () =>
  (typeof window !== 'undefined' &&
    (window as { __tuoturnoCompareActive?: boolean }).__tuoturnoCompareActive) ||
  false

export function useTuoTurnoCompareState(): boolean {
  return useSyncExternalStore(subscribeCompareState, readCompareState, () => false)
}

/**
 * Le azioni della pagina corrente. La PRIMA è la principale.
 *
 * Regola dichiarata (per non doverla dedurre leggendo i rami): se la pagina non
 * ha un'azione propria per questo ruolo, la principale è **il cambio di vista**
 * (sala↔ferie) o il giro del manager. Non si restituisce mai una lista vuota
 * quando c'è qualcosa che l'utente può fare da qui.
 */
export function useNavActions({
  pathname,
  isAdmin,
  isManager,
  notifiche,
  onFeedback,
}: NavActionOptions): NavAction[] {
  const router = useRouter()
  const comparing = useTuoTurnoCompareState()

  // ── /turnisala ────────────────────────────────────────────────────────────
  if (pathname === '/turnisala') {
    const gotoFerie: NavAction = {
      id: 'vai-ferie',
      label: 'Vai a Turni ferie',
      icon: ArrowRight,
      tone: isManager && !isAdmin ? 'primary' : 'neutral',
      onSelect: () => router.push(isManager && !isAdmin ? nextManagerPage(pathname) : '/turniferie'),
    }

    if (isAdmin || isManager) {
      const upload: NavAction = {
        id: 'upload-pdf',
        label: 'Upload PDF',
        icon: Upload,
        tone: 'primary',
        event: 'sala-admin-upload',
      }
      // NB: le etichette sono le STESSE che l'app usava come `aria-label`, parola
      // per parola. Non è pignoleria: sono il nome accessibile con cui le spec
      // E2E raggiungono queste voci (`apriVoceFab`, `openSalaAdminFab`), e
      // cambiarle avrebbe voluto dire riscrivere la rete di protezione della
      // board insieme alla barra — due cose in un commit solo.
      const extra: NavAction[] = [
        {
          id: 'cronologia-pdf',
          label: 'Cronologia PDF',
          icon: History,
          tone: 'neutral',
          event: 'sala-admin-history',
        },
      ]
      if (isAdmin) {
        extra.push(
          {
            id: 'modifica-piantina',
            label: 'Modifica piantina',
            icon: Pencil,
            tone: 'neutral',
            event: 'sala-admin-edit',
          },
          {
            id: 'teorico-reale',
            label: 'Mostra i turni teorici diversi dal reale',
            icon: GitCompareArrows,
            tone: 'neutral',
            event: 'sala-admin-theodiff',
          },
          {
            id: 'minimi',
            label: 'Minimi di persone per card',
            icon: UserCog,
            tone: 'neutral',
            event: 'sala-admin-minimi',
          },
        )
      }
      // Il cambio di vista resta in coda al menu finché non arriva il segmented
      // control dentro la pagina (M2b): la destinazione «Turni» copre DUE
      // percorsi, quindi senza questa voce l'altra vista non sarebbe
      // raggiungibile da qui.
      return [upload, ...extra, gotoFerie]
    }

    return [
      {
        id: 'vai-ferie',
        label: 'Vai a Turni ferie',
        icon: ArrowRight,
        tone: 'primary',
        onSelect: () => router.push('/turniferie'),
      },
    ]
  }

  // ── /turniferie ───────────────────────────────────────────────────────────
  if (pathname === '/turniferie') {
    const gotoSala: NavAction = {
      id: 'vai-sala',
      label: 'Vai a Turni sala',
      icon: ArrowLeftRight,
      tone: 'neutral',
      onSelect: () => router.push('/turnisala'),
    }
    if (isAdmin || isManager) {
      return [
        {
          id: 'sposta-ferie',
          label: 'Sposta dipendente tra periodi',
          icon: ArrowLeftRight,
          tone: 'primary',
          event: 'ferie-admin-swap',
        },
        gotoSala,
      ]
    }
    return [{ ...gotoSala, tone: 'primary' }]
  }

  // ── /tuoturno ─────────────────────────────────────────────────────────────
  if (pathname === '/tuoturno') {
    return [
      comparing
        ? {
            id: 'torna-al-mio-turno',
            label: 'Torna al tuo turno dalla vista confronto',
            icon: Calendar,
            tone: 'primary',
            event: 'tuoturno-exit-compare',
          }
        : {
            id: 'confronta',
            label: 'Confronta i turni di più dipendenti',
            icon: Users,
            tone: 'primary',
            event: 'tuoturno-open-confronta',
          },
      {
        id: 'personalizza',
        label: 'Personalizza colori e stile delle card',
        icon: Palette,
        tone: 'neutral',
        event: 'tuoturno-open-personalizza',
      },
    ]
  }

  // ── /notifiche ────────────────────────────────────────────────────────────
  if (pathname === '/notifiche') {
    // Nessuna azione da offrire a cronologia vuota: era un pulsante opaco al
    // 40% che si apriva sul nulla.
    if (!notifiche?.hasHistory) return []
    const azioni: NavAction[] = []
    if (notifiche.unreadCount > 0) {
      azioni.push({
        id: 'tutte-lette',
        label: 'Segna tutte come lette',
        icon: CheckCheck,
        tone: 'primary',
        onSelect: notifiche.markAllRead,
      })
    }
    azioni.push({
      id: 'elimina-tutte',
      label: 'Elimina tutte',
      icon: Trash2,
      tone: 'danger',
      onSelect: notifiche.clearAll,
    })
    return azioni
  }

  // ── /impostazioni ─────────────────────────────────────────────────────────
  if (pathname === '/impostazioni') {
    if (isAdmin) {
      return [{ id: 'admin', label: 'Pannello admin', icon: Lock, tone: 'primary', href: '/admin' }]
    }
    return [
      { id: 'feedback', label: 'Nuova segnalazione', icon: Plus, tone: 'primary', onSelect: onFeedback },
    ]
  }

  // ── /dashboard e /vacanze (e il resto) ────────────────────────────────────
  if (isManager) {
    return [
      {
        id: 'pagina-successiva',
        label: 'Pagina successiva',
        icon: ArrowLeftRight,
        tone: 'primary',
        onSelect: () => router.push(nextManagerPage(pathname)),
      },
    ]
  }
  if (pathname === '/vacanze') {
    return [
      {
        id: 'nuova-richiesta-ferie',
        label: 'Nuova richiesta ferie',
        icon: Plus,
        tone: 'primary',
        href: '/vacanze?new=1',
      },
    ]
  }
  if (pathname === '/dashboard') {
    return [
      { id: 'nuovo-turno', label: 'Nuovo turno', icon: Plus, tone: 'primary', href: '/dashboard?new=1' },
    ]
  }

  return []
}
