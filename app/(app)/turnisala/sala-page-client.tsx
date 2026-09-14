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
import { fetchShiftTeamTree } from '@/lib/queries/shift-teams'
import { generateTheoreticalMonth } from '@/lib/turni-teorici'
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
  // L'albero arriva GIÀ dal server (initialShiftTree): il refetch client è solo
  // un fallback/correzione. Prima del 15/09/2026 si partiva da null e il fetch
  // client-side poteva tornare 0 righe (RLS «authenticated» con sessione del
  // browser) lasciando la pagina senza teorico né vista «Teorico ≠ reale».
  const [shiftTree, setShiftTree] = useState<ShiftTeamTree | null>(initialShiftTree)
  const [treeError, setTreeError] = useState(false)
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

  // I dati dei turni teorici sono leggibili da tutti gli utenti autenticati:
  // la generazione dei mesi teorici avviene client-side.
  useEffect(() => {
    const supabase = createClient()
    fetchShiftTeamTree(supabase)
      .then(t => {
        setShiftTree(t)
        // Il mese corrente è teorico e non è ancora stato generato (arrivato
        // prima dell'albero squadre): rigenera ora, per QUALSIASI mese.
        if (!scheduleRef.current) {
          setSchedule(generateTheoreticalMonth(currentMonthRef.current, t, t.adjustments))
        }
      })
      .catch(() => setTreeError(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setSchedule(null)
    if (!isUploaded(month)) {
      // Mese teorico: si genera al volo. Se l'albero squadre non è ancora
      // arrivato, l'effetto di caricamento iniziale rigenera appena arriva.
      if (shiftTree) setSchedule(generateTheoreticalMonth(month, shiftTree, shiftTree.adjustments))
      return
    }
    // Mese caricato: leggi il PDF dal DB (fallback teorico se assente).
    const supabase = createClient()
    const data = await getSalaSchedule(supabase, month)
    setSchedule(data ?? (shiftTree ? generateTheoreticalMonth(month, shiftTree, shiftTree.adjustments) : null))
  }

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