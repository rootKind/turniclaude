'use client'
// Anagrafiche cache-first (fase 2, 20/09/2026): utenti e albero squadre
// cambiano RARAMENTE → staleTime 6 ORE. La persistenza su IndexedDB e il
// restore all'avvio li gestisce il QueryProvider (lib/query-idb-cache.ts);
// il realtime (use-realtime-invalidation.ts) invalida ['users',…] e
// ['shift-team-tree'] sui cambi reali delle tabelle. Risultato: cold start
// disegna subito dall'IDB, navigazione a caldo zero fetch, cache sempre
// corretta senza polling.
import { useQuery } from '@tanstack/react-query'
import { fetchUsersByGroup, fetchAllUsersMinimal } from '@/lib/queries/users'
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { createClient } from '@/lib/supabase/client'
import { buildDuplicateCognomi } from '@/lib/utils'
import type { ShiftTeamTree } from '@/types/database'

const USERS_QUERY_KEY = (isSecondary: boolean) => ['users', isSecondary]

// Anagrafiche: valide 6 ore; scadute, il prossimo mount riconvalida in rete
// (stale-while-revalidate). Prima di allora: SOLO cache, zero richieste.
const STALE_TIME = 6 * 60 * 60 * 1000

/**
 * Cognomi duplicati per la lista visualizzata. Nelle viste miste
 * (DCO+ o Noni, che vedono anche i turni dell'altro gruppo) i cognomi
 * vanno calcolati su TUTTI gli utenti, non solo su una categoria.
 */
export function useDuplicateCognomi(isSecondary: boolean, isDcoPlus = false) {
  const mergedView = isDcoPlus || isSecondary
  const { data: users = [] } = useQuery({
    queryKey: mergedView ? ['users', 'all'] : USERS_QUERY_KEY(isSecondary),
    queryFn: mergedView ? fetchAllUsersMinimal : () => fetchUsersByGroup(isSecondary),
    staleTime: STALE_TIME,
  })
  return buildDuplicateCognomi(users)
}

export function useAllDuplicateCognomi() {
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: fetchAllUsersMinimal,
    staleTime: STALE_TIME,
  })
  return buildDuplicateCognomi(users)
}

/**
 * Anagrafica minima di TUTTI gli utenti (stessa query dei duplicati): serve a
 * desk-board per le INIZIALI degli omonimi («Nevano P.») dove appare il solo
 * cognome. Condivide la cache di useAllDuplicateCognomi: nessun fetch in più.
 */
export function useAllUsersForNames() {
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: fetchAllUsersMinimal,
    staleTime: STALE_TIME,
  })
  return users
}

/**
 * Albero squadre/turni teorici (shift_types + teams + members + adjustments)
 * lato CLIENT, cache-first: stessi dati della versione SSR. Le tabelle sono
 * nel publication realtime (migration 031) → l'hook useRealtimeInvalidation
 * invalida ['shift-team-tree'] quando un admin modifica squadre/cicli.
 */
export function useShiftTeamTreeData(): ShiftTeamTree | undefined {
  return useQuery({
    queryKey: ['shift-team-tree'],
    queryFn: async () => fetchShiftTeamTree(createClient()),
    staleTime: STALE_TIME,
  }).data
}
