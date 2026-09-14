'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getAppSettings, DEFAULTS as SETTINGS_DEFAULTS, type AppSettings } from '@/lib/queries/app-settings'
import { makeCacheKey } from '@/lib/cache'

const APP_SETTINGS_QUERY_KEY = ['app-settings'] as const
const CACHE_KEY = () => makeCacheKey('app-settings')

function getCached(): AppSettings | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY())
    if (!raw) return undefined
    return JSON.parse(raw).data as AppSettings
  } catch { return undefined }
}

function setCached(data: AppSettings): void {
  try { localStorage.setItem(CACHE_KEY(), JSON.stringify({ data, ts: Date.now() })) } catch {}
}

/**
 * Impostazioni app cache-first (20/09/2026): localStorage come i turni
 * (use-shifts), così /turniferie e /vacanze NON mostrano più lo skeleton
 * full-page a ogni apertura mentre aspettano min_year: al primo giro di una
 * sessione si parte dai DEFAULT, poi la query risolve e l'anno si aggancia.
 * staleTime 24h: le impostazioni cambiano quasi mai; il realtime su
 * app_settings (già in publication, migration 007) copre i cambi live.
 */
export function useAppSettings(): AppSettings {
  const { data } = useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const data = await getAppSettings(createClient())
      setCached(data)
      return data
    },
    staleTime: 24 * 60 * 60 * 1000,
    initialData: () => getCached() ?? SETTINGS_DEFAULTS,
  })
  return data
}
