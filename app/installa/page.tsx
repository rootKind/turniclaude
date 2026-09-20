'use client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { BadgeCheck, Download, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { detectPlatformFromUA } from '@/lib/platform'
import { usePwaInstall } from '@/components/providers/pwa-install'

export default function InstallaPage() {
  const [defaultTab, setDefaultTab] = useState<'ios' | 'android'>('android')
  const [host, setHost] = useState('')
  const { canInstall, isInstalled, install } = usePwaInstall()

  useEffect(() => {
    // Unica regex di piattaforma dell'app (lib/platform.ts): prima qui c'era una
    // copia locale senza iPad-as-Mac, ora la decisione vive in un solo posto.
    setDefaultTab(detectPlatformFromUA(navigator.userAgent) === 'ios' ? 'ios' : 'android')
    setHost(window.location.host)
  }, [])

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
            size="lg"
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

        <p className="text-center text-xs text-muted-foreground">
          Questo sito è privato. Solo gli utenti autorizzati possono accedere.
        </p>
      </div>
    </div>
  )
}
