import type {
  DaySchedule,
  SalaSchedule,
  ShiftAdjustment,
  ShiftTeamMember,
  ShiftTeamTree,
  ShiftTypeGroup,
} from '@/types/database'
import { applyTokenToDay } from '@/lib/shift-tokens'

// ─── date helpers (UTC, senza timezone) ──────────────────────────────────────

const DAY_MS = 86400000

export function parseDateUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((parseDateUTC(toISO) - parseDateUTC(fromISO)) / DAY_MS)
}

export function monthStartISO(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

export function addDays(iso: string, days: number): string {
  const d = new Date(parseDateUTC(iso) + days * DAY_MS)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// ─── aggiustamenti (comando shift) ───────────────────────────────────────────
// Cumulativo: per la data D contano tutti gli aggiustamenti con effective_date
// <= D. Un delta +1 sposta i turni di un giorno in avanti a partire da quella
// data (il token che era al giorno D-1 ora è al giorno D).

export function adjustmentOffset(adjustments: ShiftAdjustment[], teamId: string, dateISO: string): number {
  let offset = 0
  for (const a of adjustments) {
    if (a.effective_date > dateISO) continue
    if (a.scope === 'global' || a.team_id === teamId) offset += a.delta_days
  }
  return offset
}

// ─── token teorico per un membro in una data ─────────────────────────────────

export function tokenForMember(
  type: Pick<ShiftTypeGroup, 'cycle_days' | 'pattern_start'>,
  member: Pick<ShiftTeamMember, 'pattern'>,
  teamId: string,
  adjustments: ShiftAdjustment[],
  dateISO: string,
): string {
  const offset = adjustmentOffset(adjustments, teamId, dateISO)
  const anchor = addDays(type.pattern_start, offset)
  const idx = ((daysBetween(anchor, dateISO) % type.cycle_days) + type.cycle_days) % type.cycle_days
  return member.pattern[idx] ?? ''
}

// ─── generazione di un mese teorico ──────────────────────────────────────────

function daysInMonthISO(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function generateTheoreticalMonth(
  month: string,
  tree: Pick<ShiftTeamTree, 'types'>,
  adjustments: ShiftAdjustment[],
): SalaSchedule {
  const schedule: Record<number, DaySchedule> = {}
  const nDays = daysInMonthISO(month)
  for (let d = 1; d <= nDays; d++) schedule[d] = { sections: {}, altriPresenti: [] }

  for (const type of tree.types) {
    if (!type.is_active) continue
    for (const team of type.teams) {
      for (const member of team.members) {
        if (!member.is_active) continue
        for (let d = 1; d <= nDays; d++) {
          const dateISO = `${month}-${String(d).padStart(2, '0')}`
          const token = tokenForMember(type, member, team.id, adjustments, dateISO)
          if (!token) continue
          applyTokenToDay(schedule[d], member.full_name, token)
        }
      }
    }
  }

  return {
    month,
    schedule,
    uploaded_at: '',
    source: 'theoretical',
  }
}

// ─── mesi teorici disponibili ────────────────────────────────────────────────
// Mesi non caricati a mano, dal mese precedente fino a +12 mesi in avanti.

export function theoreticalMonthList(
  uploadedMonths: string[],
  fromMonth?: string,
  toMonth?: string,
): string[] {
  const uploaded = new Set(uploadedMonths)
  const now = new Date()
  const from = fromMonth ?? monthStartISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7)
  const to = toMonth ?? monthStartISO(new Date(now.getFullYear(), now.getMonth() + 12, 1)).slice(0, 7)

  const list: string[] = []
  let [y, m] = from.split('-').map(Number)
  while (`${y}-${String(m).padStart(2, '0')}` <= to) {
    const month = `${y}-${String(m).padStart(2, '0')}`
    if (!uploaded.has(month)) list.push(month)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return list
}