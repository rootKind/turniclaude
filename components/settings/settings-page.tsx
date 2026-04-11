'use client'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/hooks/use-current-user'
import { usePush } from '@/hooks/use-push'
import { updateUserProfile } from '@/lib/queries/users'
import { useQueryClient } from '@tanstack/react-query'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FeedbackDialog } from './feedback-dialog'
import { toast } from 'sonner'
import { useState } from 'react'

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { profile } = useCurrentUser()
  const { permission, isSubscribed, requestAndSubscribe } = usePush()
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  async function handleToggle(field: 'notify_on_interest' | 'notify_on_new_shift' | 'notification_enabled', value: boolean) {
    try {
      await updateUserProfile({ [field]: value })
      queryClient.invalidateQueries({ queryKey: ['current-user'] })
    } catch { toast.error('Errore aggiornamento preferenze') }
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4 space-y-6">
      <h1 className="text-lg font-bold">Impostazioni</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tema</h2>
        <div className="flex items-center justify-between">
          <Label>Aspetto</Label>
          <Select value={theme} onValueChange={v => v && setTheme(v)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Chiaro</SelectItem>
              <SelectItem value="dark">Scuro</SelectItem>
              <SelectItem value="system">Sistema</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notifiche</h2>
        {permission !== 'granted' ? (
          <Button variant="outline" onClick={requestAndSubscribe} className="w-full">
            Abilita notifiche push
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="notif-enabled">Notifiche attive</Label>
              <Switch
                id="notif-enabled"
                checked={profile?.notification_enabled ?? true}
                onCheckedChange={v => handleToggle('notification_enabled', v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notif-interest">Qualcuno è interessato al mio turno</Label>
              <Switch
                id="notif-interest"
                checked={profile?.notify_on_interest ?? true}
                onCheckedChange={v => handleToggle('notify_on_interest', v)}
                disabled={!profile?.notification_enabled}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notif-new">Nuovo turno pubblicato</Label>
              <Switch
                id="notif-new"
                checked={profile?.notify_on_new_shift ?? false}
                onCheckedChange={v => handleToggle('notify_on_new_shift', v)}
                disabled={!profile?.notification_enabled}
              />
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
        <Button variant="destructive" className="w-full" onClick={handleLogout}>
          Esci
        </Button>
      </section>

      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </main>
  )
}
