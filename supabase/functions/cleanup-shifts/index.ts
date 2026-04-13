/**
 * cleanup-shifts Edge Function
 *
 * Automatically deletes shifts that have already occurred (shift_date is today or in the past).
 * Uses Europe/Rome timezone for date comparison.
 *
 * SETUP & INVOCATION
 * ==================
 *
 * Manual Testing:
 *   curl -X POST https://your-project.supabase.co/functions/v1/cleanup-shifts \
 *     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{}'
 *
 * Automated Cleanup (choose one option):
 *
 * OPTION A: pg_cron (via SQL)
 * - Enable pg_cron extension in Supabase Dashboard > Extensions
 * - Run the SQL in supabase/migrations/002_cleanup_cron.sql
 * - Cron: '0 23 * * *' (23:00 UTC = midnight CET winter / 22:00 UTC = midnight CEST summer)
 *
 * OPTION B: Supabase Dashboard UI
 * - Navigate to: Edge Functions > cleanup-shifts > Schedule
 * - Cron expression: 0 23 * * *
 * - Time zone: UTC
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ResponsePayload {
  deleted: number
  date: string
  error?: string
}

serve(async (req) => {
  // Only accept GET and POST
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' } as ResponsePayload),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Verify authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid Authorization header' } as ResponsePayload),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get today's date in Europe/Rome timezone
    // 'sv' (Swedish) locale provides YYYY-MM-DD format
    const todayRome = new Date().toLocaleDateString('sv-SE', {
      timeZone: 'Europe/Rome'
    })

    // Delete shifts where shift_date is strictly before today (in Rome timezone)
    const { count, error } = await supabase
      .from('shifts')
      .delete({ count: 'exact' })
      .lt('shift_date', todayRome)

    if (error) {
      console.error('Supabase deletion error:', error)
      return new Response(
        JSON.stringify({
          error: `Database error: ${error.message}`,
          date: todayRome,
          deleted: 0
        } as ResponsePayload),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const deletedCount = count ?? 0
    console.log(`Cleanup completed: deleted ${deletedCount} shifts for date ${todayRome}`)

    return new Response(
      JSON.stringify({
        deleted: deletedCount,
        date: todayRome
      } as ResponsePayload),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('cleanup-shifts error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        deleted: 0,
        date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })
      } as ResponsePayload),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
