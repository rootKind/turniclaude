'use client'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUserStore } from '@/stores/user-store'
import { fetchCurrentUserProfile } from '@/lib/queries/users'

export function useCurrentUser() {
  const { profile, setProfile } = useUserStore()
  const query = useQuery({
    queryKey: ['current-user'],
    queryFn: fetchCurrentUserProfile,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (query.data !== undefined) setProfile(query.data)
  }, [query.data, setProfile])

  return { profile: query.data !== undefined ? query.data : profile, isLoading: query.isLoading }
}
