'use client'
// I DATI CONDIVISI DI /TURNISALA E /TUOTURNO, letti DAL CLIENT (13/10/2026).
//
// Le due pagine erano le uniche rimaste «dinamiche»: un server component che
// leggeva i cookie, la piantina, i mesi, l'albero squadre e il mese a schermo —
// a ogni render, compresi i prefetch che la barra di navigazione fa da sola.
// Quelle cinque render del server erano tutte prefetch di queste due rotte
// (scripts/count-server-requests.mjs).
//
// Nessuno di questi dati ha bisogno del server: la RLS li dà in lettura a ogni
// utente autenticato (`sala_schedule_select`/`sala_layout_select`/`shift_*_select`
// sono `for select using (true)`), e il browser li chiede direttamente a
// Supabase. Con la pagina statica il prefetch serve HTML prerenderizzato, e chi
// apre la pagina trova i dati dove sono già: nella cache.
//
// FRESCHEZZA (la domanda vera di ogni cache): l'elenco dei mesi e la piantina si
// richiedono a OGNI apertura della pagina (`refetchOnMount: 'always'`), così
// valgono quello che valgono oggi — solo che li chiede il browser invece del
// server. I cambi fatti mentre l'app è aperta arrivano dal realtime
// (use-realtime-invalidation), e per /tuoturno la materia prima sono i mesi PDF.
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getSalaLayout } from '@/lib/queries/sala-layout'
import { listScheduleMonths } from '@/lib/queries/sala-schedule'
import { buildTuoturnoTheoretical, fetchTuoturnoMonths } from '@/lib/queries/tuoturno'
import { useAllUsersForNames, useShiftTeamTreeData } from '@/hooks/use-users'

/** Elenco dei mesi PDF caricati. Chiave condivisa con chi la invalida (realtime). */
export const SALA_MONTHS_KEY = ['sala-months'] as const
/** Piantina della sala. */
export const SALA_LAYOUT_KEY = ['sala-layout'] as const
/** Storia dei mesi PDF da cui si deduce il teorico di /tuoturno. */
export const TUOTURNO_MONTHS_KEY = ['tuoturno-months'] as const

/**
 * I mesi PDF caricati. Richiesto a ogni apertura di pagina: l'elenco è una
 * colonna sola e decide quali mesi sono «reali» e quali teorici — se fosse
 * vecchio, un PDF appena caricato da un altro telefono risulterebbe assente.
 */
export function useScheduleMonths() {
  return useQuery({
    queryKey: SALA_MONTHS_KEY,
    queryFn: () => listScheduleMonths(createClient()),
    staleTime: 60_000,
    refetchOnMount: 'always',
  })
}

/**
 * La piantina (card della sala, minimi, periodi). La scrive l'admin dalla stessa
 * pagina, quindi il salvataggio aggiorna anche la cache (vedi sala-page-client);
 * per gli ALTRI dispositivi vale l'ultima apertura, come oggi.
 */
export function useSalaLayout() {
  return useQuery({
    queryKey: SALA_LAYOUT_KEY,
    queryFn: () => getSalaLayout(createClient()),
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * Tutto ciò che /tuoturno non può dedurre dalla cache anagrafica già esistente:
 * la storia dei mesi PDF e il predittore che ne deriva. `ready` è il permesso di
 * disegnare: senza la storia il teorico non esiste, ma la pagina sa mostrare i
 * turni reali anche prima (vedi tuoturno-boot.tsx).
 *
 * Gli utenti (stessa query di «Turni di chi?») e l'albero squadre arrivano dagli
 * hook cache-first: `users` e `shift-team-tree` sono già su IndexedDB e il
 * realtime li invalida, quindi qui non si scaricano una seconda volta.
 */
export function useTuoturnoData() {
  const users = useAllUsersForNames()
  const tree = useShiftTeamTreeData()
  const months = useQuery({
    queryKey: TUOTURNO_MONTHS_KEY,
    queryFn: fetchTuoturnoMonths,
    // 129 KB: si scaricano a freddo e si tengono per la sessione. Mentre l'app è
    // aperta un upload li invalida via realtime (tabelle seguite in
    // use-realtime-invalidation), quindi la finestra di scostamento è zero.
    staleTime: 5 * 60_000,
  })

  const theoretical = useMemo(
    () => (months.data && tree ? buildTuoturnoTheoretical(months.data, users, tree) : null),
    [months.data, tree, users],
  )

  return {
    users,
    tree: tree ?? null,
    /** I mesi sono arrivati (cache o rete): da qui la pagina può disegnare. */
    monthsLoaded: months.data !== undefined,
    uploadedMonths: months.data?.map(m => m.month),
    personTheoretical: theoretical?.personTheoretical,
    bareOwners: theoretical?.bareOwners,
  }
}
