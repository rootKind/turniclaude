'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlatform } from '@/components/providers/platform-provider'
import { useBackToClose } from '@/hooks/use-back-to-close'
import { useDragToClose } from '@/hooks/use-drag-to-close'
import type { NavAction } from './use-nav-actions'

/**
 * LE AZIONI, FUORI DALLA BARRA (M2 del design system, 20/09/2026).
 *
 * Prima stavano DENTRO la barra, in un pulsante circolare che cambiava mestiere
 * da pagina a pagina: è l'issue n. 2 del report, e il difetto è doppio — la barra
 * serve a spostarsi fra destinazioni, non a eseguire azioni, e un pulsante che
 * significa sei cose diverse non ne comunica nessuna.
 *
 * Qui il pulsante è uno solo per pagina, vive SOPRA la barra e ha una forma per
 * piattaforma:
 *  - **iOS**: una pill (HIG non ha FAB) col nome di quello che fa;
 *  - **Android**: il FAB di Material 3, 56dp con angoli a 16dp, elevato e
 *    distanziato dalla barra (in M3 il FAB non sta nella navigation bar).
 *
 * LA REGOLA DEL TAP, dichiarata perché è il contratto con le spec e con l'utente:
 *  - **una** azione e non distruttiva → il tap la esegue (è ciò che faceva il
 *    pulsante-link di prima: «Nuovo turno», «Nuova richiesta ferie»…);
 *  - **più** azioni, o l'unica azione è distruttiva → il tap APRE l'elenco.
 *    Mai eseguire in silenzio l'unica cosa offerta quando ce ne sono altre
 *    quattro: il pulsante non deve nascondere che c'è dell'altro, e una
 *    cancellazione non deve partire da un tocco distratto.
 *  - **pressione lunga** (500 ms) → apre l'elenco in ogni caso. Era il gesto che
 *    l'app usava già per il menu della sala, e resta: è il canale con cui la rete
 *    di test raggiunge quelle voci, e non toglie niente a chi non lo conosce.
 *
 * L'elenco si apre in una superficie NATIVA: action sheet su iOS (sale dal
 * basso, con «Annulla» separato e le azioni distruttive in rosso) e bottom sheet
 * di Material sull'altro ramo (scriminatura, righe a 56dp, nessun pulsante di
 * annullamento: si chiude col tocco fuori, come vuole M3).
 *
 * Nota per la milestone degli overlay (M3): questa superficie è volutamente
 * locale. Quando arriverà il `Sheet`/`Alert` condiviso, questa è la prima
 * candidata a usarlo — oggi i 15 dialog dell'app sono centrati stile desktop e
 * sostituirli tutti insieme alla barra sarebbe stato un commit che non si
 * riesce più a leggere.
 */
