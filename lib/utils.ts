// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { UserProfile, ShiftType } from '@/types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Handles duplicate surnames: "Esposito A", compound "Di Napoli Nome" */
export function formatDisplayName(user: Pick<UserProfile, 'nome' | 'cognome'>): string {
  const nome = user.nome ?? ''
  const cognome = user.cognome ?? ''
  if (!cognome) return nome
  if (/^(di|de|del|della|degli|lo|la|le|d')/i.test(cognome)) {
    return [cognome, nome].filter(Boolean).join(' ')
  }
  if (cognome.toLowerCase() === 'esposito' && nome.charAt(0).toUpperCase() === 'A') {
    return 'Esposito A'
  }
  return cognome
}

/** Returns { day: "14", month: "apr" } from a YYYY-MM-DD string */
export function formatShiftDate(dateStr: string): { day: string; month: string } {
  const date = new Date(dateStr + 'T00:00:00')
  return {
    day: format(date, 'd', { locale: it }),
    month: format(date, 'MMM', { locale: it }).replace('.', ''),
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
