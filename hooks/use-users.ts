'use client'
import { useQuery } from '@tanstack/react-query'
import { fetchUsersByGroup, fetchAllUsersMinimal } from '@/lib/queries/users'
import { buildDuplicateCognomi } from '@/lib/utils'

export const USERS_QUERY_KEY = (isSecondary: boolean) => ['users', isSecondary]

export function useGroupUsers(isSecondary: boolean) {
  return useQuery({
    queryKey: USERS_QUERY_KEY(isSecondary),
    queryFn: () => fetchUsersByGroup(isSecondary),
    staleTime: 10 * 60 * 1000,
  })
}

export function useDuplicateCognomi(isSecondary: boolean) {
  const { data: users = [] } = useGroupUsers(isSecondary)
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
