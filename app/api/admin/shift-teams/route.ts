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

type Kind = 'type' | 'team' | 'member' | 'template'

interface MutBody {
  kind?: Kind
  id?: string
  name?: string
  cycle_days?: number
  pattern_start?: string
  is_active?: boolean
  sort_order?: number
  shift_type_id?: string
  team_id?: string
  phase_offset_days?: number
  full_name?: string
  pattern?: string[]
  /** YYYY-MM-DD: da quale giorno vale il pattern (migration 037). Assente =
   *  comportamento di sempre, il pattern base in colonna. */
  pattern_from?: string
  is_lead?: boolean
  user_id?: string | null  // lega il membro all'utente (regola bare-owner per gli omonimi)
  description?: string
  note?: string
}

export async function GET() {
  const denied = await requireAdminManager()
  if (denied) return denied
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('shift_cycle_templates')
    .select('id, shift_type_id, team_id, name, description, pattern, cycle_days, pattern_start, is_builtin')
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ templates: data ?? [] })
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
      .select('cycle_days, pattern_start')
      .eq('id', team.shift_type_id)
      .single()
    if (typeErr || !type) return NextResponse.json({ error: 'Tipologia non trovata' }, { status: 400 })
    if (body.pattern.length !== type.cycle_days) {
      return NextResponse.json(
        { error: `Il pattern deve avere ${type.cycle_days} token (ciclo della tipologia)` },
        { status: 400 },
      )
    }
    const { data: inserted, error } = await supabase.from('shift_team_members').insert({
      team_id: body.team_id,
      full_name: body.full_name,
      pattern: body.pattern,
      sort_order: body.sort_order ?? 0,
      is_active: body.is_active ?? true,
      is_lead: body.is_lead ?? false,
      user_id: body.user_id ?? null,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    // anche un membro nuovo ha il suo ciclo di base nello storico: senza, la
    // data di inizio valida sarebbe implicita e i cicli successivi avrebbero
    // un buco (migration 037).
    const { error: histErr } = await supabase.from('shift_member_patterns').upsert({
      member_id: inserted.id,
      from_date: type.pattern_start,
      pattern: body.pattern,
      note: 'ciclo di base',
    }, { onConflict: 'member_id,from_date' })
    if (histErr) return NextResponse.json({ error: histErr.message }, { status: 400 })
    return NextResponse.json({ ok: true, id: inserted.id })
  }

  if (kind === 'template') {
    if (!body.shift_type_id || !body.name || !body.pattern?.length) {
      return NextResponse.json({ error: 'shift_type_id, name e pattern richiesti' }, { status: 400 })
    }
    const { data: type } = await supabase
      .from('shift_types')
      .select('cycle_days, pattern_start')
      .eq('id', body.shift_type_id)
      .single()
    if (!type) return NextResponse.json({ error: 'Tipologia non trovata' }, { status: 400 })
    if (body.pattern.length !== type.cycle_days) {
      return NextResponse.json(
        { error: `Il pattern deve avere ${type.cycle_days} token (ciclo della tipologia)` },
        { status: 400 },
      )
    }
    const { error } = await supabase.from('shift_cycle_templates').insert({
      shift_type_id: body.shift_type_id,
      team_id: body.team_id ?? null,
      name: body.name,
      description: body.description ?? null,
      pattern: body.pattern,
      cycle_days: type.cycle_days,
      pattern_start: type.pattern_start,
      is_builtin: false,
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
    if (body.user_id !== undefined) {
      // un utente può essere legato a UN SOLO membro: evita conflitti di matching
      if (body.user_id) {
        let clash = supabase
          .from('shift_team_members')
          .select('id, full_name')
          .eq('user_id', body.user_id)
        if (id) clash = clash.neq('id', id)
        const { data: existing } = await clash.maybeSingle()
        if (existing) {
          return NextResponse.json(
            { error: `L'utente è già legato al membro "${existing.full_name}"; scollega prima quello` },
            { status: 400 },
          )
        }
      }
      patch.user_id = body.user_id
    }
    if (body.pattern !== undefined) {
      if (!body.pattern.length) return NextResponse.json({ error: 'Pattern vuoto' }, { status: 400 })
      const da = body.pattern_from
      if (da && /^\d{4}-\d{2}-\d{2}$/.test(da)) {
        // UN NUOVO CICLO IN VIGORE DA UN GIORNO (migration 037): si aggiunge una
        // riga di storico e NON si tocca la colonna, così i mesi in cui valeva
        // il ciclo precedente restano corretti. Salvare sul ciclo di base
        // (data uguale o anteriore al pattern_start) riscrive invece tutto.
        const { data: team } = await supabase.from('shift_team_members').select('team_id').eq('id', id).single()
        const { data: t } = team
          ? await supabase.from('shift_teams').select('shift_type_id').eq('id', team.team_id).single()
          : { data: null }
        const { data: type } = t
          ? await supabase.from('shift_types').select('pattern_start').eq('id', t.shift_type_id).single()
          : { data: null }
        if (type && da > type.pattern_start) {
          const { error: histErr } = await supabase.from('shift_member_patterns').upsert({
            member_id: id,
            from_date: da,
            pattern: body.pattern,
            note: body.note ?? 'ciclo aggiornato dal pannello',
          }, { onConflict: 'member_id,from_date' })
          if (histErr) return NextResponse.json({ error: histErr.message }, { status: 400 })
          const patch2 = { ...patch }
          delete patch2.pattern
          const { error } = patch2 && Object.keys(patch2).length
            ? await supabase.from('shift_team_members').update(patch2).eq('id', id)
            : { error: null }
          if (error) return NextResponse.json({ error: error.message }, { status: 400 })
          return NextResponse.json({ ok: true, pattern_dal: da })
        }
      }
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
    kind === 'type' ? 'shift_types'
    : kind === 'team' ? 'shift_teams'
    : kind === 'member' ? 'shift_team_members'
    : kind === 'template' ? 'shift_cycle_templates'
    : null
  if (!table) return NextResponse.json({ error: 'kind non valido' }, { status: 400 })

  const { error } = await supabase.from(table as 'shift_types').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}