export function NavActionSurface({
  actions,
  controlLabel,
}: {
  actions: NavAction[]
  /** L'etichetta del comando quando le azioni sono più d'una (es. «Azioni sala»). */
  controlLabel: string
}) {
  const platform = usePlatform()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  /**
   * IL BACK DI SISTEMA E IL TRASCINAMENTO (M8 del piano, 22/09/2026).
   *
   * Questa superficie è l'unico overlay dell'app che NON passa da
   * `components/ui/dialog.tsx` (è un portale locale, vedi la nota in testa),
   * quindi è l'unico posto in cui i due gesti nuovi vanno collegati a mano.
   * Vale la pena perché è l'overlay più frequente di tutti: è l'elenco delle
   * azioni, e su Android con quel foglio aperto il gesto indietro usciva dalla
   * pagina — il difetto più grave che M8 chiude.
   */
  useBackToClose(open, () => setOpen(false), platform !== 'desktop')
  const { props: maniglia, rif: foglio } = useDragToClose({
    attivo: true,
    onClose: () => setOpen(false),
  })

  // Il pannello si chiude con Esc: su desktop è l'unico modo di uscire senza
  // toccare col mouse (il tocco fuori funziona, ma non tutti lo cercano).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (actions.length === 0) return null

  const primary = actions[0]
  const multiple = actions.length > 1
  /** Il tap apre l'elenco invece di eseguire? (più azioni, o l'unica è distruttiva) */
  const tapOpensList = multiple || primary.tone === 'danger'
  const controlName = tapOpensList ? controlLabel : primary.label
  const PrimaryIcon = primary.icon

  function run(action: NavAction) {
    setOpen(false)
    if (action.event) document.dispatchEvent(new CustomEvent(action.event))
    else if (action.href) router.push(action.href)
    else action.onSelect?.()
  }

  function handlePointerDown() {
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setOpen(true)
    }, 500)
  }

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleClick() {
    // La pressione lunga ha GIÀ aperto l'elenco: il click che segue non deve
    // richiuderlo subito (sarebbe un lampo incomprensibile).
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    if (tapOpensList) setOpen((v) => !v)
    else run(primary)
  }

  return (
    <>
      <button
        type="button"
        /* Marcatore esplicito del comando (M2): le spec lo cercano con questo e
           non con `aria-haspopup`, che è condiviso da qualunque menu — per
           esempio il pulsante dei dev tools di Next, che nei test è presente. */
        data-nav-actions="control"
        onPointerDown={handlePointerDown}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={open ? 'Chiudi menu' : controlName}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          // `pointer-events-auto`: il contenitore che ci sta attorno è
          // `pointer-events-none` di proposito (è una banda larga quanto lo
          // schermo e non deve mangiare i click: vedi la nota in `bottom-nav.tsx`).
          'pointer-events-auto flex items-center justify-center shadow-[var(--elevation-dialog)] transition-colors',
          platform === 'ios'
            ? 'h-11 min-w-11 gap-2 rounded-full bg-primary px-4 text-primary-foreground'
            : 'bg-primary text-primary-foreground',
        )}
        style={
          platform === 'ios'
            ? undefined
            : { width: 'var(--fab-size)', height: 'var(--fab-size)', borderRadius: 'var(--fab-radius)' }
        }
      >
        {open ? (
          <X size={platform === 'ios' ? 18 : 20} />
        ) : (
          <PrimaryIcon size={platform === 'ios' ? 18 : 22} />
        )}
        {platform === 'ios' && !open && (
          <span className="text-body font-semibold">{controlName}</span>
        )}
      </button>

      {/* L'elenco esce in un PORTALE su <body>, e non è un dettaglio di stile:
          il contenitore delle azioni è a z-40 (sotto i modali dell'app, che
          stanno a z-50) e un figlio non può uscire dallo stacking context del
          padre. Senza portale, la sheet resterebbe sotto i dialog aperti e sotto
          la barra stessa — cioè esattamente il contrario di quello che deve fare
          una superficie modale. */}
      {open &&
        createPortal(
        <div
          className="pointer-events-auto fixed inset-0 z-[60]"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div className="nav-scrim absolute inset-0" style={{ background: 'var(--scrim)' }} />
          <div
            ref={foglio}
            role="dialog"
            aria-modal="true"
            aria-label={controlName}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'nav-sheet absolute bottom-0 left-0 right-0 mx-auto max-w-lg overflow-hidden',
              platform === 'ios' ? 'rounded-t-[14px]' : 'rounded-t-[var(--radius-sheet)]',
            )}
            style={{
              background: 'var(--surface-container-high)',
              paddingBottom: 'max(var(--safe-bottom), 8px)',
            }}
          >
            {/* Scriminatura (drag handle): è il segno che dice «questo pannello
                sale dal basso», e la bottom sheet di Material la mette sempre.
                L'action sheet di iOS non ce l'ha — lì il segno è il raggio e il
                pulsante «Annulla». Il desktop va col ramo Material (il suo
                comando è un FAB, non una pill): non è una piattaforma a sé, è
                «non-iOS», e inventargli una terza superficie sarebbe stato
                disegnare una cosa che nessuno ha chiesto. */}
            {/* LA MANIGLIA, su ENTRAMBE le skin (M8). Prima la scriminatura
                esisteva solo sul ramo Material e su iOS non c'era niente da
                afferrare: ma l'action sheet di HIG si trascina come la bottom
                sheet di M3, quindi la riga c'è sempre — su iOS è solo la zona
                che si afferra, senza il segno disegnato (che è una convenzione
                di Material, non di iOS). */}
            <div
              className="drag-handle mx-auto mt-2 flex h-6 w-full shrink-0 items-center justify-center"
              {...maniglia}
            >
              {platform !== 'ios' && (
                // `div` e non `span`: la scriminatura è il contratto con la spec
                // della barra (`div[aria-hidden="true"]`), che la cerca così.
                <div className="h-1 w-8 rounded-full bg-border" aria-hidden />
              )}
            </div>

            <ul className="py-1">
              {actions.map((action) => {
                const Icon = action.icon
                return (
                  <li key={action.id}>
                    <button
                      type="button"
                      /* Il nome accessibile è esplicito (e uguale al testo visibile,
                         come vuole WCAG 2.5.3 «label in name»): è con questo che
                         le spec raggiungono le voci — `getByLabel("Minimi di
                         persone per card")` è una di quelle. */
                      aria-label={action.label}
                      onClick={() => run(action)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 text-left transition-colors hover:bg-muted',
                        platform === 'ios' ? 'text-title3' : 'text-body',
                        action.tone === 'danger' ? 'text-destructive' : 'text-foreground',
                      )}
                      style={{ minHeight: 'var(--touch-min)' }}
                    >
                      <Icon size={20} aria-hidden className="shrink-0 opacity-80" />
                      <span className="flex-1">{action.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* «Annulla» separato: su iOS è la via d'uscita esplicita (HIG la
                vuole staccata dall'elenco e mai in rosso). Su Android non esiste:
                il tocco fuori dalla sheet è già la convenzione. */}
            {platform === 'ios' && (
              <div className="border-t border-border">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center justify-center px-4 text-title3 font-semibold"
                  style={{ minHeight: 'var(--touch-min)' }}
                >
                  Annulla
                </button>
              </div>
            )}
          </div>
        </div>,
          document.body,
        )}
    </>
  )
}
