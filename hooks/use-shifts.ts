'use client'
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchShifts } from '@/lib/queries/shifts'

export const SHIFTS_QUERY_KEY = (isSecondary: boolean) => ['shifts', isSecondary]

export function useShifts(isSecondary: boolean) {
  const queryClient = useQueryClient()
  const channelId = useRef(`shifts-realtime-${isSecondary}-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(channelId.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_interested_users' }, () => {
        queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isSecondary, queryClient])

  return useQuery({
    queryKey: SHIFTS_QUERY_KEY(isSecondary),
    queryFn: () => fetchShifts(isSecondary),
    staleTime: 15_000,
  })
}
