'use client'

import { useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useScrolledAttr } from '@/hooks/use-scrolled'

/**
 * LA TESTATA DI PAGINA — M8b del piano (23/09/2026).
 *
 * Il pezzo che mancava al chrome: finora ogni pagina stampava il suo `<h1>` con
 * classi proprie (`text-lg font-bold mb-4`, `text-xl`, `min-w-[120px]`…), e su
 * iOS/Android quel titolo **non si comportava come un titolo**: restava lì,
 * identico a un'etichetta, mentre entrambe le guide hanno un oggetto preciso per
 * questo posto.
 *
 *  · **iOS = LARGE TITLE (HIG).** Il titolo è grande (34pt) e vive nel CONTENUTO:
 *    scorrendo se ne va. La barra compatta (44pt, 17pt semibold, materiale
 *    traslucido) entra quando la pagina scorre e resta agganciata in cima, sotto
 *    l'area sicura. È il «large title collapse», approssimato senza
 *    interpolazione: la misura vera la fa il sistema operativo, e qui non c'è
 *    nessun valore di sistema da leggere (stessa avvertenza dell'isola di M8).
 *
 *  · **Android = TOP APP BAR (M3).** La barra è alta 64dp, il titolo compatto è
 *    22sp, e quando il contenuto le scorre sotto prende **colore ed elevazione**
 *    (`--head-bar-bg` + `--head-bar-shadow`): è lo stato «scrolled» di Material,
 *    lo stesso vocabolario che la barra di navigazione usa in M8. Il titolo
 *    grande (28sp) resta nel contenuto come «large app bar» espressiva.
 *
 * **Sul desktop non esiste**, e non per pigrizia: il titolo è l'`<h1>` che le
 * pagine hanno sempre avuto, con le classi che si passano da sole (`className`,
 * `rigaClassName`). La barra compatta è alta ZERO e invisibile, e l'unica cosa che
 * questa milestone aggiunge al DOM è un involucro in più — che è la ragione per
 * cui la suite E2E che gira anche da desktop resta la prova che nessuno ha
 * spostato un pixel.
 *
 * PERCHÉ IL TITOLO GRANDE E LA BARRA SONO DUE FRATELLI E NON UNO DENTRO L'ALTRO:
 * un `position: sticky` si aggancia sì al bordo della finestra, ma non esce mai
 * dal **blocco che lo contiene**: dentro il `<div>` del titolo, la barra si
 * fermerebbe appena il titolo esce dallo schermo. Qui i due elementi sono
 * fratelli dentro il `<main>` della pagina, quindi la barra può accompagnare la
 * pagina intera. (E l'ordine non è un dettaglio: la barra viene DOPO il titolo,
 * quindi nasce sotto di lui e si aggancia quando ci arriva — è quello che fa iOS,
 * ed è quello che fa il large app bar di M3.)
 *
 * L'UNICA COSA CHE NON SA FARE: il titolo grande non si rimpicciolisce
 * *continuamente* seguendo il dito (l'interpolazione legata allo scorrimento è
 * `animation-timeline: scroll()`, che oggi è solo Chromium). Qui il passaggio è
 * netto: il titolo scorre via con il contenuto, la barra entra. Due stati invece
 * di un continuum, e si vede solo se lo si guarda apposta.
 */
export function Testata({
  titolo,
  className,
  rigaClassName,
  children,
}: {
  /** Il titolo della pagina. Compare due volte nel DOM (grande e compatto): la
   *  seconda è `aria-hidden`, così un lettore di schermo lo annuncia una volta. */
  titolo: string
  /** Le classi del titolo SUL DESKTOP (le stesse che la pagina usava prima). */
  className?: string
  /** Le classi della riga (per le pagine che hanno un comando accanto al titolo).
   *  SUL DESKTOP, dove la riga è quella di prima; su iOS/Android la riga resta
   *  (un comando accanto al titolo serve su tutte le piattaforme) ma perde i
   *  margini che la pagina aveva scritto per il desktop. */
  rigaClassName?: string
  /** Comandi accanto al titolo (es. il selettore DCO/Noni di /vacanze). */
  children?: ReactNode
}) {
  const barra = useRef<HTMLDivElement>(null)
  useScrolledAttr(barra)

  return (
    <>
      <div data-slot="testata-riga" className={cn('testata-riga', rigaClassName)}>
        <h1 data-slot="testata-titolo" className={cn('testata-titolo', className)}>
          {titolo}
        </h1>
        {children}
      </div>
      {/* `aria-hidden` perché il titolo è già annunciato dall'`<h1>` qui sopra:
          due volte lo stesso titolo è rumore, non informazione. */}
      <div
        ref={barra}
        data-slot="testata-barra"
        className="testata-barra"
        aria-hidden="true"
      >
        {/* Il titolo sta nella STESSA colonna del contenuto (`max-w-lg` + 16px),
            così la barra può essere a tutta larghezza senza che il titolo si
            allinei al bordo dello schermo su un display largo. */}
        <div className="testata-barra-interno">
          <span data-slot="testata-compatta" className="testata-compatta">
            {titolo}
          </span>
        </div>
      </div>
    </>
  )
}
