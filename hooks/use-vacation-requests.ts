'use client'
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getVacationRequestsWithInterests } from '@/lib/queries/vacations'

export const VACATION_REQUESTS_QUERY_KEY = (isSecondary: boolean, year: number) =>
  ['vacation_requests', isSecondary, year]

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
    queryFn: () => {
      const supabase = createClient()
      return getVacationRequestsWithInterests(supabase, isSecondary, year)
    },
    staleTime: 15_000,
  })
}
