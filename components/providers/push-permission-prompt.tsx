'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, BellOff } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * PROMEMORIA PERMESSI DI NOTIFICA (richiesta 16/09/2026).
 *
 * A ogni avvio dell'app: se il permesso è 'default' (mai chiesto) o 'denied'
 * (negato), dopo 2,5 s compare un popup che spiega che cosa si perde e porta a
 * attivarli. Il ritardo lascia finire il caricamento e non si accavalla al
 * popup del changelog (che parte a 1,5 s e copre la pagina: qui si aspetta che
 * sia passato e che l'app sia «calma» — se il changelog è ancora aperto si
 * riprova poco dopo).
 *
 * Il.popup NON RIAPRE il permesso del browser: con 'denied' il
 * requestPermission() non mostra nulla, è l'utente che lo riattiva dalle
 * impostazioni del dispositivo. Il testo lo dice, e ricorda che le notifiche
 * si possono poi disattivare in Impostazioni → Notifiche (il master switch
 * `notification_enabled` dell'app, indipendente dal permesso del sistema).
 *
 * Nessun «non mostrare più» persistente: il popup è leggero (1 volta a
 * sessione per 'default', e per 'denied' solo ogni 7 giorni — localStorage
 * `push-reminder-dismissed`) così chi ha scelto di no non viene martellato ma
 * l'informazione resta visibile a chi entra raramente.
 */

const DENIED_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
const KEY_DISMISS = 'push-reminder-dismissed'

export function PushPermissionPrompt() {
  const [open, setOpen] = useState(false)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return

    const valuta = () => {
      const perm = Notification.permission
      if (perm === 'granted') return false
      // 'denied': non rompergli la giornata più di una volta a settimana.
      if (perm === 'denied') {
        try {
          const last = Number(localStorage.getItem(KEY_DISMISS) ?? 0)
          if (Date.now() - last < DENIED_SNOOZE_MS) return false
        } catch { /* localStorage assente: si mostra */ }
      }
      setDenied(perm === 'denied')
      return true
    }

    // Dopo il changelog (1,5 s + lettura): 2,5 s qui, con riprova se il dialog
    // delle novità è ancora aperto (il suo overlay intercetterebbe tutto).
    const t = setTimeout(() => {
      const changelogAperto = !!document.querySelector('[data-slot="dialog-content"]')
      if (changelogAperto) return   // il changelog tornerà aperto: si lascia stare stavolta
      if (valuta()) setOpen(true)
    }, 2500)
    return () => clearTimeout(t)
  }, [])

  const chiudi = () => {
    setOpen(false)
    if (Notification.permission === 'denied') {
      try { localStorage.setItem(KEY_DISMISS, String(Date.now())) } catch { /* ignora */ }
    }
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={n => { if (!n) chiudi() }}>
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {denied ? <BellOff size={16} className="text-muted-foreground" /> : <Bell size={16} className="text-primary" />}
            {denied ? 'Le notifiche sono bloccate' : 'Attiva le notifiche'}
          </DialogTitle>
          <DialogDescription className="text-left space-y-2">
            <span className="block">
              Con le notifiche attive l&apos;app ti avvisa subito quando un collega pubblica
              un cambio di turno che ti interessa, quando qualcuno è interessato ai tuoi
              e quando arrivano novità.
            </span>
              {denied ? (
                <span className="block">
                  Il permesso del browser è attualmente <strong>negato</strong>: per riattivarlo
                  apri le impostazioni del sito dal browser (icona 🔒 o ⓘ nella barra degli
                  indirizzi) e consenti le notifiche, poi ricarica l&apos;app.
                </span>
              ) : (
                <span className="block">Puoi attivarle ora: ti chiederemo il permesso (compare il dialog del browser).</span>
              )}
              <span className="block text-muted-foreground">
                Potrai comunque disattivarle quando vuoi da <Link href="/impostazioni" className="underline text-foreground" onClick={chiudi}>Impostazioni → Notifiche</Link>.
              </span>
            </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={chiudi}>
            Non ora
          </Button>
          {!denied && (
            <Button
              className="flex-1"
              onClick={async () => {
                chiudi()
                try { await Notification.requestPermission() } catch { /* l'utente ha chiuso */ }
              }}
            >
              Attiva
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
