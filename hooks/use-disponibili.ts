'use client'
// Conteggio dei DISPONIBILI «D» per i badge delle card cambio (richiesta
// 25/09/2026). Il conteggio segue il VIEWER (richiesta esplicita):
//   • vista DCO (anche DCO+): noni ESCLUSI → scope 'dco';
//   • vista Noni (is_secondary): SOLO noni → scope 'noni';
//   • manager: tutto → 'tutti'.
// Sorgenti: i mesi PDF caricati (sala_schedule, una select leggera
// month+schedule) e, per i mesi senza PDF, il teorico dell'albero squadre
// (tokenForMember). Cache-first: dati piccoli, cache 6 ore come le anagrafiche.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { decodeSalaMonth, type MonthPersonShifts } from '@/lib/sala-month'
import { conteggioDisponibili, conteggioDisponibiliTeorico, type DisponibiliScope } from '@/lib/disponibili'
import { useShiftTeamTreeData, useAllDuplicateCognomi } from '@/hooks/use-users'
import { useCurrentUser } from '@/hooks/use-current-user'
import type { SalaMonthData } from '@/types/database'

const STALE_TIME = 6 * 60 * 60 * 1000

export function useDisponibiliCount(): (dateISO: string) => number {
  const tree = useShiftTeamTreeData()
  const duplicateCognomi = useAllDuplicateCognomi()
  const { profile } = useCurrentUser()
  void duplicateCognomi // riservato: il match nome dei NONI userebbe gli omonimi

  const { data: users = [] } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: async () => {
      const sb = createClient()
      const { data, error } = await sb.from('users').select('id, nome, cognome, is_secondary, is_manager, show_in_compare')
      if (error) throw error
      return data as Array<{ id: string; nome: string | null; cognome: string | null; is_secondary: boolean; is_manager: boolean; show_in_compare: boolean }>
    },
    staleTime: STALE_TIME,
  })

  const { data: pdfRaw = [] } = useQuery({
    queryKey: ['sala-schedule-all'],
    queryFn: async () => {
      const sb = createClient()
      const { data, error } = await sb.from('sala_schedule').select('month, schedule')
      if (error) throw error
      return (data ?? []) as Array<{ month: string; schedule: unknown }>
    },
    staleTime: STALE_TIME,
  })

  const scope: DisponibiliScope = profile?.is_manager
    ? 'tutti'
    : profile?.is_secondary ? 'noni' : 'dco'

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
    return (dateISO: string): number => {
      const month = dateISO.slice(0, 7)
      const day = Number(dateISO.slice(8, 10))
      if (!month || !Number.isFinite(day)) return 0
      const people = peopleByMonth.get(month)
      if (people) return conteggioDisponibili(people, day, tree, users, scope)
      return conteggioDisponibiliTeorico(tree, month, day, scope)
    }
  }, [peopleByMonth, tree, users, scope])
}
