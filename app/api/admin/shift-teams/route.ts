import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/types/database'

export const runtime = 'nodejs'

async function requireAdminManager(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (isAdmin(user.id)) return null
  const { data: profile } = await supabase.from('users').select('is_manager').eq('id', user.id).single()
  if (profile?.is_manager) return null
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
}

type Kind = 'type' | 'team' | 'member'

interface MutBody {
  kind?: Kind
  id?: string
  name?: string
  cycle_days?: number
  pattern_start?: string
  is_active?: boolean
  sort_order?: number
  shift_type_id?: string
  phase_offset_days?: number
  team_id?: string
  full_name?: string
  pattern?: string[]
  is_lead?: boolean
}

export async function POST(req: NextRequest) {
  const denied = await requireAdminManager()
  if (denied) return denied
  const supabase = await createClient()

  const body = (await req.json()) as MutBody
  const { kind } = body

  if (kind === 'type') {
    const { error } = await supabase.from('shift_types').insert({
      name: body.name,
      cycle_days: body.cycle_days,
      pattern_start: body.pattern_start ?? '2026-07-01',
      is_active: body.is_active ?? true,
      sort_order: body.sort_order ?? 0,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (kind === 'team') {
    const { error } = await supabase.from('shift_teams').insert({
      shift_type_id: body.shift_type_id,
      name: body.name,
      phase_offset_days: body.phase_offset_days ?? 0,
      sort_order: body.sort_order ?? 0,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (kind === 'member') {
    if (!body.team_id || !body.full_name || !body.pattern?.length) {
      return NextResponse.json({ error: 'team_id, full_name e pattern richiesti' }, { status: 400 })
    }
    // la lunghezza del pattern deve coincidere col ciclo della tipologia
    const { data: team, error: teamErr } = await supabase
      .from('shift_teams')
      .select('shift_type_id')
      .eq('id', body.team_id)
      .single()
    if (teamErr || !team) return NextResponse.json({ error: 'Squadra non trovata' }, { status: 400 })
    const { data: type, error: typeErr } = await supabase
      .from('shift_types')
      .select('cycle_days')
      .eq('id', team.shift_type_id)
      .single()
    if (typeErr || !type) return NextResponse.json({ error: 'Tipologia non trovata' }, { status: 400 })
    if (body.pattern.length !== type.cycle_days) {
      return NextResponse.json(
        { error: `Il pattern deve avere ${type.cycle_days} token (ciclo della tipologia)` },
        { status: 400 },
      )
    }
    const { error } = await supabase.from('shift_team_members').insert({
      team_id: body.team_id,
      full_name: body.full_name,
      pattern: body.pattern,
      sort_order: body.sort_order ?? 0,
      is_active: body.is_active ?? true,
      is_lead: body.is_lead ?? false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'kind non valido' }, { status: 400 })
}

export async function PUT(req: NextRequest) {
  const denied = await requireAdminManager()
  if (denied) return denied
  const supabase = await createClient()

  const body = (await req.json()) as MutBody
  const { kind, id } = body
  if (!kind || !id) return NextResponse.json({ error: 'kind e id richiesti' }, { status: 400 })

  if (kind === 'type') {
    const { error } = await supabase
      .from('shift_types')
      .update({
        name: body.name,
        cycle_days: body.cycle_days,
        pattern_start: body.pattern_start,
        is_active: body.is_active,
        sort_order: body.sort_order,
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (kind === 'team') {
    const { error } = await supabase
      .from('shift_teams')
      .update({
        shift_type_id: body.shift_type_id,
        name: body.name,
        phase_offset_days: body.phase_offset_days,
        sort_order: body.sort_order,
      })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (kind === 'member') {
    const patch: Record<string, unknown> = {}
    if (body.full_name !== undefined) patch.full_name = body.full_name
    if (body.team_id !== undefined) patch.team_id = body.team_id
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order
    if (body.is_active !== undefined) patch.is_active = body.is_active
    if (body.is_lead !== undefined) patch.is_lead = body.is_lead
    if (body.pattern !== undefined) {
      if (!body.pattern.length) return NextResponse.json({ error: 'Pattern vuoto' }, { status: 400 })
      patch.pattern = body.pattern
    }
    const { error } = await supabase.from('shift_team_members').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'kind non valido' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdminManager()
  if (denied) return denied
  const supabase = await createClient()

  const kind = req.nextUrl.searchParams.get('kind') as Kind | null
  const id = req.nextUrl.searchParams.get('id')

  if (!kind || !id) return NextResponse.json({ error: 'kind e id richiesti' }, { status: 400 })

  const table =
    kind === 'type' ? 'shift_types' : kind === 'team' ? 'shift_teams' : kind === 'member' ? 'shift_team_members' : null
  if (!table) return NextResponse.json({ error: 'kind non valido' }, { status: 400 })

  const { error } = await supabase.from(table as 'shift_types').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}