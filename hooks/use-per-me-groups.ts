'use client'
// Dati per il gruppo «Per me» della dashboard (richiesta 25/09/2026): i mesi
// PDF decodificati e l'albero squadre GIÀ CARICATI dagli hook cache-first
// (le stesse query di use-disponibili — zero fetch in più). Il raggruppamento
// puro vive in lib/shift-compat-dashboard.ts: qui si riuniscono solo i pezzi.
// Il manager («Solo compatibili») non ha bisogno di nessuna di queste letture:
// le query partono solo quando serve anche la compatibilità.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { decodeSalaMonth, type MonthPersonShifts } from '@/lib/sala-month'
import { groupShiftsForMe, type CompatContext, type GruppoPerMe, type ShiftForCompat } from '@/lib/shift-compat-dashboard'
import { useShiftTeamTreeData, useAllDuplicateCognomi } from '@/hooks/use-users'
import { useCurrentUser } from '@/hooks/use-current-user'
import type { SalaMonthData } from '@/types/database'

const STALE_TIME = 6 * 60 * 60 * 1000

/** Elenco utenti minimo, stesso payload e STESSA CACHE di use-disponibili. */
function useAllUsersMinimal(enabled: boolean): Array<{ id: string; nome: string | null; cognome: string | null }> {
  const { data = [] } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: async () => {
      const sb = createClient()
      const { data, error } = await sb.from('users').select('id, nome, cognome, is_secondary, is_manager, show_in_compare')
      if (error) throw error
      return data as Array<{ id: string; nome: string | null; cognome: string | null; is_secondary: boolean; is_manager: boolean; show_in_compare: boolean }>
    },
    enabled,
    staleTime: STALE_TIME,
  })
  return data
}

/**
 * Raggruppa i cambi della dashboard in «Offerti da te» + «Compatibili col tuo
 * turno» (criterio notifiche `notify_shift_filter`). Con `compatibilita:
 * false` (manager: «Solo compatibili») restituisce SOLO il gruppo possessivo
 * e non tocca le fonti dei turni.
 */
export function usePerMeGroups<T extends ShiftForCompat>(
  shifts: readonly T[],
  opts?: {
    /** CHI È «MIO» oltre a `user_id === utenteId` (DCO+: anche i Noni). */
    possessivo?: (s: T) => boolean
    /** Titolo del gruppo possessivo (DCO+: «Offerti dalle tue mansioni»). */
    titoloMiei?: string
    /** false = niente compatibilità, solo possessivo (manager: «Solo compatibili»). */
    compatibilita?: boolean
    /** Di chi valutare i turni (impersonazione: diverso dall'utente loggato). */
    utenteId?: string
  },
): Array<GruppoPerMe<T>> {
  const vuoleCompatibilita = opts?.compatibilita !== false

  const tree = useShiftTeamTreeData()
  const duplicateCognomi = useAllDuplicateCognomi()
  const { profile } = useCurrentUser()
  const users = useAllUsersMinimal(vuoleCompatibilita)

  const { data: pdfRaw = [] } = useQuery({
    queryKey: ['sala-schedule-all'],
    queryFn: async () => {
      const sb = createClient()
      const { data, error } = await sb.from('sala_schedule').select('month, schedule')
      if (error) throw error
      return (data ?? []) as Array<{ month: string; schedule: unknown }>
    },
    enabled: vuoleCompatibilita,
    staleTime: STALE_TIME,
  })

  const peopleByMonth = useMemo(() => {
    const m = new Map<string, MonthPersonShifts[]>()
    for (const row of pdfRaw) {
      const raw = row.schedule as unknown
      if (raw && typeof raw === 'object' && (raw as { v?: unknown }).v === 2) {
        try { m.set(row.month, decodeSalaMonth(raw as SalaMonthData)) } catch { /* riga corrotta: salta */ }
      }
    }
    return m
  }, [pdfRaw])

  return useMemo(() => {
    const uid = opts?.utenteId ?? profile?.id ?? ''
    const possessivo = opts?.possessivo ?? ((s: T) => s.user_id === uid)
    const titolo = opts?.titoloMiei ?? 'Offerti da te'

    if (!vuoleCompatibilita) {
      const solo = shifts.filter(possessivo)
      return solo.length ? [{ titolo, shifts: solo }] : []
    }

    // NOME/COGNOME di chi valuta: dall'elenco utenti (l'impersonato non è il
    // profilo loggato); ripiego sul profilo se l'elenco non l'ha.
    const me = users.find(u => u.id === uid) ?? (uid === profile?.id ? profile : undefined)
    const ctx: CompatContext<T> = {
      effectiveUserId: uid,
      myNome: me?.nome,
      myCognome: me?.cognome,
      peopleByMonth,
      tree: tree ?? null,
      duplicateCognomi,
      users,
      possessivo,
      titoloMiei: titolo,
    }
    return groupShiftsForMe(shifts, ctx).gruppi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, profile?.id, profile?.nome, profile?.cognome, peopleByMonth, tree, duplicateCognomi, users, vuoleCompatibilita, opts?.possessivo, opts?.titoloMiei, opts?.utenteId])
}
