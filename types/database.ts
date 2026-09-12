// types/database.ts
// Derived from real schema of project 'turniclaude'
// IMPORTANT: shifts.id is bigint → number in JS (NOT string/uuid)

export type ShiftType = 'Mattina' | 'Pomeriggio' | 'Notte'

export interface UserProfile {
  id: string
  nome: string | null
  cognome: string | null
  is_secondary: boolean             // false = DCO (primary), true = Noni (secondary)
  is_dco_plus: boolean              // true = DCO+ (formalmente DCO, vede anche i turni dei Noni)
  is_manager: boolean               // true = manager (neither DCO nor Noni)
  notification_enabled: boolean | null
  notify_on_interest: boolean | null
  notify_on_new_shift: boolean | null
  notify_on_vacation_interest: boolean | null
  notify_on_new_vacation: boolean | null
  notify_on_cross_shifts: boolean | null  // DCO+/Noni: notifiche dei turni dell'altro gruppo
  notify_shift_filter: boolean | null    // «nuovo turno pubblicato» solo se copribile col proprio turno
  created_at: string
  updated_at: string
}

interface ShiftInterestedUser {
  shift_id: number                  // bigint → number
  user_id: string
  created_at: string | null
  user: Pick<UserProfile, 'id' | 'nome' | 'cognome' | 'is_secondary' | 'is_dco_plus'>
}

export interface Shift {
  id: number                        // bigint → number
  user_id: string
  offered_shift: ShiftType
  shift_date: string                // YYYY-MM-DD
  requested_shifts: ShiftType[]     // max 2 items
  highlight: boolean | null
  is_pending: boolean
  created_at: string | null
  user: Pick<UserProfile, 'id' | 'nome' | 'cognome' | 'is_secondary' | 'is_dco_plus'>
  shift_interested_users: ShiftInterestedUser[]
}

export interface NotificationEntry {
  id: string
  title: string
  body: string
  timestamp: number                 // Date.now()
  shiftId?: number
  read: boolean
  type?: 'system' | 'interest' | 'new_shift' | 'vacation_interest' | 'new_vacation'
}

// ── Vacanze ─────────────────────────────────────────────────────────────────

export type VacationPeriod = 1 | 2 | 3 | 4 | 5 | 6

export interface VacationAssignment {
  user_id: string
  base_period: VacationPeriod
  created_at: string
}

export interface VacationYearOverride {
  user_id: string
  year: number
  period: VacationPeriod
  created_at: string
}

export interface VacationRequest {
  id: number
  user_id: string
  offered_period: VacationPeriod
  target_periods: VacationPeriod[]   // 1–5 items
  year: number
  is_pending: boolean
  created_at: string
}

export interface VacationRequestInterest {
  request_id: number
  user_id: string
  created_at: string
  user: Pick<UserProfile, 'id' | 'nome' | 'cognome' | 'is_secondary'>
  period_this_year: VacationPeriod   // calcolato da vacation_assignments + rotazione
}

export interface VacationRequestWithInterests extends VacationRequest {
  user: Pick<UserProfile, 'id' | 'nome' | 'cognome' | 'is_secondary'>
  vacation_request_interests: VacationRequestInterest[]
}

// ── Sala Layout ──────────────────────────────────────────────────────────────

type DeskType = 'single' | 'double'

export interface SalaLayoutDefaults {
  singleMinWidth: number
  doubleMinWidth: number
  tirocinanteWidth: number
}

export const DEFAULT_SALA_LAYOUT_DEFAULTS: SalaLayoutDefaults = {
  singleMinWidth: 80,
  doubleMinWidth: 160,
  tirocinanteWidth: 52,
}

export interface DeskCard {
  id: string
  title: string
  type: DeskType
  surnames: string[]
  tirocinanti: string[]   // 0–2 elements
  doubleLayout?: 'row' | 'col'  // double cards: names side-by-side (row) or stacked (col)
  sectionKey?: string     // explicit PDF section key; falls back to title
  row?: number            // grid row 1-4
  align?: 'left' | 'center' | 'right'  // grid column
  // legacy fields (backward compat)
  hasTirocinante?: boolean
  tirocinante?: string
  col?: number
  // display-only (not persisted): populated at render time from schedule
  surnameSlots?: Array<'T' | 'S' | 'noSlot'>
  surnameColors?: Record<string, string>
}

