// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { UserProfile, ShiftType } from '@/types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Returns today's date in Europe/Rome timezone as YYYY-MM-DD string */
export function todayRome(): string {
  return new Intl.DateTimeFormat('sv', { timeZone: 'Europe/Rome' }).format(new Date())
}

const MAX_NAME_PREFIX = 3

/** Cognome solo; se omonimia → cognome + prefisso nome minimo che disambigua (1-3 lettere). */
export function formatDisplayName(
  user: Pick<UserProfile, 'nome' | 'cognome'>,
  duplicateCognomi?: Set<string>,
): string {
  const nome = user.nome ?? ''
  const cognome = user.cognome ?? ''
  if (!cognome) return nome
  if (duplicateCognomi?.has(cognome) && nome) {
    for (let len = 1; len <= MAX_NAME_PREFIX; len++) {
      const prefix = nome.substring(0, len)
      const key = `${cognome}_${prefix.charAt(0).toUpperCase()}${prefix.slice(1).toLowerCase()}`
      if (!duplicateCognomi.has(key) || len === MAX_NAME_PREFIX) {
        const display = prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase()
        return `${cognome} ${display}.`
      }
    }
  }
  return cognome
}

/** Costruisce il set dei cognomi duplicati (dedup per id).
 *  Aggiunge chiavi "Cognome_Pr" (prefisso 1-3 lettere) quando quel prefisso è ancora condiviso. */
export function buildDuplicateCognomi(users: Array<{ id?: string; cognome?: string | null; nome?: string | null }>): Set<string> {
  const seenIds = new Set<string>()
  const counts: Array<Map<string, number>> = [new Map(), new Map(), new Map(), new Map()]
  for (const u of users) {
    const uid = u.id
    if (uid) {
      if (seenIds.has(uid)) continue
      seenIds.add(uid)
    }
    if (!u.cognome) continue
    counts[0].set(u.cognome, (counts[0].get(u.cognome) ?? 0) + 1)
    const nome = u.nome ?? ''
    for (let len = 1; len <= MAX_NAME_PREFIX; len++) {
      if (nome.length < len) break
      const prefix = nome.substring(0, len)
      const key = `${u.cognome}_${prefix.charAt(0).toUpperCase()}${prefix.slice(1).toLowerCase()}`
      counts[len].set(key, (counts[len].get(key) ?? 0) + 1)
    }
  }
  const result = new Set<string>()
  for (const [cognome, n] of counts[0]) {
    if (n > 1) result.add(cognome)
  }
  for (let len = 1; len <= MAX_NAME_PREFIX; len++) {
    for (const [key, n] of counts[len]) {
      if (n > 1) result.add(key)
    }
  }
  return result
}

/** Returns { day: "14", month: "apr", weekday: "LUN" } from a YYYY-MM-DD string (Rome). */
export function formatShiftDate(dateStr: string): { day: string; month: string; weekday: string } {
  // Parse as UTC noon to avoid device-timezone drift on date-only strings
  const date = new Date(dateStr + 'T12:00:00Z')
  const parts = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return {
    day: get('day'),
    month: get('month').replace('.', ''),
    weekday: get('weekday').replace('.', '').toUpperCase().slice(0, 3),
  }
}

/** Relative time: "oggi 09:12", "ieri 18:44", "2 gg fa" (Europe/Rome dates). */
export function formatRelativeTime(timestampStr: string): string {
  const date = new Date(timestampStr)
  const fmt = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const today = todayRome()
  const thisDate = `${get('year')}-${get('month')}-${get('day')}`
  const time = `${get('hour')}:${get('minute')}`
  if (thisDate === today) return `oggi ${time}`
  // yesterday in Rome
  const y = new Date(today + 'T12:00:00Z')
  y.setUTCDate(y.getUTCDate() - 1)
  const yesterdayStr = y.toISOString().slice(0, 10)
  if (thisDate === yesterdayStr) return `ieri ${time}`
  const diffDays = Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000))
  return `${diffDays} gg fa`
}

/** "2026-04-30" → "30/04" (per notifiche/messaggi). */
export function formatDateShort(dateStr: string): string {
  const [, mm, dd] = dateStr.split('-')
  return `${dd}/${mm}`
}

export type ShiftItemState = 'others' | 'own-empty' | 'own-interest'

export function getShiftItemState(opts: {
  isOwn: boolean
  hasInterest: boolean
}): ShiftItemState {
  if (opts.isOwn && opts.hasInterest) return 'own-interest'
  if (opts.isOwn) return 'own-empty'
  return 'others'
}

// CSS class names — these map to classes defined in globals.css
export const SHIFT_STATE_CLASSES: Record<ShiftItemState, string> = {
  'others':        'shift-state-others',
  'own-empty':     'shift-state-own-empty',
  'own-interest':  'shift-state-own-interest',
}

export const SHIFT_DATE_CLASSES: Record<ShiftItemState, string> = {
  'others':        'shift-date-others',
  'own-empty':     'shift-date-own-empty',
  'own-interest':  'shift-date-own-interest',
}

export const SHIFT_PILL_CLASSES: Record<ShiftType, string> = {
  Mattina:    'pill-mattina',
  Pomeriggio: 'pill-pomeriggio',
  Notte:      'pill-notte',
}
