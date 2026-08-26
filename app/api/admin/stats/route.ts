import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { ADMIN_ID } from '@/types/database'

export type StatsOverview = {
  users_total: number
  users_active: number
  access: number
  new_shift: number
  interest: number
  shifts_total: number
}

export type StatsActivityPoint = {
  week: string
  access: number
  new_shift: number
  interest: number
}

export type StatsUser = {
  id: string
  nome: string | null
  cognome: string | null
  is_secondary: boolean
  is_manager: boolean
  is_dco_plus: boolean
  access: number
  new_shift: number
  interest: number
  last_access: string | null
  shifts: number
  mattina: number
  pomeriggio: number
  notte: number
}

export type StatsShiftMode = { mode: 'Mattina' | 'Pomeriggio' | 'Notte'; count: number }

export type AdminStats = {
  overview: StatsOverview
  activity: StatsActivityPoint[]
  users: StatsUser[]
  shiftModes: StatsShiftMode[]
}

// L'aggregazione avviene in Postgres (RPC get_admin_stats): il fetch di righe
// via REST verrebbe troncato a 1000 da db-max-rows (bug storico delle stats).
export async function GET(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== ADMIN_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const raw = parseInt(searchParams.get('days') ?? '365', 10)
  const days = Number.isFinite(raw) ? Math.min(3650, Math.max(0, raw)) : 365

  const adminSupabase = createAdminSupabase()
  const { data, error } = await adminSupabase.rpc('get_admin_stats', { p_days: days })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data as AdminStats)
}
