import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getAppSettings, type AppSettings } from '@/lib/queries/app-settings'

export const APP_SETTINGS_QUERY_KEY = ['app-settings'] as const

export function useAppSettings(): AppSettings | undefined {
  const { data } = useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: () => getAppSettings(createClient()),
    staleTime: 5 * 60 * 1000,
  })
  return data
}
