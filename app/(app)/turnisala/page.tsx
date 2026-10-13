import { Suspense } from 'react'
import { SalaPageClient } from './sala-page-client'
import TurniSalaLoading from './loading'

/**
 * /turnisala — la board della sala (piantina, mese reale dal PDF o teorico,
 * «Teorico ≠ reale», upload dei PDF, minimi).
 *
 * PAGINA STATICA (13/10/2026): qui non si legge più niente dal server. Piantina,
 * elenco dei mesi, mese a schermo, profilo (admin/manager) e albero squadre
 * arrivano dalle vie cache-first del client (hooks/use-sala-data +
 * hooks/use-users + lib/sala-schedule-cache). Prima erano un server component
 * `async` che a ogni render — compresi i prefetch che la barra di navigazione fa
 * da sola — pagava sessione, piantina, mesi, anagrafica e albero per produrre un
 * HTML che era comunque il placeholder del `PwaGuard`: la board la disegna il
 * client. Le render che restavano al server erano TUTTE prefetch di questa pagina
 * e di /tuoturno (scripts/count-server-requests.mjs).
 *
 * La guardia d'accesso resta nel middleware (proxy.ts); il mese a schermo si
 * legge prima dalla cache IndexedDB e poi dalla rete, come già faceva ogni cambio
 * mese.
 */
export default function TurniSalaPage() {
  return (
    // Suspense: SalaPageClient legge i parametri della URL (arrivo da una card di
    // cambio, «vengo da qui»). Senza confine, una pagina con useSearchParams non
    // può essere prerenderizzata (stesso schema della dashboard). Il fallback è lo
    // skeleton di rotta: con un confine Suspense l'HTML statico ha qualcosa da
    // mostrare mentre i parametri si risolvono.
    <Suspense fallback={<TurniSalaLoading />}>
      <SalaPageClient />
    </Suspense>
  )
}
