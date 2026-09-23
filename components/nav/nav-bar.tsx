'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { ArrowLeftRight, Calendar, CalendarRange, Palmtree, Settings, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { haptics } from '@/lib/haptics'
import { useScrolledAttr } from '@/hooks/use-scrolled'
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
 *
 * M8 (22/09/2026) le ha cambiato la GEOMETRIA su iOS: da fascia a tutta larghezza
 * a ISOLA staccata dal bordo e dagli angoli, come fa iOS 26. La struttura non
 * cambia (le due skin restano `TabBar` e `NavigationBar`): cambiano `--nav-inset`
 * e `--nav-radius`, che su Android e sul desktop valgono zero — quindi lì la
 * barra è identica a prima, e la suite E2E che gira anche da desktop resta la
 * prova che nessuno ha spostato un pixel.
 *
 * M12f (23/09/2026) le dà una TERZA forma, e non è una skin: è la stessa skin su
 * una finestra più larga. Sopra i 600dp (e con almeno 480 di altezza) la barra
 * diventa la RAIL di Material — una colonna a sinistra, alta quanto la finestra.
 * Qui non c'è nessun ramo JS: cambiano `--nav-rail-w` e le poche regole di
 * geometria in `globals.css`, e i tre agganci (`nav-shell`, `nav-items`,
 * `nav-item`) esistono in tutte le configurazioni. La decisione è della
 * FINESTRA, quindi la prende il foglio di stile: farla in JS significherebbe un
 * primo disegno con la forma sbagliata, cioè il lampo di skin che il design
 * system evita dal primo giorno.
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
  const superficie = useRef<HTMLDivElement>(null)

  /**
   * LO STATO «SCROLLED» (M8 del piano, 22/09/2026).
   *
   * HIG 26 lo chiama «scroll edge effect», Material 3 «stato scrolled»: il bordo
   * e l'ombra della barra compaiono quando il contenuto le scorre SOTTO, non a
   * pagina in cima — altrimenti la barra dichiara una separazione che non c'è.
   *
   * Da M8b l'ascoltatore è UNO per tutta l'app (`hooks/use-scrolled.ts`): la
   * testata di pagina ha bisogno della stessa risposta, e due implementazioni
   * della stessa verità sono due verità. Qui la soglia resta quella di M8 (4px:
   * «la pagina si è mossa»), la stessa della testata.
   */
  useScrolledAttr(superficie)

  return (
    <nav
      aria-label="Navigazione principale"
      className="nav-shell fixed bottom-0 left-0 right-0 z-50"
      style={{ height: 'var(--nav-shell-h)' }}
    >
      {/* Il materiale, il raggio e il filo stanno QUI e non sul `<nav>`: il
          `<nav>` tiene l'area sicura (su iPhone è alto 49pt + 34pt di home
          indicator) e un raggio lì arrotonderebbe anche la banda sotto. Questo
          elemento è alto esattamente `--nav-height`, ed è lui l'isola.
          Da M8 la superficie è la BANDA INTERA (a tutta larghezza fuori da iOS),
          quindi il limite dei 32rem che c'era qui in M2 è tornato dove era: sul
          CONTENUTO, qui sotto. Limitare la superficie l'avrebbe fatta finire a
          512px su un desktop largo — cioè una barra che si interrompe a metà
          schermo, il difetto che la suite E2E non vede perché gira a 320px. */}
      <div
        ref={superficie}
        className="nav-surface nav-bar border-t border-border"
        style={{ height: 'var(--nav-bar-h)' }}
      >
        <div className="nav-items mx-auto flex h-full max-w-lg items-stretch">
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
      className="nav-item relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px]"
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
      onPointerDown={haptics.tap}
      className="nav-item flex min-w-0 flex-1 flex-col items-center justify-center gap-1"
    >
      {/* IL VOLUME DELLA VOCE ATTIVA (M9, Material 3 Expressive). Il contenitore
          resta la pillola 32×64 che la spec E2E prova da M2; la FORMA expressiva
          sta nel pseudo-elemento: quadrato con angoli laterali tondi
          (`--pill-corners`), la forma «a plenilunio» della specifica, che è
          implicitamente attiva quando la voce lo è. La glow della pressione
          lì dentro non c'è (non è un controllo pressabile a sé): lo stato
          premuto lo dice la velatura `--state-layer-press` sulla voce intera. */}
      <span
        className={cn(
          'pointer-events-none relative grid h-[var(--nav-item-h)] w-[var(--nav-item-w)] place-items-center rounded-full transition-colors',
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
