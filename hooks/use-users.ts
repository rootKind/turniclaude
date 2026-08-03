'use client'
import { useQuery } from '@tanstack/react-query'
import { fetchUsersByGroup, fetchAllUsersMinimal } from '@/lib/queries/users'
import { buildDuplicateCognomi } from '@/lib/utils'

const USERS_QUERY_KEY = (isSecondary: boolean) => ['users', isSecondary]

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
    staleTime: 10 * 60 * 1000,
  })
  return buildDuplicateCognomi(users)
}

export function useAllDuplicateCognomi() {
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: fetchAllUsersMinimal,
    staleTime: 10 * 60 * 1000,
  })
  return buildDuplicateCognomi(users)
}
