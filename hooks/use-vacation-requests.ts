'use client'
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getVacationRequestsWithInterests } from '@/lib/queries/vacations'

export const VACATION_REQUESTS_QUERY_KEY = (isSecondary: boolean, year: number) =>
  ['vacation_requests', isSecondary, year]

const cacheKey = (isSecondary: boolean, year: number) => `cache:vacation-requests-${isSecondary}-${year}`

function getCached(isSecondary: boolean, year: number) {
  try {
    const raw = localStorage.getItem(cacheKey(isSecondary, year))
    if (!raw) return { data: undefined, ts: 0 }
    const parsed = JSON.parse(raw)
    return { data: parsed.data, ts: parsed.ts as number }
  } catch { return { data: undefined, ts: 0 } }
}

function setCached(isSecondary: boolean, year: number, data: unknown) {
  try { localStorage.setItem(cacheKey(isSecondary, year), JSON.stringify({ data, ts: Date.now() })) } catch {}
}

export function useVacationRequests(isSecondary: boolean, year: number) {
  const queryClient = useQueryClient()
  const channelId = useRef(
    `vacanze-realtime-${isSecondary}-${Math.random().toString(36).slice(2)}`
  )

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(channelId.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacation_requests' }, () => {
        queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vacation_request_interests' }, () => {
        queryClient.invalidateQueries({ queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year) })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isSecondary, year, queryClient])

  return useQuery({
    queryKey: VACATION_REQUESTS_QUERY_KEY(isSecondary, year),
    queryFn: async () => {
      const supabase = createClient()
      const data = await getVacationRequestsWithInterests(supabase, isSecondary, year)
      setCached(isSecondary, year, data)
      return data
    },
    staleTime: 15_000,
    initialData: () => getCached(isSecondary, year).data,
    initialDataUpdatedAt: () => getCached(isSecondary, year).ts,
  })
}
