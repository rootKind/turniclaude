'use client'
import { useEffect, useRef, useState } from 'react'

/** «2026-09» → «set 2026» per i toast del batch (etichetta breve). */
function formatMonthShort(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${(MONTHS_IT[m - 1] ?? '').slice(0, 3)} ${y}`
}
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { upsertSalaLayout } from '@/lib/queries/sala-layout'
import { getSalaSchedule } from '@/lib/queries/sala-schedule'
import {
  deleteCachedSchedule,
  pruneSalaScheduleCache,
  readCachedSchedule,
  writeCachedSchedule,
} from '@/lib/sala-schedule-cache'
import { generateTheoreticalMonth } from '@/lib/turni-teorici'
import { useShiftTeamTreeData } from '@/hooks/use-users'
import { buildScheduleFromMonthData, isSalaMonthData } from '@/lib/sala-month'
import { DeskBoard, MONTHS_IT } from '@/components/sala/desk-board'
import { ShiftCleanupDialog } from '@/components/admin/shift-cleanup-dialog'
import type { ShiftCleanupCandidate } from '@/lib/queries/shift-cleanup'
import type { SalaLayout, SalaSchedule, ShiftTeamTree } from '@/types/database'

function useLandscapeLock() {
  useEffect(() => {
    const lock = async () => {
      try { await (screen.orientation as any).lock('landscape') } catch {}
    }
    lock()
    return () => { try { (screen.orientation as any).unlock() } catch {} }
  }, [])
}

interface Props {
  layout: SalaLayout
  isAdmin: boolean
  isManager?: boolean
  userId: string
  userCognome?: string
  userNome?: string
  initialSchedule: SalaSchedule | null
  initialMonth: string
  scheduleMonths: string[]
  theoreticalMonths: string[]
  /** Albero squadre precaricato dal SERVER (15/09/2026): il fetch client-side
   *  (fetchShiftTeamTree con la sessione del browser) può tornare 0 righe anche
   *  autenticato — il server lo vede invece sempre. Serve alla vista
   *  «Teorico ≠ reale» e ai mesi teorici. */
  initialShiftTree: ShiftTeamTree
}

export function SalaPageClient({
  layout,
  isAdmin,
  isManager = false,
  userId,
  userCognome,
  userNome,
  initialSchedule,
  initialMonth,
  scheduleMonths: initialMonths,
  theoreticalMonths,
  initialShiftTree,
}: Props) {
  useLandscapeLock()

  useEffect(() => {
    localStorage.setItem('turni-last-page', '/turnisala')
  }, [])

  const [schedule, setSchedule] = useState<SalaSchedule | null>(initialSchedule)
  const [currentMonth, setCurrentMonth] = useState(initialMonth)
  const [availableMonths, setAvailableMonths] = useState(initialMonths)
  // Cache-first (20/09/2026): il server renderizza il primo mese e IDB copre
  // TUTTI i cambi mese successivi. I mesi teorici restano fuori dalla cache:
  // si generano al volo dal tree (zero rete, già così).
  // L'albero arriva GIÀ dal server (initialShiftTree): il refetch client è solo
  // un fallback/correzione. Prima del 15/09/2026 si partiva da null e il fetch
  // client-side poteva tornare 0 righe (RLS «authenticated» con sessione del
  // browser) lasciando la pagina senza teorico né vista «Teorico ≠ reale».
  const [shiftTree, setShiftTree] = useState<ShiftTeamTree | null>(initialShiftTree)
  // Richieste di cambio già esaudite dai PDF appena caricati: popup di conferma.
  // Upload MULTIPLI (19/09/2026): i candidati di OGNI mese finiscono in coda;
  // il dialog li mostra uno alla volta (shift-cleanup-dialog è per un mese).
  const [cleanup, setCleanup] = useState<{ month: string; candidates: ShiftCleanupCandidate[] } | null>(null)
  const cleanupQueue = useRef<Array<{ month: string; candidates: ShiftCleanupCandidate[] }>>([])

  // Ref per rigenerare il mese teorico quando i dati delle squadre arrivano
  // (es. navigazione avvenuta prima del caricamento iniziale).
  const currentMonthRef = useRef(currentMonth)
  const scheduleRef = useRef(schedule)
  currentMonthRef.current = currentMonth
  scheduleRef.current = schedule
  // Mirror per i callback realtime (sottoscrizione montata una volta sola).
  const shiftTreeRef = useRef(shiftTree)
  shiftTreeRef.current = shiftTree
  // Cache-first: se il primo mese arriva già dalla rete SSR, la sua copia in
  // IDB va aggiornata una volta, qui al mount (evita un refetch inutile).
  // SOLO se è un mese caricato: i mesi teorici non vanno in cache (si
  // rigenerano dal tree, zero rete) — inizialeSchedule teorico = skip.
  useEffect(() => {
    if (initialSchedule && userId && initialSchedule.data) {
      writeCachedSchedule(userId, initialSchedule)
    }
    // Cleanup di mesi rimasti in cache oltre la finestra di mantenimento.
    if (userId) pruneSalaScheduleCache(userId, initialMonths)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Albero squadre CACHE-FIRST (20/09/2026): parte dall'SSR, poi l'hook lo
  // idrata/riconvalida (IDB + staleTime 6h) e il realtime lo tiene aggiornato
  // quando un admin modifica squadre/cicli — prima il client NON ricaricava
  // MAI l'albero dopo il mount.
  // Il restore da IDB può essere leggermente meno fresco dell'SSR solo se un
  // ALTRO dispositivo ha modificato le squadre mentre l'app era chiusa: la
  // finestra è ≤6h (poi riconvalida) e guarisce al primo evento realtime.
  const refreshedTree = useShiftTeamTreeData()
  useEffect(() => {
    if (!refreshedTree) return
    setShiftTree(refreshedTree)
    // Il mese corrente è teorico e non è ancora stato generato: rigenera ora.
    if (!scheduleRef.current) {
      setSchedule(generateTheoreticalMonth(currentMonthRef.current, refreshedTree, refreshedTree.adjustments))
    }
  }, [refreshedTree])

  const handleSaveLayout = async (updated: SalaLayout) => {
    const supabase = createClient()
    await upsertSalaLayout(supabase, updated, userId)
  }

  const isTheoretical = (month: string) => theoreticalMonths.includes(month)
  // Mese caricato a mano nel DB (PDF): per questi ha senso interrogare la tabella.
  // TUTTI gli altri (anche fuori dalla lista finita theoreticalMonths, che copre
  // solo mese−1..+12) sono teorici: generarli e NON sovrascriverli con il
  // risultato del fetch (che per mesi mai caricati è null = board vuota).
  const isUploaded = (month: string) => availableMonths.includes(month)

  const handleMonthChange = async (month: string) => {
    setCurrentMonth(month)
    if (!isUploaded(month)) {
      // Mese teorico: si genera al volo. Se l'albero squadre non è ancora
      // arrivato, l'effetto di caricamento iniziale rigenera appena arriva.
      setSchedule(shiftTree ? generateTheoreticalMonth(month, shiftTree, shiftTree.adjustments) : null)
      return
    }
    // Cache-first: disegna SUBITO il mese da IndexedDB, poi riconvalida in
    // background. A caldo zero attese; se la cache non c'è la rete decide.
    let cached: SalaSchedule | null = null
    if (userId) cached = await readCachedSchedule(userId, month)
    if (cached) setSchedule(cached)
    else setSchedule(null)

    const supabase = createClient()
    try {
      const data = await getSalaSchedule(supabase, month)
      // L'utente può essere già passato a un altro mese mentre il fetch era
      // in volo: non sovrascrivere il mese attualmente a schermo.
      if (currentMonthRef.current !== month) return
      if (data) {
        setSchedule(data)
        if (userId) writeCachedSchedule(userId, data)
      } else if (!cached && shiftTree) {
        // Mese rimosso dal DB ma non più in cache: fallback teorico.
        setSchedule(generateTheoreticalMonth(month, shiftTree, shiftTree.adjustments))
      }
    } catch {
      // Rete giù: la copia cache (se c'era) resta a schermo.
    }
  }

  // Realtime (20/09/2026): quando un admin pubblica/elimina un PDF, CHI è
  // già sulla pagina vede il mese aggiornarsi senza ricaricare (push, non
  // polling). Il payload `schedule` è il jsonb GREZZO della tabella — per gli
  // upload v2 è la forma COMPATTA (SalaMonthData), quindi va espanso come fa
  // getSalaSchedule. DELETE = il mese torna teorico ( replica identity di
  // default: `old` contiene la PK `month`, che basta e avanza).
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`sala-schedule-realtime-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sala_schedule' }, payload => {
        const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
        if (eventType === 'DELETE') {
          const month = (payload.old as { month?: string }).month
          if (!month) return
          setAvailableMonths(prev => prev.filter(m => m !== month))
          if (userId) deleteCachedSchedule(userId, month)
          if (currentMonthRef.current === month) {
            const tree = shiftTreeRef.current
            setSchedule(tree ? generateTheoreticalMonth(month, tree, tree.adjustments) : null)
          }
          return
        }
        const row = payload.new as { month?: string; schedule?: unknown; uploaded_at?: string; colored_persons?: SalaSchedule['coloredPersons'] } | null
        if (!row?.month || !row.schedule) return
        setAvailableMonths(prev => (prev.includes(row.month!) ? prev : [...prev, row.month!].sort((a, b) => b.localeCompare(a))))

        // Normalizzazione identica a getSalaSchedule (v2 compatta → espansa).
        const raw = row.schedule as unknown
        const expanded = (isSalaMonthData(raw)
          ? buildScheduleFromMonthData(raw)
          : raw) as SalaSchedule['schedule']
        const incoming: SalaSchedule = {
          month: row.month,
          schedule: expanded,
          uploaded_at: row.uploaded_at ?? new Date().toISOString(),
          ...(row.colored_persons ? { coloredPersons: row.colored_persons } : {}),
        }
        if (userId) writeCachedSchedule(userId, incoming)
        if (currentMonthRef.current === row.month) setSchedule(incoming)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const uploadOne = async (file: File, month: string) => {
    const fd = new FormData()
    fd.append('pdf', file)
    fd.append('month', month)
    const res = await fetch('/api/admin/parse-pdf', { method: 'POST', body: fd })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(body)
    }
    const body = (await res.json().catch(() => null)) as
      | { cleanup?: { candidates?: ShiftCleanupCandidate[] } }
      | null
    const candidates = body?.cleanup?.candidates ?? []
    return { month, candidates, schedule: null as SalaSchedule | null }
  }



  /**
   * Upload MULTIPLI (19/09/2026): esegue i caricamenti in sequenza (l'ordine
   * non conta: ogni mese è indipendente), aggiorna l'elenco dei mesi disponibili
   * e SALTA sul primo mese appena caricato. I cleanup di ogni mese vanno in
   * coda e il popup li mostra uno alla volta alla fine del batch.
   */
  const handleUploadBatch = async (items: Array<{ file: File; month: string }>) => {
    const supabase = createClient()
    const months: string[] = []
    const failures: string[] = []
    const queued: Array<{ month: string; candidates: ShiftCleanupCandidate[] }> = []
    for (const { file, month } of items) {
      try {
        const { candidates } = await uploadOne(file, month)
        months.push(month)
        if (candidates.length > 0) queued.push({ month, candidates })
      } catch (err) {
        failures.push(`${month}: ${(err as Error).message}`)
      }
    }
    if (months.length > 0) {
      setAvailableMonths(prev =>
        [...new Set([...months, ...prev])].sort((a, b) => b.localeCompare(a)),
      )
      const first = months.sort((a, b) => a.localeCompare(b))[0]
      const data = await getSalaSchedule(supabase, first)
      if (data && userId) await writeCachedSchedule(userId, data)
      setSchedule(data)
      setCurrentMonth(first)
      toast.success(`${months.length} mes${months.length === 1 ? 'e caricato' : 'i caricati'}: ${months.map(formatMonthShort).join(', ')}`)
    }
    if (failures.length > 0) {
      toast.error(`${failures.length} caricament${failures.length === 1 ? 'o fallito' : 'i falliti'}: ${failures.join(' · ')}`)
    }
    // Popup cleanup: il primo in coda adesso, gli altri a cascata alla chiusura.
    cleanupQueue.current = queued.slice(1)
    if (queued.length > 0) setCleanup(queued[0])
  }

  const handleCleanupNext = () => {
    const next = cleanupQueue.current.shift()
    setCleanup(next ?? null)
  }

  const handleColorChange = async (month: string, day: number, name: string, color: string | null) => {
    const res = await fetch('/api/admin/sala-colors', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month, day, name, color }),
    })
    if (!res.ok) return
    setSchedule(prev => {
      if (!prev) return prev
      const coloredPersons = { ...(prev.coloredPersons ?? {}) }
      const dayColors = { ...(coloredPersons[day] ?? {}) }
      if (color === null) {
        delete dayColors[name]
      } else {
        dayColors[name] = color
      }
      if (Object.keys(dayColors).length === 0) {
        delete coloredPersons[day]
      } else {
        coloredPersons[day] = dayColors
      }
      return { ...prev, coloredPersons }
    })
  }

  const handleDeleteMonth = async (month: string) => {
    const res = await fetch(`/api/admin/sala-schedule?month=${month}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(body)
    }
    // La copia locale non deve sopravvivere al mese eliminato (il realtime
    // copre gli ALTRI dispositivi; questo qui è l'origine dell'azione).
    if (userId) await deleteCachedSchedule(userId, month)
    setAvailableMonths(prev => {
      const next = prev.filter(m => m !== month)
      if (currentMonth === month) {
        const fallback = next[0] ?? null
        if (fallback) {
          handleMonthChange(fallback)
        } else {
          setSchedule(null)
          setCurrentMonth(
            (() => {
              const now = new Date()
              return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
            })()
          )
        }
      }
      return next
    })
  }

  return (
    <main className="flex flex-col min-h-[60vh]">
      <DeskBoard
        layout={layout}
        isAdmin={isAdmin}
        isManager={isManager}
        userId={userId}
        userCognome={userCognome}
        userNome={userNome}
        onSave={handleSaveLayout}
        schedule={schedule}
        currentMonth={currentMonth}
        availableMonths={availableMonths}
        theoreticalMonths={theoreticalMonths}
        shiftTree={shiftTree}
        onMonthChange={handleMonthChange}
        onUploadBatch={handleUploadBatch}
        onDeleteMonth={handleDeleteMonth}
        onColorChange={handleColorChange}
      />

      {cleanup && (
        <ShiftCleanupDialog
          open
          month={cleanup.month}
          initialCandidates={cleanup.candidates}
          onClose={handleCleanupNext}
        />
      )}
    </main>
  )
}