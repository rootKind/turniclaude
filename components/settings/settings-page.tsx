'use client'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/hooks/use-current-user'
import { isManager } from '@/types/database'
import { clearAllLocalData } from '@/lib/cache'
import { usePush } from '@/hooks/use-push'
import { updateUserProfile } from '@/lib/queries/users'
import { useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Sun, Moon } from 'lucide-react'
import { FeedbackDialog } from './feedback-dialog'
import { CHANGELOG_SHOW_ALL_EVENT } from '@/components/providers/changelog-dialog'
import { versioneTesto } from '@/lib/app-version'
import { NotificationHelpDialog } from './notification-help-dialog'
import { toast } from 'sonner'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function SettingsPage() {
  const { resolvedTheme, setTheme } = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { profile } = useCurrentUser()
  const isManagerUser = profile ? isManager(profile) : false
  const { permission, isSubscribed, requestAndSubscribe } = usePush()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  async function handleToggle(field: 'notify_on_interest' | 'notify_on_new_shift' | 'notify_on_vacation_interest' | 'notify_on_new_vacation' | 'notify_on_cross_shifts' | 'notify_shift_filter' | 'notify_vacation_filter' | 'notification_enabled', value: boolean) {
    try {
      await updateUserProfile({ [field]: value })
      queryClient.invalidateQueries({ queryKey: ['current-user'] })
    } catch { toast.error('Errore aggiornamento preferenze') }
  }

  async function handleLogout() {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } finally {
      // Svuota TUTTI i dati locali (cache, storage, IndexedDB, cache SW, cookie) DOPO il
      // signOut: un account diverso sullo stesso dispositivo non caricherà mai dati errati.
      clearAllLocalData()
      router.push('/login')
      router.refresh()
    }
  }

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <h1 className="text-lg font-bold">Impostazioni</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tema</h2>
        <div className="flex items-center justify-between">
          <Label>Aspetto</Label>
          <div className="flex items-center rounded-full border p-1 gap-0.5">
            <button
              onClick={() => setTheme('light')}
              aria-label="Tema chiaro"
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full transition-colors',
                resolvedTheme === 'light'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Sun className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTheme('dark')}
              aria-label="Tema scuro"
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full transition-colors',
                resolvedTheme === 'dark'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Moon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notifiche</h2>

        {permission === 'denied' && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-2">
            <p className="text-sm font-medium text-destructive">Notifiche bloccate</p>
            <p className="text-xs text-muted-foreground">
              Hai negato il permesso. Devi abilitarle manualmente dalle impostazioni del dispositivo.
            </p>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setHelpOpen(true)}>
              Come abilitare le notifiche
            </Button>
          </div>
        )}

        {permission === 'default' && (
          <Button variant="outline" onClick={requestAndSubscribe} className="w-full">
            Abilita notifiche push
          </Button>
        )}

        {permission === 'granted' && !isSubscribed && (
          <Button variant="outline" onClick={requestAndSubscribe} className="w-full">
            Attiva notifiche push
          </Button>
        )}

        {permission === 'granted' && isSubscribed && (
          <div className="space-y-4">
            {/* Gruppo generale: toggle master attivo/disattivo */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Generali</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="notif-enabled">Notifiche attive</Label>
                <Switch
                  id="notif-enabled"
                  checked={profile?.notification_enabled ?? true}
                  onCheckedChange={v => handleToggle('notification_enabled', v)}
                />
              </div>
            </div>

            {/* Gruppo Turni */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Turni</p>
              {!isManagerUser && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-interest">Qualcuno è interessato al mio turno</Label>
                  <Switch
                    id="notif-interest"
                    checked={profile?.notify_on_interest ?? true}
                    onCheckedChange={v => handleToggle('notify_on_interest', v)}
                    disabled={!profile?.notification_enabled}
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label htmlFor="notif-new">Nuovo turno pubblicato</Label>
                <Switch
                  id="notif-new"
                  checked={profile?.notify_on_new_shift ?? false}
                  onCheckedChange={v => handleToggle('notify_on_new_shift', v)}
                  disabled={!profile?.notification_enabled}
                />
              </div>
              {/* Filtro «posso coprirlo»: notifica solo i cambi che corrispondono al
                  MIO turno del giorno offerto (reale dal PDF, altrimenti teorico). */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-shift-filter" className="text-muted-foreground">
                    Solo se posso coprirlo
                  </Label>
                  <Switch
                    id="notif-shift-filter"
                    checked={profile?.notify_shift_filter ?? false}
                    onCheckedChange={v => handleToggle('notify_shift_filter', v)}
                    disabled={!profile?.notification_enabled || !(profile?.notify_on_new_shift ?? false)}
                  />
                </div>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Ti avvisiamo solo dei cambi compatibili col tuo turno del giorno offerto
                  (prima quello reale, altrimenti il teorico).
                </p>
              </div>
              {/* DCO+ e Noni ricevono notifiche dei turni dell'altro gruppo (mansioni superiori) */}
              {(profile?.is_dco_plus || profile?.is_secondary) && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-cross">Nuovo turno pubblicato mansioni superiori</Label>
                  <Switch
                    id="notif-cross"
                    checked={profile?.notify_on_cross_shifts ?? true}
                    onCheckedChange={v => handleToggle('notify_on_cross_shifts', v)}
                    disabled={!profile?.notification_enabled}
                  />
                </div>
              )}
            </div>

            {/* Gruppo Ferie */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Ferie</p>
              {!isManagerUser && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-vacation-interest">Qualcuno è interessato al mio cambio ferie</Label>
                  <Switch
                    id="notif-vacation-interest"
                    checked={profile?.notify_on_vacation_interest ?? true}
                    onCheckedChange={v => handleToggle('notify_on_vacation_interest', v)}
                    disabled={!profile?.notification_enabled}
                  />
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label htmlFor="notif-vacation-new">Nuovo cambio ferie disponibile</Label>
                <Switch
                  id="notif-vacation-new"
                  checked={profile?.notify_on_new_vacation ?? false}
                  onCheckedChange={v => handleToggle('notify_on_new_vacation', v)}
                  disabled={!profile?.notification_enabled}
                />
              </div>
              {/* Filtro «solo se compatibile col mio periodo»: notifica solo i cambi
                  ferie che CERCANO il periodo che ho io nell'anno richiesto (con gli
                  override admin dell'anno): è lo specchio del filtro dei cambi turno,
                  che guarda il mio turno del giorno offerto. */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-vacation-filter" className="text-muted-foreground">
                    Solo se compatibile col mio periodo
                  </Label>
                  <Switch
                    id="notif-vacation-filter"
                    checked={profile?.notify_vacation_filter ?? false}
                    onCheckedChange={v => handleToggle('notify_vacation_filter', v)}
                    disabled={!profile?.notification_enabled || !(profile?.notify_on_new_vacation ?? false)}
                  />
                </div>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Ti avvisiamo solo dei cambi ferie che cercano il periodo che hai tu nell’anno
                  richiesto (con le eventuali assegnazioni dell’admin).
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      <Separator />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Account</h2>
        <Button variant="outline" className="w-full" onClick={() => router.push('/update-password')}>
          Cambia password
        </Button>
        <Button variant="outline" className="w-full" onClick={() => setFeedbackOpen(true)}>
          Invia segnalazione
        </Button>
        <Button variant="destructive" className="w-full border-destructive/40" onClick={handleLogout}>
          Esci
        </Button>
      </section>

      <Separator />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Info app</h2>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => window.dispatchEvent(new Event(CHANGELOG_SHOW_ALL_EVENT))}
        >
          Novità
        </Button>
        {/* `suppressHydrationWarning`: la data è formattata con l'ora di Roma da
            un valore cotto alla build, e il formato può differire di un soffio fra
            l'HTML del server e il browser. È informazione, non stato. */}
        <p suppressHydrationWarning className="text-center text-xs text-muted-foreground pt-1 pb-2">
          {versioneTesto()}
        </p>
      </section>

      <NotificationHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </main>
  )
}
