'use client'
// Invalidazione realtime globale (fase 2 cache-first, 20/09/2026): un SOLO
// canale Supabase per tutta l'app invalida le query react-query quando le
// tabelle anagrafiche cambiano, così la cache lunga (staleTime 6h) resta
// corretta. Push, non polling: zero traffico quando nulla cambia.
//
// NB sala_schedule NON è qui: la pagina /turnisala ha la sua sottoscrizione
// dedicata (espande il jsonb v2 e scrive la cache IDB); /tuoturno rilegge i
// mesi cache-first a ogni switch, quindi la sua copia locale si sana da sé.
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
