'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/** «2026-09» → «set 2026» per i toast del batch (etichetta breve). */
function formatMonthShort(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${(MONTHS_IT[m - 1] ?? '').slice(0, 3)} ${y}`
}
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { upsertSalaLayout } from '@/lib/queries/sala-layout'
import { getSalaSchedule } from '@/lib/queries/sala-schedule'
import {
  deleteCachedSchedule,
  pruneSalaScheduleCache,
  readCachedSchedule,
  writeCachedSchedule,
} from '@/lib/sala-schedule-cache'
import { generateTheoreticalMonth, theoreticalMonthList } from '@/lib/turni-teorici'
import { useShiftTeamTreeData } from '@/hooks/use-users'
import { useCurrentUser } from '@/hooks/use-current-user'
import { SALA_LAYOUT_KEY, SALA_MONTHS_KEY, useSalaLayout, useScheduleMonths } from '@/hooks/use-sala-data'
import TurniSalaLoading from './loading'
import { buildScheduleFromMonthData, isSalaMonthData } from '@/lib/sala-month'
import { SALA_FLASH_MS, parseSalaFocus, type SalaFocus } from '@/lib/shift-tokens'
import { DeskBoard, MONTHS_IT } from '@/components/sala/desk-board'
import { ShiftCleanupDialog } from '@/components/admin/shift-cleanup-dialog'
import type { ShiftCleanupCandidate } from '@/lib/queries/shift-cleanup'
import { isAdmin as isAdminUser, type SalaLayout, type SalaSchedule, type ShiftTeamTree } from '@/types/database'

/** Il mese corrente come «2026-10»: la forma delle chiavi di sala_schedule. */
function oggiMese(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function useLandscapeLock() {
  useEffect(() => {
    const lock = async () => {
      try { await (screen.orientation as any).lock('landscape') } catch {}
    }
    lock()
    return () => { try { (screen.orientation as any).unlock() } catch {} }
  }, [])
}

export function SalaPageClient() {
  useLandscapeLock()

  // PROFILO E PERMESSI DAL CLIENT (13/10/2026): prima arrivavano come prop della
  // pagina server (`getUser` + `select` su users a ogni render). `useCurrentUser`
  // legge lo stesso profilo dalla cache — localStorage, react-query, IndexedDB —
  // ed è la fonte su cui la chrome dell'app già decide barra e badge. `isAdmin` è
  // una funzione pura dell'id (types/database), quindi non serve il server.
  const { profile, isLoading: profiloInArrivo } = useCurrentUser()
  const userId = profile?.id ?? ''
  const isAdmin = !!profile && isAdminUser(profile.id)
  const isManager = profile?.is_manager ?? false
  const userCognome = profile?.cognome ?? undefined
  const userNome = profile?.nome ?? undefined

  // PIANTINA E MESI, le due query del client (hooks/use-sala-data). La piantina
  // si richiede a OGNI apertura — è il documento condiviso che porta le card e i
  // minimi in vigore; l'elenco dei mesi decide quali mesi sono «reali» (PDF) e
  // quali teorici.
  const layoutQuery = useSalaLayout()
  const layout = layoutQuery.data
  const monthsQuery = useScheduleMonths()
  const queryClient = useQueryClient()

  const router = useRouter()
  const searchParams = useSearchParams()
  /* «Vengo da qui» (18/09/2026): la dashboard  apre questa pagina sui parametri
     m/d/t/c/n (vedi lib/shift-tokens). La richiesta è DERIVATA dalla URL — chi la
     applica in fondo è la board, che riconosce le persone coi nomi del PDF. */
  const focus: SalaFocus | null = useMemo(() => parseSalaFocus(searchParams), [searchParams])

  useEffect(() => {
    localStorage.setItem('turni-last-page', '/turnisala')
  }, [])

  const [schedule, setSchedule] = useState<SalaSchedule | null>(null)
  /* IL MESE A SCHERMO È CONFERMATO? (19/09/2026 — il caso del collega che vedeva
     «non è in sala» su persone che c'erano). La board disegna SUBITO la copia in
     IndexedDB e riconvalida in background: se quella copia è più vecchia del PDF
     (basta un ricaricamento del mese fatto dopo la sua ultima visita) il nome
     cercato può non esserci — e la board direbbe «non è in sala». `false` = mese
     dalla cache, non ancora confermato: la board aspetta a giudicare (e a far
     partire il respiro). */
  const [scheduleFresco, setScheduleFresco] = useState(true)
  /** Unico punto che mette un mese a schermo: `fresco: false` = copia locale. */
  const mettiMese = (m: SalaSchedule | null, fresco = true) => {
    setScheduleFresco(fresco)
    setSchedule(m)
  }
  const [currentMonth, setCurrentMonth] = useState<string>(oggiMese())
  /* L'ELENCO DEI MESI È UNA COSA SOLA: la query (13/10/2026).

     Prima era copiato in uno stato locale sincronizzato da un effetto, e quella
     copia nel primo render è VUOTA: chi caricava un mese in quel giro — l'arrivo
     con «vengo da qui», che parte appena la URL è leggibile — lo trovava fuori
     dall'elenco, lo scambiava per un mese TEORICO e non lo chiedeva al DB. Board
     senza persone su un mese che nel PDF c'era (visto dai test della board:
     chip gialle, flash della card, pill «SEI TU»). Ora upload, delete e realtime
     scrivono nella cache della query: chi legge vede sempre la stessa lista. */
  const availableMonths = useMemo(() => monthsQuery.data ?? [], [monthsQuery.data])
  /** L'elenco dei mesi è arrivato (cache o rete)? Finché no non si può dire che
   *  un mese è teorico: lo dice il DB, con `getSalaSchedule` che torna null. */
  const mesiNoti = monthsQuery.data !== undefined
  // `useCallback`: upload e realtime scrivono nella cache della QUERY (sotto
  // `availableMonths`), e la sottoscrizione realtime ha `aggiornaMesi` fra le sue
  // dipendenze — ricrearla a ogni render la farebbe risottoscrivere a vuoto.
  const aggiornaMesi = useCallback((updater: (prev: string[]) => string[]) => {
    queryClient.setQueryData<string[]>(SALA_MONTHS_KEY, prev => updater(prev ?? []))
  }, [queryClient])
  // I mesi NON caricati si generano dal tree: stessa funzione che la pagina
  // server applicava all'elenco dei mesi.
  const theoreticalMonths = useMemo(() => theoreticalMonthList(availableMonths), [availableMonths])
  // ALBERO SQUADRE CACHE-FIRST. Fino al 13/10/2026 partìva da un seme mandato dal
  // server dentro la pagina (e il seme serviva anche a vincere il restore su
  // IndexedDB, vedi `ilRestoreVale`: il ciclo «LONI A.» da 252 invece che da 84).
  // Senza pagina server il seme non esiste più e vale la regola del progetto per
  // i dati anagrafici: copia su IndexedDB (fino a 6 ore, poi riconvalida) chiusa
  // subito da un evento realtime. Non è una regressione di QUESTA pagina: è il
  // contratto con cui le altre pagine leggono già lo stesso albero.
  const [shiftTree, setShiftTree] = useState<ShiftTeamTree | null>(null)
  /** Un caricamento di mese è già partito (apre la pagina o cambio mese). */
  const caricamentoMeseAvviato = useRef(false)
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
  /* IL MESE SI SCEGLIE UNA VOLTA (apertura della pagina): finché non è stato
     scelto, NESSUN altro effetto può inventare un mese (vedi l'effetto del tree:
     senza questa guardia disegnava il teorico di oggi su un mese che un PDF ce
     l'ha, e l'arrivo «vengo da qui» lampeggiava lì). Il ref sta qui e non accanto
     all'effetto che lo accende perché l'effetto del tree lo legge prima. */
  const apertura = useRef(false)
  // Cleanup dei mesi rimasti in cache oltre la finestra di mantenimento: si fa
  // quando l'elenco dei mesi è noto, perché è lui a dire quali tenere. Prima ci
  // pensava il mount, con l'elenco nelle prop della pagina server.
  useEffect(() => {
    if (userId && monthsQuery.data) void pruneSalaScheduleCache(userId, monthsQuery.data)
  }, [userId, monthsQuery.data])

  // Albero squadre CACHE-FIRST: l'hook lo prende dalla copia su IndexedDB — o
  // dalla rete, se scaduta — e il realtime lo tiene aggiornato quando un admin
  // modifica squadre/cicli. Fino al 13/10/2026 il seme lo mandava il server
  // dentro la pagina; senza pagina server la finestra di scostamento è quella
  // del progetto per i dati anagrafici (≤6h, chiusa da un evento realtime): la
  // stessa con cui la dashboard legge già lo stesso albero.
  const isTheoretical = (month: string) => theoreticalMonths.includes(month)
  // Mese caricato a mano nel DB (PDF): per questi ha senso interrogare la tabella.
  // TUTTI gli altri (anche fuori dalla lista finita theoreticalMonths, che copre
  // solo mese−1..+12) sono teorici: generarli e NON sovrascriverli con il
  // risultato del fetch (che per mesi mai caricati è null = board vuota).
  const isUploaded = (month: string) => availableMonths.includes(month)

  const refreshedTree = useShiftTeamTreeData()
  useEffect(() => {
    if (!refreshedTree) return
    setShiftTree(refreshedTree)
    /* DUE GUARDIE, e servono entrambe.

       (1) `apertura`: il mese si sceglie una volta sola, e finché non è scelto
       `currentMonth` è solo «oggi» — un valore di partenza, non una decisione.
       Questo effetto disegnava il TEORICO DI OGGI su un mese che un PDF ce l'ha,
       e la board ci GIUDICA SOPRA: arrivando da una card («m=2026-08») il flash
       si accendeva su una griglia teorica, con la persona in una sezione che nel
       PDF non esiste, e un istante dopo atterrava il mese vero (visto su iOS,
       WebKit, 4 worker: la stessa spec passava da sola).

       (2) `mesiNoti`: senza l'elenco dei mesi `isUploaded` dice «no» di un mese
       che un PDF ce l'ha, e qui sotto nascerebbe di nuovo un mese inventato.
       `handleMonthChange` aspetta l'elenco prima di dire «teorico»: anche questa
       via deve aspettarlo, o l'attesa dell'altra non serve a niente.

       Resta il caso per cui l'effetto esiste: il mese è DAVVERO teorico e il
       tree arriva dopo l'apertura — lì si rigenera, ed è quello che l'utente
       deve vedere. */
    if (!apertura.current || !mesiNoti) return
    if (!scheduleRef.current && !isUploaded(currentMonthRef.current)) {
      mettiMese(generateTheoreticalMonth(currentMonthRef.current, refreshedTree, refreshedTree.adjustments))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshedTree, mesiNoti, availableMonths])

  const handleSaveLayout = async (updated: SalaLayout) => {
    const supabase = createClient()
    await upsertSalaLayout(supabase, updated, userId)
    // Chi salva è il primo che deve vederlo: la cache della piantina si aggiorna
    // qui, senza aspettare il prossimo refetch. `sala_layout` non è nel
    // publication realtime, quindi agli ALTRI dispositivi il salvataggio arriva
    // alla loro prossima apertura — come avveniva col render del server.
    queryClient.setQueryData(SALA_LAYOUT_KEY, updated)
  }

  const handleMonthChange = async (month: string) => {
    // «Un mese è già stato chiesto»: serve all'apertura della pagina, che non
    // deve rimettere sopra il mese di oggi un mese arrivato da un'altra strada
    // (l'arrivo con «vengo da qui» ha i suoi parametri nella URL).
    caricamentoMeseAvviato.current = true
    setCurrentMonth(month)
    if (mesiNoti && !isUploaded(month)) {
      // Mese teorico: si genera al volo. Se l'albero squadre non è ancora
      // arrivato, l'effetto di caricamento iniziale rigenera appena arriva.
      mettiMese(shiftTree ? generateTheoreticalMonth(month, shiftTree, shiftTree.adjustments) : null)
      return
    }
    // Elenco dei mesi non ancora noto: NON si tira a indovinare. Si chiede il
    // mese al DB — è lui a dire se esiste — e se non c'è si ricade sul teorico
    // (più sotto), che è esattamente il caso «mese mai caricato».
    // Cache-first: disegna SUBITO il mese da IndexedDB, poi riconvalida in
    // background. A caldo zero attese; se la cache non c'è la rete decide.
    let cached: SalaSchedule | null = null
    if (userId) cached = await readCachedSchedule(userId, month)
    // La copia locale NON è confermata: la board aspetta la riconvalida prima di
    // dire «non è in sala» (vedi scheduleFresco).
    if (cached) mettiMese(cached, false)
    else mettiMese(null)

    const supabase = createClient()
    try {
      const data = await getSalaSchedule(supabase, month)
      // L'utente può essere già passato a un altro mese mentre il fetch era
      // in volo: non sovrascrivere il mese attualmente a schermo.
      if (currentMonthRef.current !== month) return
      if (data) {
        // La copia in cache si scrive PRIMA di mettere il mese a schermo: così
        // «il mese che vedi» e «il mese in cache» sono la stessa cosa nello
        // stesso istante, e non esiste una finestra in cui la board mostra il
        // PDF e la cache è ancora quella vecchia (o vuota).
        if (userId) await writeCachedSchedule(userId, data)
        mettiMese(data)
      } else if (!cached && shiftTree) {
        // Mese rimosso dal DB ma non più in cache: fallback teorico.
        // NON confermato (`false`): è una PREVISIONE su un mese che il DB dà per
        // caricato (il caso tipico è un PDF cancellato da un altro dispositivo,
        // con l'elenco dei mesi ancora vecchio). Marcarla fresca la farebbe
        // GIUDICARE dalla board — «non è in sala» su una persona che nel PDF
        // c'era, la stessa famiglia di bug dell'inventato (vedi sopra).
        mettiMese(generateTheoreticalMonth(month, shiftTree, shiftTree.adjustments), false)
      }
    } catch {
      // Rete giù: la copia cache (se c'era) resta a schermo.
    }
  }

  /* APERTURA DELLA PAGINA (13/10/2026): il mese a schermo non arriva più dal
     server insieme all'HTML. Appena l'elenco dei mesi è noto si applica la
     stessa regola di prima — il mese di oggi se un PDF ce l'ha, altrimenti il
     più recente, altrimenti oggi (mese teorico) — e si carica il mese per la via
     cache-first che la pagina usa già per OGNI cambio mese: IndexedDB subito,
     rete in background, teorico dal tree se il mese non è caricato. Lo scatto è
     unico (`apertura`): da lì in poi decide l'utente. */
  useEffect(() => {
    /* Si aspetta di sapere CHI siamo: le chiavi della cache locale dei mesi sono
       per utente, e senza `userId` il mese si caricherebbe senza salvarsi (o
       senza leggersi) — su un dispositivo nuovo l'apertura non lascerebbe nulla
       in cache. Il profilo è in cache su localStorage: a un utente che torna non
       costa nessuna attesa. */
    if (apertura.current || profiloInArrivo || caricamentoMeseAvviato.current || !monthsQuery.isSuccess) return
    apertura.current = true
    const months = monthsQuery.data ?? []
    const today = oggiMese()
    // Il mese di «vengo da qui» vince: è quello per cui l'utente ha toccato la
    // card in dashboard (stessa precedenza che dava la pagina server al primo
    // mese, che ora si sceglie qui).
    const month = focus?.month ?? (months.includes(today) ? today : (months[0] ?? today))
    void handleMonthChange(month)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiloInArrivo, monthsQuery.isSuccess, monthsQuery.data, focus])

  /* Mese di destinazione di «vengo da qui»: se la card viene da un altro mese,
     la pagina lo carica (dal DB, dalla cache o generandolo se teorico). La board
     applica giorno/turno da sé: qui si sistema SOLO il mese. */
  useEffect(() => {
    if (!focus || profiloInArrivo) return
    if (focus.month === currentMonthRef.current) return
    handleMonthChange(focus.month)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, profiloInArrivo])

  /* Pulizia della URL un attimo DOPO l'evidenzia: chi ricarica o torna indietro
     non deve ritrovarsi l'arrivo da dashboard (senza il flash sarebbe una
     navigazione misteriosa). Il flash vive nello stato della board, quindi
     spegnere i parametri non lo interrompe. */
  useEffect(() => {
    if (!focus) return
    const t = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      for (const key of ['m', 'd', 't', 'c', 'n']) params.delete(key)
      router.replace(params.size > 0 ? `/turnisala?${params.toString()}` : '/turnisala')
    }, SALA_FLASH_MS + 1500)
    return () => clearTimeout(t)
  }, [focus, router, searchParams])

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
          aggiornaMesi(prev => prev.filter(m => m !== month))
          if (userId) deleteCachedSchedule(userId, month)
          if (currentMonthRef.current === month) {
            const tree = shiftTreeRef.current
            mettiMese(tree ? generateTheoreticalMonth(month, tree, tree.adjustments) : null)
          }
          return
        }
        const row = payload.new as { month?: string; schedule?: unknown; uploaded_at?: string; colored_persons?: SalaSchedule['coloredPersons'] } | null
        if (!row?.month || !row.schedule) return
        aggiornaMesi(prev => (prev.includes(row.month!) ? prev : [...prev, row.month!].sort((a, b) => b.localeCompare(a))))

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
        if (currentMonthRef.current === row.month) mettiMese(incoming)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId, aggiornaMesi])

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
      aggiornaMesi(prev =>
        [...new Set([...months, ...prev])].sort((a, b) => b.localeCompare(a)),
      )
      const first = months.sort((a, b) => a.localeCompare(b))[0]
      const data = await getSalaSchedule(supabase, first)
      if (data && userId) await writeCachedSchedule(userId, data)
      mettiMese(data)
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
    aggiornaMesi(prev => {
      const next = prev.filter(m => m !== month)
      if (currentMonth === month) {
        const fallback = next[0] ?? null
        if (fallback) {
          handleMonthChange(fallback)
        } else {
          mettiMese(null)
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

  // La piantina non è ancora arrivata (apertura a freddo): si mostra lo skeleton
  // di rotta invece di una board SENZA card — una piantina vuota direbbe che la
  // sala non ha sezioni, e DeskBoard legge `layout` una volta sola, al mount.
  // Stesso motivo per il profilo: senza sapere chi siamo la board non può
  // leggere né scrivere la sua copia locale del mese né marcare «sei tu».
  if (!layout || profiloInArrivo) return <TurniSalaLoading />

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
        focus={focus}
        scheduleFresco={scheduleFresco}
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