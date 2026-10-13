'use client'

/**
 * CHROME DELL'APP AUTENTICATA (barra di navigazione, realtime, popup).
 *
 * Prima viveva in `app/(app)/layout.tsx` come server component e faceva, a OGNI
 * render — compresi i prefetch che i link della barra fanno da soli — una
 * chiamata a Supabase Auth (`getUser`), un `select` su `users` e, per l'admin,
 * un `count` su `feedback`. Quel lavoro rendeva DINAMICHE tutte le rotte sotto
 * `(app)`: misurato il 13/10/2026 (scripts/count-server-requests.mjs), aprire la
 * dashboard faceva 11 render del server su 14 richieste, di cui 9 erano pagine
 * che l'utente non aveva chiesto.
 *
 * L'HTML di quel render era però solo il placeholder del PwaGuard: l'app è
 * disegnata dal client. Spostando qui la chrome, le pagine che non chiedono dati
 * al server diventano statiche (prerenderizzate a build time) e il prefetch non
 * fa più lavorare il server.
 *
 * La guardia d'accesso non è qui: resta nel middleware (proxy.ts), che copre
 * tutti i prefissi protetti e rimanda a /login chi non ha sessione.
 */
import { useQuery } from '@tanstack/react-query'
import { BottomNav } from '@/components/nav/bottom-nav'
import { PageTransitionWrapper } from '@/components/providers/page-transition'
import { ChangelogDialog } from '@/components/providers/changelog-dialog'
import { PushPermissionPrompt } from '@/components/providers/push-permission-prompt'
import { RealtimeInvalidation } from '@/components/providers/realtime-invalidation'
import { useCurrentUser } from '@/hooks/use-current-user'
import { createClient } from '@/lib/supabase/client'
import { isAdmin, isManager } from '@/types/database'

export function AppChrome({ children }: { children: React.ReactNode }) {
  // `useCurrentUser` legge il profilo dalla cache (localStorage + react-query +
  // IndexedDB): è lo stesso profilo su cui le pagine basano già i permessi, e a
  // un utente che torna non costa nessuna richiesta.
  const { profile } = useCurrentUser()
  const admin = !!profile && isAdmin(profile.id)
  const manager = !!profile && isManager(profile)

  // Badge dei feedback non letti: prima lo contava il server a ogni render.
  // Qui è una query sola, solo per l'admin, riusata entro il minuto.
  const { data: feedbackUnread = 0 } = useQuery({
    queryKey: ['feedback-unread'],
    enabled: admin,
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await createClient()
        .from('feedback')
        .select('*', { count: 'exact', head: true })
        .eq('read', false)
      return count ?? 0
    },
  })

  return (
    <div className="min-h-screen safe-area-pt pb-[calc(6rem_+_env(safe-area-inset-bottom,0px))]">
      {/* Un solo canale realtime per l'app: invalida le query anagrafiche
          (utenti, albero squadre, mesi tuoturno) sui cambi delle tabelle. */}
      <RealtimeInvalidation />
      <PageTransitionWrapper>{children}</PageTransitionWrapper>
      <ChangelogDialog />
      {/* Promemoria permessi notifica (richiesta 16/09/2026): fuori dal server
          component (ha bisogno di Notification API) ma nel layout, così vale per
          tutte le pagine autenticate. */}
      <PushPermissionPrompt />
      <BottomNav feedbackUnread={feedbackUnread} isAdmin={admin} isManager={manager} />
    </div>
  )
}
