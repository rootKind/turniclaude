// types/database.ts
// Derived from real schema of project 'turniclaude'
// IMPORTANT: shifts.id is bigint → number in JS (NOT string/uuid)

export type ShiftType = 'Mattina' | 'Pomeriggio' | 'Notte'

export interface UserProfile {
  id: string
  nome: string | null
  cognome: string | null
  is_secondary: boolean             // false = DCO (primary), true = Noni (secondary)
  notification_enabled: boolean | null
  notify_on_interest: boolean | null
  notify_on_new_shift: boolean | null
  created_at: string
  updated_at: string
}

export interface ShiftInterestedUser {
  shift_id: number                  // bigint → number
  user_id: string
  created_at: string | null
  user: Pick<UserProfile, 'id' | 'nome' | 'cognome' | 'is_secondary'>
}

export interface Shift {
  id: number                        // bigint → number
  user_id: string
  offered_shift: ShiftType
  shift_date: string                // YYYY-MM-DD
  requested_shifts: ShiftType[]     // max 2 items
  highlight: boolean | null
  created_at: string | null
  user: Pick<UserProfile, 'id' | 'nome' | 'cognome' | 'is_secondary'>
  shift_interested_users: ShiftInterestedUser[]
}

export interface PushSubscriptionRecord {
  id: string
  user_id: string
  subscription: object
  endpoint: string
  browser: string | null
  platform: string | null
  last_update: string | null
  created_at: string | null
}

export interface Feedback {
  id: string
  user_id: string
  categories: string
  message: string
  read: boolean | null
  created_at: string
}

export interface NotificationEntry {
  id: string
  title: string
  body: string
  timestamp: number                 // Date.now()
  shiftId?: number
  read: boolean
  type?: 'system' | 'interest' | 'new_shift'
}

// ── Vacanze ─────────────────────────────────────────────────────────────────

export type VacationPeriod = 1 | 2 | 3 | 4 | 5 | 6

export interface VacationAssignment {
  user_id: string
  base_period: VacationPeriod
  created_at: string
}

export interface VacationRequest {
  id: number
  user_id: string
  offered_period: VacationPeriod
  target_periods: VacationPeriod[]   // 1–5 items
  year: number
  created_at: string
}

// ── Costanti ─────────────────────────────────────────────────────────────────

export const ADMIN_ID = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'
export const TURNISTA_ID = '45406410-cf22-4f79-b493-b6ee766fd3d8'

export function isAdmin(userId: string) { return userId === ADMIN_ID }
export function isTurnista(userId: string) { return userId === TURNISTA_ID }