export interface SalaLayout {
  cards: DeskCard[]
  defaults?: SalaLayoutDefaults
}

// ── Sala Schedule (PDF import) ────────────────────────────────────────────────

export type SalaShiftType = 'M' | 'N' | 'P'

export interface SectionShiftData {
  surnames: { T: string[], S: string[], noSlot: string[] }
  tirocinanti: string[]
}

export interface DaySchedule {
  sections: Record<string, Record<SalaShiftType, SectionShiftData>>
  altriPresenti: string[]
}

/**
 * Forma compatta «colonnare» (v2) di un mese di turni reali.
 *
 * Un PDF contiene ~100 persone × ~31 giorni: salvare il nome del dipendente in
 * ogni giorno duplica i dati (~90 KB/mese). Qui invece i codici turno stanno in
 * un dizionario (`codes`) e ogni persona è due liste di indici (`d` effettivo,
 * `t` teorico) più i giorni con sfondo giallo (`y`). Stesso contenuto, ~1/6 del
 * peso, e — a differenza della v1 — CONSERVA TUTTI i codici, comprese le
 * assenze (A, RC, RM, RI, D, Sp*, ISp*, VS…).
 */
export interface SalaMonthShiftRow {
  d: number[]        // codici effettivi (indici in `codes`), uno per giorno; 0 = vuoto
  t: number[]        // codici teorici (riga base pre-stampata), uno per giorno
  y?: number[]       // giorni (1-based) con sfondo giallo = «turno da confermare»
}

export interface SalaMonthData {
  v: 2
  days: number       // giorni del mese
  codes: string[]    // dizionario dei token; codes[0] = ''
  names: string[]    // nomi canonici, in ordine di apparizione nel PDF
  rows: SalaMonthShiftRow[]
}

export interface SalaSchedule {
  month: string               // "2026-04"
  schedule: Record<number, DaySchedule>  // day 1–31 (derivato in v2)
  uploaded_at: string
  coloredPersons?: Record<number, Record<string, string>>
  source?: 'uploaded' | 'theoretical'   // theoretical = generato dai turni teorici
  data?: SalaMonthData                  // forma compatta completa (v2), se disponibile
}

// ── Turni teorici (squadre e cicli) ──────────────────────────────────────────

export interface ShiftTypeGroup {
  id: string
  name: string
  cycle_days: number
  pattern_start: string        // YYYY-MM-DD: data assoluta di pattern[0]
  is_active: boolean
  sort_order: number
}

export interface ShiftTeam {
  id: string
  shift_type_id: string
  name: string
  phase_offset_days: number
  sort_order: number
}

export interface ShiftTeamMember {
  id: string
  team_id: string
  full_name: string
  user_id: string | null
  pattern: string[]            // lunghezza = cycle_days della tipologia
  sort_order: number
  is_active: boolean
  is_lead: boolean             // true = caposquadra (compare nel nome visualizzato della squadra)
}

export interface ShiftAdjustment {
  id: string
  effective_date: string      // YYYY-MM-DD: dal giorno X (incluso) in poi
  delta_days: number          // -1 | 1
  scope: 'global' | 'team'
  team_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export interface ShiftTeamTree {
  types: Array<ShiftTypeGroup & {
    teams: Array<ShiftTeam & {
      members: ShiftTeamMember[]
    }>
  }>
  adjustments: ShiftAdjustment[]
}

// ── Costanti ─────────────────────────────────────────────────────────────────

export const ADMIN_ID = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'

export function isAdmin(userId: string) { return userId === ADMIN_ID }
export function isManager(profile: Pick<UserProfile, 'is_manager'>): boolean { return profile.is_manager }
export function isDcoPlus(profile: Pick<UserProfile, 'is_dco_plus'>): boolean { return profile.is_dco_plus }
