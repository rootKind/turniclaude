import { AppChrome } from '@/components/providers/app-chrome'
import { NotificationBell } from '@/components/notifications/notification-bell'

/**
 * LAYOUT DELLE PAGINE AUTENTICATE — deliberatamente SENZA lavoro server.
 *
 * Prima era un server component `async` che a ogni render faceva
 * `supabase.auth.getUser()`, un `select` su `users` e (per l'admin) un `count` su
 * `feedback`. Bastava questo a rendere DINAMICHE tutte le rotte sotto `(app)`,
 * quindi ogni prefetch della barra di navigazione era un render completo.
 *
 * Il modo di fare di Next non è gratis: è la lettura dei cookie (`createClient`,
 * `cookies()`) a dichiarare la pagina "dynamic". Senza, le pagine che non
 * chiedono dati al server vengono prerenderizzate e il prefetch le serve già
 * pronte.
 *
 * La guardia d'accesso non si perde: sta in `proxy.ts` (middleware), che copre
 * ogni prefisso protetto — /dashboard, /turnisala, /turniferie, /vacanze,
 * /tuoturno, /impostazioni, /notifiche, /admin — e rimanda a /login chi non ha
 * sessione. La chrome per-utente (admin/manager/badge) è client: app-chrome.tsx.
 *
 * QUI RESTA IL CAMPANELLO (`NotificationBell`): su questo ramo la barra in basso
 * è ancora quella vecchia, che non lo disegna da sé. Sul ramo dev il campanello
 * vive dentro la nuova barra, e questo import sparirà con lei.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppChrome>{children}</AppChrome>
      <NotificationBell />
    </>
  )
}
