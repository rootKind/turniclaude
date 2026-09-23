'use client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { BadgeCheck, Download, Smartphone } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { usePlatform } from '@/components/providers/platform-provider'
import { usePwaInstall } from '@/components/providers/pwa-install'

/**
 * L'indirizzo da digitare in Chrome: le istruzioni qui sotto lo mostrano vero
 * (`questo sito` è solo il ripiego del primo render).
 *
 * `location.host` esiste SOLO sul client, e leggerlo dentro un effetto con
 * `setState` — com'era fino a M11 — è un render in cascata al mount (l'errore
 * `react-hooks/set-state-in-effect` che questa pagina portava dietro). Con
 * `useSyncExternalStore` e uno snapshot server vuoto non c'è né la cascata né il
 * mismatch di idratazione: React sa che il valore definitivo arriva dopo.
 */
const hostStore = {
  // Non cambia mai durante la vita della pagina: nessuno a cui abbonarsi.
  subscribe: () => () => {},
  getSnapshot: () => window.location.host,
  getServerSnapshot: () => '',
}

export default function InstallaPage() {
  const host = useSyncExternalStore(hostStore.subscribe, hostStore.getSnapshot, hostStore.getServerSnapshot)
  const { canInstall, isInstalled, install } = usePwaInstall()
  // M11: le ISTRUZIONI seguono lo User-Agent (parlano del browser che hai in
  // mano), la riga sulle scorciatoie segue la PIATTAFORMA dell'app
  // (`usePlatform`, che rispetta anche l'override di QA `?platform=`): un gesto
  // del sistema operativo nominato per il sistema giusto è l'unica differenza di
  // testo che questa pagina si permette.
  const platform = usePlatform()
  // La scheda predefinita segue la STESSA piattaforma del resto dell'app. Prima
  // si ricalcolava dallo User-Agent dentro un effetto: era la stessa risposta
  // (`lib/platform.ts` è la regex unica) letta una seconda volta, con un
  // `setState` in più al mount — cioè un render in cascata per un valore che il
  // provider conosceva già.
  const defaultTab: 'ios' | 'android' = platform === 'ios' ? 'ios' : 'android'

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <Smartphone size={40} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Installa l&apos;app</h1>
          <p className="text-sm text-muted-foreground">
            Per usare Turni Sala C.C.C. devi installare l&apos;app sul tuo dispositivo.
          </p>
        </div>

        <Tabs defaultValue={defaultTab} key={defaultTab}>
          <TabsList className="w-full">
            <TabsTrigger value="android" className="flex-1">Android</TabsTrigger>
            <TabsTrigger value="ios" className="flex-1">iOS</TabsTrigger>
          </TabsList>

        {/* Proposta NATIVA (M5b): dove Chrome espone beforeinstallprompt il
            pulsante apre il foglio di installazione di sistema — lo stesso del
            menu ⋮ — invece di far seguire all'utente i passaggi a mano. Su iOS
            l'evento non esiste (l'installazione è solo via Condivisione), quindi
            lì restano le istruzioni: il blocco è condizionato a canInstall e non
            finge un fallback. */}
        {canInstall && !isInstalled && (
          <Button
            // M9: la CTA di pagina intera è il gradino GRANDE della scala — a
            // 56dp su Android e 44 su iOS/desktop, dalle stesse regole di
            // `data-size` che governano ogni altro bottone.
            size="xl"
            className="w-full"
            onClick={() => {
              void install().then((outcome) => {
                if (outcome === 'accepted') toast.success('App installata correttamente.')
              })
            }}
          >
            <Download className="w-4 h-4" />
            Installa ora
          </Button>
        )}
        {isInstalled && (
          <p className="text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <BadgeCheck className="w-4 h-4 text-emerald-600" />
            App già installata su questo dispositivo.
          </p>
        )}

          <TabsContent value="android" className="mt-4">
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">Chrome su Android</p>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">1.</span><span>Apri <strong>Chrome</strong> e vai su <strong>{host || 'questo sito'}</strong></span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">2.</span><span>Tocca il menu <strong>⋮</strong> in alto a destra</span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">3.</span><span>Tocca <strong>Aggiungi a schermata Home</strong> o <strong>Installa app</strong></span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">4.</span><span>Tocca <strong>Installa</strong> per confermare</span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">5.</span><span>Apri l&apos;app dalla schermata home</span></li>
              </ol>
            </div>
          </TabsContent>

          <TabsContent value="ios" className="mt-4">
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">Safari su iPhone/iPad</p>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">1.</span><span>Apri <strong>Safari</strong> e vai su <strong>{host || 'questo sito'}</strong></span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">2.</span><span>Tocca il pulsante di condivisione <strong>□↑</strong> in basso</span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">3.</span><span>Scorri e tocca <strong>Aggiungi a schermata Home</strong></span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">4.</span><span>Tocca <strong>Aggiungi</strong> in alto a destra</span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">5.</span><span>Apri l&apos;app dalla schermata home</span></li>
              </ol>
            </div>
          </TabsContent>
        </Tabs>

        {/* M11 — COSA CAMBIA DOPO L'INSTALLAZIONE (23/09/2026).
            Non è decorazione: sono le voci NUOVE del manifest, cioè le cose che
            esistono solo da quando l'app è installata — le scorciatoie del menu
            dell'icona (`shortcuts`) e il modo in cui l'app si comporta senza
            rete. Prima di M11 l'utente le scopriva per caso; e la terza voce
            dice una cosa che il manifest NON promette (`screenshots` a parte,
            l'offline dell'app è dichiarato: niente pagine in cache), perché la
            cosa peggiore qui è credere che un turno si sia salvato. */}
        <div className="rounded-lg border p-4 space-y-2" data-install-info="true">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Dopo l&apos;installazione
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
              <span className="text-muted-foreground shrink-0">•</span>
              <span>Si apre a tutto schermo, senza la barra del browser</span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground shrink-0">•</span>
              <span>
                {platform === 'ios'
                  ? 'Tieni premuta l’icona (Haptic Touch)'
                  : 'Tieni premuta l’icona di Chrome'}{' '}
                per le scorciatoie: <strong>Dashboard</strong>, <strong>Il tuo turno</strong>,
                <strong> Turni di sala</strong>, <strong>Notifiche</strong>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground shrink-0">•</span>
              <span>
                Le notifiche arrivano anche ad app chiusa; quelle ricevute mentre non la stavi
                guardando restano sul dispositivo finché non la riapri
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-muted-foreground shrink-0">•</span>
              <span>
                Senza rete l&apos;app te lo dice con un avviso e <strong>non salva</strong>: le
                pagine non restano in memoria di proposito, per non mostrarti turni vecchi
              </span>
            </li>
          </ul>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Questo sito è privato. Solo gli utenti autorizzati possono accedere.
        </p>
      </div>
    </div>
  )
}
