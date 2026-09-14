'use client'
// Wrapper client del layout (app)/layout.tsx è un server component, quindi
// non può chiamare hook: questo componente client monta UNA volta il canale
// realtime di invalidazione globale (vedi hooks/use-realtime-invalidation.ts).
import { useRealtimeInvalidation } from '@/hooks/use-realtime-invalidation'

export function RealtimeInvalidation() {
  useRealtimeInvalidation()
  return null
}
