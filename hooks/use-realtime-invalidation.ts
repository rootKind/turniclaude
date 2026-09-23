'use client'
// Invalidazione realtime globale (fase 2 cache-first, 20/09/2026): un SOLO
// canale Supabase per tutta l'app invalida le query react-query quando le
// tabelle anagrafiche cambiano, così la cache lunga (staleTime 6h) resta
// corretta. Push, non polling: zero traffico quando nulla cambia.
//
// NB sala_schedule NON è qui: la pagina /turnisala ha la sua sottoscrizione
// dedicata (espande il jsonb v2 e scrive la cache IDB); /tuoturno rilegge i
// mesi cache-first a ogni switch, quindi la sua copia locale si sana da sé.
import { useEffect, useRef } from 'react'
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

/**
 * M12 — L'INVALIDAZIONE SI ANNUNCIA (23/09/2026).
 *
 * Fino a ieri un cambiamento arrivato dal server era invisibile a chi usa un
 * lettore di schermo: i dati cambiavano sotto le dita senza che niente lo
 * dicesse. `onEvento` è il gancio che lo rende udibile — lo chiama il provider
 * con un annuncio in una live region — e vive in un REF, non nelle dipendenze
 * dell'effetto: un canale realtime che si riabbona a ogni render sarebbe un
 * difetto peggiore di quello che stiamo correggendo (e Supabase non gradisce
 * callback aggiunte dopo `subscribe()`: vedi knowledge.md).
 */
export function useRealtimeInvalidation(onEvento?: (tabella: string) => void): void {
  const queryClient = useQueryClient()
  const eventoRef = useRef(onEvento)
  // Il ref si aggiorna in un EFFETTO, non durante il render: scrivere
  // `ref.current` nel corpo del componente è vietato dal lint di React (e giustamente:
  // il valore del render non è ciò che si legge poi nell'effetto).
  useEffect(() => { eventoRef.current = onEvento }, [onEvento])

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
          eventoRef.current?.(table)
        },
      )
    }

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}
