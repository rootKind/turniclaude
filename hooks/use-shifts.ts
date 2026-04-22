'use client'
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchShifts } from '@/lib/queries/shifts'

export const SHIFTS_QUERY_KEY = (isSecondary: boolean) => ['shifts', isSecondary]

const cacheKey = (isSecondary: boolean) => `cache:shifts-${isSecondary}`

function getCached(isSecondary: boolean) {
  try {
    const raw = localStorage.getItem(cacheKey(isSecondary))
    if (!raw) return { data: undefined, ts: 0 }
    const parsed = JSON.parse(raw)
    return { data: parsed.data, ts: parsed.ts as number }
  } catch { return { data: undefined, ts: 0 } }
}

function setCached(isSecondary: boolean, data: unknown) {
  try { localStorage.setItem(cacheKey(isSecondary), JSON.stringify({ data, ts: Date.now() })) } catch {}
}

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
    queryFn: async () => {
      const data = await fetchShifts(isSecondary)
      setCached(isSecondary, data)
      return data
    },
    staleTime: 15_000,
    initialData: () => getCached(isSecondary).data,
    initialDataUpdatedAt: () => getCached(isSecondary).ts,
  })
}
