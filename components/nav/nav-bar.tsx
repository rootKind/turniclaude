'use client'

import Link from 'next/link'
import { ArrowLeftRight, Calendar, CalendarRange, Palmtree, Settings, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlatform } from '@/components/providers/platform-provider'
import { NotificationBadge } from '@/components/ui/notification-badge'
import { NAV_DESTINATIONS, type NavDestination, type NavDestinationId } from './nav-destinations'

/**
 * L'ICONA di ogni destinazione. Sta qui e non in `nav-destinations.ts` per due
 * ragioni: l'elenco delle destinazioni è la parte PURA del contratto (importabile
 * da Node, e le spec lo fanno), e l'icona è una scelta della SKIN — oggi Lucide
 * su entrambe le piattaforme, domani Material Symbols su Android (M9 del piano:
 * SF Symbols non è distribuibile sul web, quindi iOS resta su Lucide con il tratto
 * ritoccato). Il giorno in cui le due piattaforme avranno due set di icone,
 * cambia questa mappa e nient'altro.
 */
const ICONE: Record<NavDestinationId, LucideIcon> = {
  'cambi-turno': ArrowLeftRight,
  'cambi-ferie': Palmtree,
  turni: CalendarRange,
  'tuo-turno': Calendar,
  impostazioni: Settings,
}

/**
 * LA BARRA, DUE SKIN (M2 del design system, 20/09/2026).
 *
 * `min-w-0` sulle voci non è cosmetico: in una riga flex un elemento ha
 * `min-width: auto` e si rifiuta di scendere sotto la larghezza del suo
 * contenuto, quindi con un'etichetta lunga la BARRA SCORRE invece di
 * accorciarla (visto a 320px, e la spec lo pretende: nessuna etichetta tagliata
 * e nessuno scorrimento orizzontale).
 *
 * Due STRUTTURE, non due temi: quello che cambia fra iOS e Android qui non è un
 * colore, è **come si dice «sei qui»**. iOS tinge icona ed etichetta della voce
 * attiva (e l'etichetta è sempre visibile, a 10pt: HIG non la nasconde mai);
 * Material 3 lascia il testo neutro e mette una «pillola» 32×64 dietro l'icona.
 * Per questo il ramo è strutturale (`TabBar` vs `NavigationBar`) e non una
 * classe condizionale.
 *
 * Il desktop segue la struttura della tab bar con i token di BASE — cioè i
 * valori di oggi (64px, etichetta 10px, fondo opaco): sul desktop la M2 non
 * sposta un pixel, ed è la proprietà che rende la suite E2E una prova.
 *
 * Le voci sono `Link` con `aria-current="page"`: è ciò che un lettore di schermo
 * annuncia come «pagina corrente», e regge anche quando la voce attiva è una
 * vista sola di un gruppo (sala o ferie dentro «Turni»).
 */
export interface NavBarProps {
  /** La destinazione attiva, o `null` per le pagine di dettaglio (/notifiche, /admin). */
  activeId: NavDestinationId | null
  /** Dove porta ogni destinazione: il gruppo «Turni» ricorda l'ultima vista. */
  hrefFor: (destination: NavDestination) => string
  /**
   * I pallini di conteggio per destinazione (oggi solo Impostazioni: i feedback
   * non letti dell'admin). Stanno QUI e non nel chiamante perché la loro
   * posizione dipende dalla skin: sulla pillola di Material il pallino va
   * sull'icona, nella tab bar sulla voce — due misure che il chiamante non deve
   * conoscere.
   */
  badges?: Partial<Record<NavDestinationId, number>>
}

export function NavBar({ activeId, hrefFor, badges }: NavBarProps) {
  const platform = usePlatform()

  return (
    <nav
      aria-label="Navigazione principale"
      className="nav-surface safe-area-pb fixed bottom-0 left-0 right-0 z-50 border-t border-border"
      style={{ height: 'calc(var(--nav-height) + var(--safe-bottom))' }}
    >
      <div
        className="mx-auto flex max-w-lg items-stretch"
        style={{ height: 'var(--nav-height)' }}
      >
        {NAV_DESTINATIONS.map((destination) =>
          platform === 'android' ? (
            <MaterialItem
              key={destination.id}
              destination={destination}
              href={hrefFor(destination)}
              active={destination.id === activeId}
              badge={badges?.[destination.id] ?? 0}
            />
          ) : (
            <TabItem
              key={destination.id}
              destination={destination}
              href={hrefFor(destination)}
              active={destination.id === activeId}
              badge={badges?.[destination.id] ?? 0}
            />
          ),
        )}
      </div>
    </nav>
  )
}

/** Tab bar: icona 25pt + etichetta sempre visibile, tinta solo sulla voce attiva. */
function TabItem({
  destination,
  href,
  active,
  badge,
}: {
  destination: NavDestination
  href: string
  active: boolean
  badge: number
}) {
  const Icon = ICONE[destination.id]
  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? 'page' : undefined}
      aria-label={destination.ariaLabel}
      className="relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px]"
    >
      <span className="relative">
        <Icon
          size={24}
          strokeWidth={active ? 2.25 : 1.5}
          className={active ? 'text-[var(--nav-tint)]' : 'text-[var(--nav-muted)]'}
        />
        {badge > 0 && <NotificationBadge count={badge} className="absolute -top-1.5 -right-2" />}
      </span>
      <span
        className={cn(
          'max-w-full truncate px-0.5 leading-none',
          active ? 'font-semibold text-[var(--nav-tint)]' : 'text-[var(--nav-muted)]',
        )}
        style={{ fontSize: 'var(--nav-item-label)' }}
      >
        {destination.label}
      </span>
    </Link>
  )
}

/**
 * Navigation bar M3: la voce attiva sta dentro una pillola 32×64 (`--nav-indicator`,
 * una velatura del testo che si adatta da sé ai due temi) e il testo resta
 * neutro. La pillola ha `pointer-events-none` e non è un secondo bersaglio: il
 * bersaglio resta la voce intera, alta quanto la barra.
 */
function MaterialItem({
  destination,
  href,
  active,
  badge,
}: {
  destination: NavDestination
  href: string
  active: boolean
  badge: number
}) {
  const Icon = ICONE[destination.id]
  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? 'page' : undefined}
      aria-label={destination.ariaLabel}
      className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1"
    >
      <span
        className={cn(
          'pointer-events-none relative grid h-8 w-16 place-items-center rounded-full transition-colors',
          active && 'nav-indicator',
        )}
      >
        <Icon
          size={24}
          strokeWidth={active ? 2.25 : 1.5}
          className={active ? 'text-[var(--on-nav-indicator)]' : 'text-[var(--nav-muted)]'}
        />
        {badge > 0 && <NotificationBadge count={badge} className="absolute top-0 right-3" />}
      </span>
      <span
        className={cn(
          'max-w-full truncate px-0.5 leading-none',
          active ? 'font-semibold text-[var(--on-nav-indicator)]' : 'text-[var(--nav-muted)]',
        )}
        style={{ fontSize: 'var(--nav-item-label)' }}
      >
        {destination.label}
      </span>
    </Link>
  )
}
