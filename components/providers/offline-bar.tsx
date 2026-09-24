'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'

/**
 * M11 — L'AVVISO DI RETE (23/09/2026).
 *
 * Il piano lo chiedeva come «banner non bloccante, stato della cache del service
 * worker, possibilità di riprovare, `role="status"`». Le quattro cose insieme
 * dicono una cosa sola: quando non c'è rete l'app deve DIRLO, e deve dire anche
 * **cosa resta** — perché il silenzio, in un'app che salva turni, si legge come
 * «ha salvato».
 *
 * Perché questo componente non è dentro `PwaGuard`: l'avviso riguarda la RETE, non
 * l'installazione o la sessione. Se il server non risponde, la prima pagina che lo
 * dice è proprio quella che si apre per prima (`/login`, `/installa`) — cioè una
 * delle pagine che il guard protegge. Vive quindi accanto a `ThemeColor`, sopra
 * tutto, e si disegna da solo solo quando serve.
 *
 * COSA DICE, E COSA NON DICE. Il service worker (`public/sw.js`) mette in cache
 * **solo gli asset statici** (icone, manifest, chunk di `/_next/static`); le
 * PAGINE non sono in cache, per scelta già scritta là dentro: un HTML stantio in
 * un'app di turni è peggio di un errore di rete. Quindi il testo non promette
 * «l'app funziona offline» — promette il vero: le modifiche non si salvano, e in
 * cache ci sono N risorse. Chi legge sa esattamente cosa sta perdendo.
 *
 * IL BOTTONE «RIPROVA» fa un ping vero (`fetch` con `cache: 'no-store'` sul
 * manifest, che è la risorsa più piccola e sempre presente) invece di fidarsi di
 * `navigator.onLine`: quel flag può restare storto — il caso classico è un Wi-Fi
 * che risponde ai ping di sistema ma non ha internet. Se il ping riesce l'avviso
 * si ritira e la cache viene richiesta di nuovo; se fallisce resta lì, senza
 * fingere un successo.
 *
 * L'APTICA non si tocca qui: l'avviso è un cambio di STATO del sistema, non un
 * tocco dell'utente — e `--aptica-errore` è per le azioni che falliscono, non per
 * le condizioni in cui ci si trova.
 */
type StatoCache = { nome: string; voci: number; errore?: boolean }

export function OfflineBar() {
  // `null` = non ancora misurato (primo render). L'HTML del server e quello del
  // client devono coincidere: senza questo stato il banner comparirebbe durante
  // l'idratazione e React segnalerebbe un mismatch.
  const [online, setOnline] = useState<boolean | null>(null)
  const [cache, setCache] = useState<StatoCache | null>(null)
  const [verificando, setVerificando] = useState(false)

  /**
   * Chiede al service worker quante risorse ha in cache. Il messaggio va al
   * CONTROLLER (la pagina in questo momento è governata da quello) e la risposta
   * torna a tutte le finestre: il SW non conosce il concetto di «chi ha chiesto»,
   * e filtrare per tipo qui è più semplice che aprire un canale per tab.
   */
  const chiediCache = useCallback(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready
      .then((registration) => {
        const destinatario = navigator.serviceWorker.controller ?? registration.active
        destinatario?.postMessage({ type: 'STATO_CACHE' })
      })
      .catch(() => {
        // Nessun service worker (o registrazione fallita): la cache non è un
        // diritto, e l'avviso funziona lo stesso con la riga «non disponibile».
      })
  }, [])

  useEffect(() => {
    setOnline(navigator.onLine)

    const suOnline = () => {
      setOnline(true)
      chiediCache()
    }
    const suOffline = () => {
      setOnline(false)
      // La cache si richiede QUI e non solo all'avvio: un service worker che ha
      // appena finito il `precache` (all'install) risponde con un numero nuovo, e
      // l'avviso deve mostrare quello, non lo zero letto un istante prima.
      chiediCache()
    }
    const suMessaggio = (event: MessageEvent) => {
      if (event.data?.type !== 'STATO_CACHE') return
      setCache({ nome: event.data.nome, voci: event.data.voci, errore: event.data.errore })
    }

    window.addEventListener('online', suOnline)
    window.addEventListener('offline', suOffline)
    navigator.serviceWorker?.addEventListener('message', suMessaggio)
    chiediCache()

    return () => {
      window.removeEventListener('online', suOnline)
      window.removeEventListener('offline', suOffline)
      navigator.serviceWorker?.removeEventListener('message', suMessaggio)
    }
  }, [chiediCache])

  const riprova = useCallback(async () => {
    setVerificando(true)
    try {
      const risposta = await fetch('/manifest.webmanifest', { cache: 'no-store' })
      if (risposta.ok) {
        setOnline(true)
        chiediCache()
      }
    } catch {
      // Ancora senza rete: l'avviso resta dov'è. Nessun toast «riprova più
      // tardi»: il messaggio giusto è già a schermo.
    } finally {
      setVerificando(false)
    }
  }, [chiediCache])

  if (online !== false) return null

  return (
    <div
      role="status"
      aria-live="polite"
      data-offline="true"
      data-cache-voci={cache ? String(cache.voci) : ''}
      className="avviso-offline fixed inset-x-0 top-0 z-[60] flex items-center gap-3 border-b px-4 pb-2"
      // Il bordo superiore sale sopra la barra di stato: con `viewport-fit=cover`
      // (app/layout.tsx) l'avviso finirebbe sotto l'orologio — su iOS e, da
      // Android 15, anche su Android.
      style={{ paddingTop: 'max(var(--safe-top), 8px)' }}
    >
      <WifiOff size={18} className="shrink-0 text-[color:var(--danger)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-caption font-semibold">Sei offline</p>
        {/* Niente `truncate` qui (d4a0173): su 393px la riga compete col bottone
        «Riprova» e l'ellipsis tagliava il senso («finché non t…»). Un testo di
        stato va a capo; l'ellipsis è per le etichette a riga sola. */}
        <p className="text-caption text-muted-foreground">
          Le modifiche non si salvano finché non torni in linea.
        </p>
        <p className="text-caption text-muted-foreground/80">
          {cache
            ? `${cache.voci} risorse in cache locale (icone e codice)`
            : 'Cache locale non disponibile'}
        </p>
      </div>
      <button
        type="button"
        onClick={riprova}
        disabled={verificando}
        className="shrink-0 rounded-full border px-3 py-1.5 text-caption font-semibold disabled:opacity-60"
      >
        <span className="inline-flex items-center gap-1.5">
          <RefreshCw size={14} className={verificando ? 'animate-spin' : undefined} aria-hidden />
          Riprova
        </span>
      </button>
    </div>
  )
}
