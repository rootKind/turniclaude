import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Client con chiave service-role: bypassa RLS. Da usare SOLO lato server
// (route API, server components) — MAI nel client browser.
let cached: SupabaseClient | null = null

export function createAdminSupabase(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return cached
}
