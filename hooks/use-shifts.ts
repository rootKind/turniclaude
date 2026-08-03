'use client'
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchShifts } from '@/lib/queries/shifts'
import { makeCacheKey } from '@/lib/cache'
import type { Shift } from '@/types/database'

export const SHIFTS_QUERY_KEY = (isSecondary: boolean, isDcoPlus = false) => ['shifts', isSecondary, isDcoPlus]

const cacheKey = (isSecondary: boolean, isDcoPlus: boolean) => makeCacheKey(`shifts-${isSecondary}-${isDcoPlus}`)

function getCached(isSecondary: boolean, isDcoPlus: boolean) {
  try {
    const raw = localStorage.getItem(cacheKey(isSecondary, isDcoPlus))
    if (!raw) return { data: undefined, ts: 0 }
    const parsed = JSON.parse(raw)
    return { data: parsed.data, ts: parsed.ts as number }
  } catch { return { data: undefined, ts: 0 } }
}

function setCached(isSecondary: boolean, isDcoPlus: boolean, data: unknown) {
  try { localStorage.setItem(cacheKey(isSecondary, isDcoPlus), JSON.stringify({ data, ts: Date.now() })) } catch {}
}

export function useShifts(isSecondary: boolean, isDcoPlus = false) {
  const queryClient = useQueryClient()
  const channelId = useRef(`shifts-realtime-${isSecondary}-${isDcoPlus}-${Math.random().toString(36).slice(2)}`)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(channelId.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_interested_users' }, () => {
        queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus) })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isSecondary, isDcoPlus, queryClient])

  return useQuery<Shift[]>({
    queryKey: SHIFTS_QUERY_KEY(isSecondary, isDcoPlus),
    queryFn: async () => {
      const data = await fetchShifts({ isSecondary, isDcoPlus })
      setCached(isSecondary, isDcoPlus, data)
      return data
    },
    staleTime: 15_000,
    initialData: () => getCached(isSecondary, isDcoPlus).data,
    initialDataUpdatedAt: () => getCached(isSecondary, isDcoPlus).ts,
  })
}
