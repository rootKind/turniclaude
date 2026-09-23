'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { TURNI_VIEWS } from './nav-destinations'

/**
 * LA LINGUA DI CAMBIO VISTA, DENTRO LA PAGINA (M2b, 20/09/2026).
 *
 * «Turni» è UNA destinazione con DUE pagine (`/turnisala` e `/turniferie`). In
 * M2 il passaggio fra le due era rimasto come azione del menu («Vai a Turni
 * ferie»), cioè un'azione che in realtà è un cambio di vista — e per giunta
 * l'unica azione che un dipendente aveva su quelle pagine, quindi il pulsante
 * flottante esisteva solo per spostarlo di una pagina. Qui il passaggio diventa
 * quello che è: un selettore in testa alla pagina, sempre visibile, che dice
 * anche DOVE sei (la vista attiva è accesa).
 *
 * Questo componente NON ha nessun ramo per piattaforma, ed è la parte
 * interessante: iOS disegna un segmented control (fondo di sistema + «thumb»
 * rialzato) e Android le tab primarie di Material (fondo trasparente + barretta
 * da 3dp sotto la voce attiva) — due strutture diverse, ottenute cambiando i
 * soli token `--seg-*` in `app/globals.css`. Sul desktop valgono i valori di
 * BASE, che sono la struttura di Material: la stessa scelta fatta per la barra,
 * dove il desktop segue il ramo «non-iOS».
 *
 * Il controllo è un `<nav>` di due `Link`: la vista è un PERCORSO, non uno stato
 * interno, quindi deve restare un link vero (niente ricaricamento del documento,
 * deep-link, gesto «indietro» che continua a funzionare) e la voce attiva si
 * annuncia con `aria-current="page"` — lo stesso patto della barra.
 *
 * Il nome accessibile è «Turni sala» / «Turni ferie»: da sola, «Ferie» in mezzo
 * alla pagina non direbbe a un lettore di schermo che è una vista dei turni.
 */
export function TurniSwitch({ className }: { className?: string }) {
  const pathname = usePathname()
  /* IL SEGMENTED ESPRESSIVO (M9): anche una voce che CAMBIA VISTA è un
     `[data-gl]`, e alla pressione si tira verso il dito. L'attributo lo scrive
     il componente (come per il comando delle Azioni) perché `:active` non
     arriva ai gesti sintetici della suite, e la regola sta in `globals.css`
     sotto `[data-platform='android']`: la skin di iOS non si muove. */
  const [premuto, setPremuto] = useState<string | null>(null)

  return (
    <nav
      aria-label="Viste dei turni"
      /* Marcatore per le spec: cercarlo per `aria-label` funzionerebbe, ma questo
         attributo dice a colpo d'occhio che è IL selettore delle viste. */
      data-turni-switch=""
      className={cn('inline-flex select-none items-stretch', className)}
      style={{
        background: 'var(--seg-bg)',
        borderRadius: 'var(--seg-radius)',
        padding: 'var(--seg-pad)',
      }}
    >
      {TURNI_VIEWS.map((vista) => {
        const attiva = pathname === vista.path
        return (
          <Link
            key={vista.path}
            href={vista.path}
            prefetch
            aria-current={attiva ? 'page' : undefined}
            aria-label={vista.ariaLabel}
            data-gl="true"
            data-gl-press={premuto === vista.path ? 'true' : undefined}
            onPointerDown={() => setPremuto(vista.path)}
            onPointerUp={() => setPremuto(null)}
            onPointerCancel={() => setPremuto(null)}
            onPointerLeave={() => setPremuto(null)}
            className={cn(
              'relative inline-flex items-center justify-center px-4 transition-colors',
              attiva
                ? 'font-semibold text-[var(--on-surface)]'
                : 'font-medium text-[var(--on-surface-muted)]',
            )}
            style={
              attiva
                ? {
                    height: 'var(--seg-height)',
                    background: 'var(--seg-active-bg)',
                    boxShadow: 'var(--seg-active-shadow)',
                    /* Il thumb sta DENTRO il contenitore: il suo raggio è quello
                       del contenitore meno la sua imbottitura (9 − 2 = 7pt). */
                    borderRadius: 'calc(var(--seg-radius) - var(--seg-pad))',
                  }
                : { height: 'var(--seg-height)' }
            }
          >
            {vista.label}
            {/* L'indicatore di Material: su iOS è alto 0 e trasparente, quindi lo
                stesso markup non disegna niente — un ramo qui sarebbe stato un
                secondo posto in cui sapere che esiste un'altra piattaforma. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-1 bottom-0"
              style={{
                height: 'var(--seg-indicator-h)',
                background: attiva ? 'var(--seg-indicator)' : 'transparent',
                borderRadius: '3px 3px 0 0',
              }}
            />
          </Link>
        )
      })}
    </nav>
  )
}
