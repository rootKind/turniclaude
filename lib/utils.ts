// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { UserProfile, ShiftType } from '@/types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Returns today's date in Europe/Rome timezone as YYYY-MM-DD string */
export function todayRome(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'Europe/Rome' }).format(new Date())
}

/** Cognome solo; se omonimia → cognome + iniziale nome. */
export function formatDisplayName(
  user: Pick<UserProfile, 'nome' | 'cognome'>,
  duplicateCognomi?: Set<string>,
): string {
  const nome = user.nome ?? ''
  const cognome = user.cognome ?? ''
  if (!cognome) return nome
  if (duplicateCognomi?.has(cognome) && nome) return `${cognome} ${nome.charAt(0).toUpperCase()}.`
  return cognome
}

/** Costruisce il set dei cognomi che compaiono su più utenti distinti (dedup per id). */
export function buildDuplicateCognomi(users: Array<{ id?: string; cognome?: string | null }>): Set<string> {
  const seenIds = new Set<string>()
  const count = new Map<string, number>()
  for (const u of users) {
    const uid = u.id
    if (uid) {
      if (seenIds.has(uid)) continue
      seenIds.add(uid)
    }
    if (u.cognome) count.set(u.cognome, (count.get(u.cognome) ?? 0) + 1)
  }
  return new Set([...count.entries()].filter(([, n]) => n > 1).map(([c]) => c))
}

/** Returns { day: "14", month: "apr", weekday: "LUN" } from a YYYY-MM-DD string */
export function formatShiftDate(dateStr: string): { day: string; month: string; weekday: string } {
  const date = new Date(dateStr + 'T00:00:00')
  return {
    day: format(date, 'd', { locale: it }),
    month: format(date, 'MMM', { locale: it }).replace('.', ''),
    weekday: format(date, 'EEE', { locale: it }).replace('.', '').toUpperCase().slice(0, 3),
  }
}

/** Relative time: "oggi 09:12", "ieri 18:44", "2 gg fa" */
export function formatRelativeTime(timestampStr: string): string {
  const date = new Date(timestampStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  const safeDiff = Math.max(0, diffDays)
  if (safeDiff === 0) return `oggi ${format(date, 'HH:mm')}`
  if (safeDiff === 1) return `ieri ${format(date, 'HH:mm')}`
  return `${safeDiff} gg fa`
}

export type ShiftItemState = 'others' | 'own-empty' | 'own-interest' | 'highlight'

export function getShiftItemState(opts: {
  isOwn: boolean
  hasInterest: boolean
  highlight: boolean
}): ShiftItemState {
  if (opts.highlight) return 'highlight'
  if (opts.isOwn && opts.hasInterest) return 'own-interest'
  if (opts.isOwn) return 'own-empty'
  return 'others'
}

// CSS class names — these map to classes defined in globals.css
export const SHIFT_STATE_CLASSES: Record<ShiftItemState, string> = {
  'others':        'shift-state-others',
  'own-empty':     'shift-state-own-empty',
  'own-interest':  'shift-state-own-interest',
  'highlight':     'shift-state-highlight',
}

export const SHIFT_DATE_CLASSES: Record<ShiftItemState, string> = {
  'others':        'shift-date-others',
  'own-empty':     'shift-date-own-empty',
  'own-interest':  'shift-date-own-interest',
  'highlight':     'shift-date-highlight',
}

export const SHIFT_PILL_CLASSES: Record<ShiftType, string> = {
  Mattina:    'pill-mattina',
  Pomeriggio: 'pill-pomeriggio',
  Notte:      'pill-notte',
}
