'use client'
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUserStore } from '@/stores/user-store'
import { fetchCurrentUserProfile } from '@/lib/queries/users'

const CACHE_KEY = 'cache:user-profile'

function getCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return { data: undefined, ts: 0 }
    const parsed = JSON.parse(raw)
    return { data: parsed.data, ts: parsed.ts as number }
  } catch { return { data: undefined, ts: 0 } }
}

function setCached(data: unknown) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })) } catch {}
}

export function useCurrentUser() {
  const { profile, setProfile } = useUserStore()
  const query = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const data = await fetchCurrentUserProfile()
      setCached(data)
      return data
    },
    staleTime: 60_000,
    initialData: () => getCached().data,
    initialDataUpdatedAt: () => getCached().ts,
  })

  useEffect(() => {
    if (query.data !== undefined) setProfile(query.data)
  }, [query.data, setProfile])

  return { profile: query.data !== undefined ? query.data : profile, isLoading: query.isLoading }
}
