/**
 * LE CINQUE DESTINAZIONI DELLA BARRA (M2 del design system, 20/09/2026).
 *
 * Perché sta qui e non dentro `bottom-nav.tsx`: le due skin (tab bar iOS,
 * navigation bar M3) devono mostrare **le stesse** destinazioni nello stesso
 * ordine, e l'unico modo di garantirlo è che non le scrivano due volte. Questo
 * file è il contratto: cosa è una destinazione, qual è quella attiva per un
 * percorso, dove porta.
 *
 * PERCHÉ CINQUE. È il massimo che entrambe le guide consentono: HIG «avoid more
 * than five» in una tab bar, Material 3 da 3 a 5 nella navigation bar. Prima di
 * questa milestone la barra aveva QUATTRO voci ma due erano gruppi che si
 * scambiavano al tap (una voce «Cambi» che apriva /dashboard *e* /vacanze, e una
 * voce «Turni Sala e Ferie» con l'etichetta a 7px): mescolare destinazioni e
 * commutatori è esattamente ciò che il report contesta. Ora ogni voce è UNA
 * destinazione e non cambia mai significato.
 *
 * SEMANTICA DEI PERCORSI. Una destinazione può coprire più percorsi (è il caso
 * di «Turni», che è la stessa piantina in due viste): `paths` serve a decidere
 * se la voce è ATTIVA, e `href` è dove si va quando non c'è una pagina
 * ricordata. La memoria dell'ultima vista resta in localStorage
 * (`turni-last-page`, vedi `use-last-page.ts`), quindi la voce «Turni» non
 * riporta sempre alla stessa pagina: riporta a quella che stavi guardando,
 * che è ciò che un gruppo significa.
 *
 * QUI NON CI SONO ICONE, ed è voluto: questo modulo è la parte PURA del
 * contratto (nomi, percorsi, ordine) e si può importare da Node — le spec lo
 * fanno. L'icona è una scelta della SKIN (oggi Lucide per entrambe, domani
 * Material Symbols su Android): vive in `nav-bar.tsx`, dove sta il disegno. */
export type NavDestinationId =
  | 'cambi-turno'
  | 'cambi-ferie'
  | 'turni'
  | 'tuo-turno'
  | 'impostazioni'

export interface NavDestination {
  id: NavDestinationId
  /** Dove porta quando non c'è una pagina ricordata per questo gruppo. */
  href: string
  /** L'etichetta sotto l'icona. Corta: sta in 64px di tab bar, e comunque la dice il verso. */
  label: string
  /**
   * L'etichetta per chi usa uno screen reader. Più esplicita della visibile
   * («Turni» da sola non dice che dentro ci sono sala *e* ferie), e in italiano
   * come tutto il resto dell'app.
   */
  ariaLabel: string
  /** I percorsi che appartengono a questa destinazione. */
  paths: readonly string[]
  /**
   * Vero per la destinazione che ricorda l'ultima pagina vista (oggi solo
   * «Turni»): la barra chiede a `use-last-page.ts` dove andare invece di usare
   * `href` nudo.
   */
  remembersLastPage?: boolean
}

/**
 * L'ORDINE. Le due «cambiali» stanno a sinistra (sono il lavoro quotidiano del
 * dipendente), «Turni» al centro, poi la propria piantina e le impostazioni: il
 * percorso più frequente non sta in un angolo, che è la raccomandazione comune
 * alle due guide (`thumb zone`: i bordi sono più scomodi).
 */
export const NAV_DESTINATIONS: readonly NavDestination[] = [
  {
    id: 'cambi-turno',
    href: '/dashboard',
    label: 'Cambi turno',
    ariaLabel: 'Cambi turno',
    paths: ['/dashboard'],
  },
  {
    id: 'cambi-ferie',
    href: '/vacanze',
    label: 'Cambi ferie',
    ariaLabel: 'Cambi ferie',
    paths: ['/vacanze'],
  },
  {
    id: 'turni',
    href: '/turnisala',
    label: 'Turni',
    ariaLabel: 'Turni: sala e ferie',
    paths: ['/turnisala', '/turniferie'],
    remembersLastPage: true,
  },
  {
    id: 'tuo-turno',
    href: '/tuoturno',
    label: 'Il tuo turno',
    ariaLabel: 'Il tuo turno',
    paths: ['/tuoturno'],
  },
  {
    id: 'impostazioni',
    href: '/impostazioni',
    label: 'Impostazioni',
    ariaLabel: 'Impostazioni',
    paths: ['/impostazioni'],
  },
]

/**
 * La destinazione attiva per un percorso, o `null` se il percorso non è una
 * destinazione. `null` è un caso vero e previsto: `/notifiche` e `/admin` si
 * aprono DA una destinazione (la campanella, Impostazioni) e sono pagine di
 * dettaglio: nessuna voce deve accendersi, perché nessuna di quelle voci porta
 * lì. Una voce accesa per sbaglio direbbe «sei qui» a chi non c'è.
 */
export function activeDestinationId(pathname: string): NavDestinationId | null {
  return NAV_DESTINATIONS.find((d) => d.paths.includes(pathname))?.id ?? null
}

/** La destinazione con questo id. Serve alle skin per chiedere icona ed etichette. */
export function destinationById(id: NavDestinationId): NavDestination {
  const found = NAV_DESTINATIONS.find((d) => d.id === id)
  if (!found) throw new Error(`destinazione sconosciuta: ${id}`)
  return found
}
