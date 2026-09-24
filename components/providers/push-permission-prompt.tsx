'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePush } from '@/hooks/use-push'

/**
 * PROMEMORIA PERMESSI DI NOTIFICA — VERSIONE MOLTO INVASIVA (25/09/2026).
 *
 * La versione del 16/09/2026 era un dialog educato: una volta a sessione
 * ('default'), una a settimana ('denied'), si ritirava se il changelog era
 * aperto. Su richiesta esplicita («lo voglio molto, molto invadente») ora è
 * una SCHERMATA INTERA che copre l'app, non aggirabile se non decidendo:
 *
 *   • compare a OGNI avvio quando il permesso non è 'granted' (il vecchio
 *     snooze a 7 giorni per 'denied' è stato tolto: chi ha negato lo ripensa
 *     ogni volta — il testo lo guida alle impostazioni del sito);
 *   • «Continua senza notifiche» esiste (un'app senza uscita sarebbe una
 *     trappola) ma è piccolo e NON è un'esenzione: mette in moto un conto di
 *     10 MINUTI di sessione, allo scadere la schermata torna. L'unica via
 *     d'uscita vera è attivare (o negare dal browser, lì il testo spiega come);
 *   • il timing resta dopo il changelog (1,5 s + lettura): qui 2,5 s con
 *     rinvio se il dialog novità è ancora aperto, così i due overlay non si
 *     accavalcano — ma al prossimo avvio si ripresenta comunque.
 *
 * ATTENZIONE AI TEST: i test E2E zittiscono il popup mettendo la chiave di
 * snooze `push-reminder-dismissed` (tests/browser-setup.ts). Con «ogni avvio»
 * quella chiave non basterà più: la aggiungiamo come uscita RAPIDA reale
 * (trovandola, il popup non si apre) e i test continuano a funzionare senza
 * toccare ogni spec.
 */

const RIMANDO_MS = 10 * 60 * 1000
const KEY_DISMISS = 'push-reminder-dismissed'
const KEY_RIMANDO = 'push-reminder-snoozed-at'

export function PushPermissionPrompt() {
  const [open, setOpen] = useState(false)
  const [denied, setDenied] = useState(false)
  // «Attiva» passa dall'hook: oltre a chiedere il permesso fa la SUBSCRIPTION
  // push e TRACCIA l'evento di attivazione (source 'prompt') per le statistiche.
  const { requestAndSubscribe } = usePush()

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return

    // Se i test (o noi) abbiamo preparato l'uscita rapida, la schermata non
    // compare: è lo stato di chi ha già deciso.
    try {
      if (localStorage.getItem(KEY_DISMISS)) return
    } catch { /* localStorage assente: si prosegue */ }

    const valuta = () => {
      const perm = Notification.permission
      if (perm === 'granted') return false
      // Rimando attivo? («continua senza notifiche» di pochi minuti fa)
      try {
        const snoozed = Number(localStorage.getItem(KEY_RIMANDO) ?? 0)
        if (snoozed && Date.now() - snoozed < RIMANDO_MS) return false
      } catch { /* si mostra */ }
      setDenied(perm === 'denied')
      return true
    }

    // Dopo il changelog (1,5 s + lettura): 2,5 s qui, con riprova se il dialog
    // delle novità è ancora aperto. NIENTE rinuncia definitiva: al prossimo
    // avvio (o allo scadere del rimando) si ripresenta.
    const riprova = () => {
      const changelogAperto = !!document.querySelector('[data-slot="dialog-content"]')
      if (changelogAperto) { t2 = setTimeout(riprova, 2000); return }
      if (valuta()) setOpen(true)
    }
    let t2: ReturnType<typeof setTimeout> | undefined
    const t = setTimeout(riprova, 2500)

    // Il conto del rimando gira anche con la schermata chiusa: scaduto, torna.
    let tick: ReturnType<typeof setInterval> | undefined
    if (Notification.permission !== 'granted') {
      tick = setInterval(() => {
        if (open) return
        try {
          const snoozed = Number(localStorage.getItem(KEY_RIMANDO) ?? 0)
          if (snoozed && Date.now() - snoozed >= RIMANDO_MS) {
            localStorage.removeItem(KEY_RIMANDO)
            setOpen(true)
          }
        } catch { /* si resta com'è */ }
      }, 15_000)
    }

    return () => { clearTimeout(t); if (t2) clearTimeout(t2); if (tick) clearInterval(tick) }
    // `open` nel tick è volutamente quasi-fresco: la sua funzione è solo evitare
    // la doppia apertura nello stesso tick; la chiusura la decide l'utente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const continuaSenza = () => {
    setOpen(false)
    try { localStorage.setItem(KEY_RIMANDO, String(Date.now())) } catch { /* ignora */ }
  }

  const attiva = async () => {
    setOpen(false)
    // requestAndSubscribe('prompt'): permesso + subscription + evento
    // 'push_enabled' con source 'prompt' (statistica della schermata).
    await requestAndSubscribe('prompt')
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Attiva le notifiche"
    >
      <div className="w-full max-w-sm rounded-2xl border panel-chain p-6 text-center space-y-4 shadow-2xl">
        <div className="flex justify-center">
          <span className={denied ? 'inline-flex' : 'inline-flex animate-bounce'}>
            {denied
              ? <BellOff size={56} className="text-muted-foreground" aria-hidden="true" />
              : <Bell size={56} className="text-primary" aria-hidden="true" />}
          </span>
        </div>

        <h1 className="text-xl font-extrabold leading-tight">
          {denied ? 'Le notifiche sono bloccate' : 'Ti stai perdendo i cambi di turno'}
        </h1>

        <div className="text-sm text-muted-foreground space-y-3 text-left">
          {denied ? (
            <p>
              Il permesso del browser è attualmente <strong>negato</strong>: per riattivarlo
              apri le impostazioni del sito dal browser (icona 🔒 o ⓘ nella barra degli
              indirizzi) e consenti le notifiche, poi ricarica l&apos;app.
            </p>
          ) : (
            <p>
              Senza le notifiche scopri i cambi solo aprendo l&apos;app: chi pubblica il
              turno che potresti coprire, chi si segna sui tuoi, le catene ferie che si
              chiudono — tutto arriva mentre sei altrove. Attivarle prende un secondo.
            </p>
          )}
          <p>
            E non è tutto-o-nulla: ogni tipo di notifica — nuovi turni, interessi, ferie,
            <strong> novità, aggiornamenti e informazioni di sistema</strong> — si accende e
            spegne singolarmente da{' '}
            <Link href="/impostazioni" className="underline text-foreground font-medium" onClick={continuaSenza}>
              Impostazioni → Notifiche
            </Link>. Quelle che non ti servono le disattivi tu, e restano spente.
          </p>
        </div>

        <div className="space-y-2">
          {!denied && (
            <Button className="w-full h-12 text-base font-bold" onClick={attiva}>
              <Bell size={18} className="mr-2" aria-hidden="true" />
              Attiva le notifiche
            </Button>
          )}
          <button
            type="button"
            onClick={continuaSenza}
            className="text-[11px] text-muted-foreground underline underline-offset-2"
          >
            continua senza notifiche (te lo ricordiamo tra 10 minuti)
          </button>
        </div>
      </div>
    </div>
  )
}
