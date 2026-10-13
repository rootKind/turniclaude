'use client'
// Invalidazione realtime globale (fase 2 cache-first, 20/09/2026): un SOLO
// canale Supabase per tutta l'app invalida le query react-query quando le
// tabelle anagrafiche cambiano, così la cache lunga (staleTime 6h) resta
// corretta. Push, non polling: zero traffico quando nulla cambia.
//
// NB il MESE a schermo di /turnisala (jsonb espanso + cache IDB) NON passa da
// qui: quella pagina ha la sua sottoscrizione dedicata. Ma l'ELENCO dei mesi e
// la storia dei PDF sì (13/10/2026): da quando le due pagine li leggono dal
// client, chi ha l'app aperta deve sapere che è stato caricato o cancellato un
// PDF senza ricaricare — altrimenti /tuoturno terrebbe un predittore vecchio
// finché la query non scade (5 minuti) e /turnisala un elenco mesi stantìo.
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { removeQueryCacheByPrefix } from '@/lib/query-idb-cache'

/**
 * Eventi postgres_changes → invalidazione dell'albero query (solo PREFISSO:
 * una INSERT su users invalida ['users',…] ma non ['shift-team-tree']).
 * Le stesse voci vengono eliminate dall'IDB (removeQueryCacheByPrefix): la
 * copia locale non sopravvive a un cambiamento noto.
 */
const TABLE_TO_PREFIX: ReadonlyArray<{ table: string; prefix: string[] }> = [
  { table: 'users', prefix: ['users'] },
  { table: 'shift_types', prefix: ['shift-team-tree'] },
  { table: 'shift_teams', prefix: ['shift-team-tree'] },
  { table: 'shift_team_members', prefix: ['shift-team-tree'] },
  { table: 'shift_adjustments', prefix: ['shift-team-tree'] },
  // Mesi caricati a mano: l'elenco (quali mesi sono «reali») e la storia da cui
  // /tuoturno deduce il teorico. Il predittore si ricalcola da sé quando la
  // storia cambia, perché è un useMemo sugli stessi dati (use-sala-data.ts).
  { table: 'sala_schedule', prefix: ['sala-months'] },
  { table: 'sala_schedule', prefix: ['tuoturno-months'] },
]

export function useRealtimeInvalidation(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel('query-invalidation-realtime')

    for (const { table, prefix } of TABLE_TO_PREFIX) {
      channel.on(
        'postgres_changes' as const,
        { event: '*' as const, schema: 'public', table },
        () => {
          void queryClient.invalidateQueries({ queryKey: prefix })
          void removeQueryCacheByPrefix(prefix)
        },
      )
    }

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}
