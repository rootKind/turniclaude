'use client'
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown } from 'lucide-react'
import { it } from 'date-fns/locale'
import { format } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { toast } from 'sonner'
import type { DeskCard as DeskCardType, SalaLayout, SalaLayoutDefaults, SalaMinimoEntry, SalaSchedule, SalaShiftType, ShiftTeamTree } from '@/types/database'
import { groupAltriPresenti, type AltriGruppo } from '@/lib/altri-gruppi'
import { DEFAULT_SALA_LAYOUT_DEFAULTS } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getUploadHistory } from '@/lib/queries/sala-schedule'
import { decodeSalaMonth, scopertiDetailForDay, spiegaCodiceNonMostrato, yellowForDay, type SalaSlotKind, type ScopertoInfo, type YellowEntry } from '@/lib/sala-month'
import { SALA_SHIFTS, minValuesForDay, withMinimoEntry } from '@/lib/sala-minimi'
import type { SalaMinimoPeriod } from '@/types/database'
import { NON_SECTION_DUTIES, SALA_FLASH_MS, SALA_SHIFT_LABEL, isPresentNoSection, isShiftWorkCode, parseShiftCode, sectionTurnOf, type SalaFocus } from '@/lib/shift-tokens'
import { MinimiPanel } from './minimi-panel'
import type { UploadHistoryEntry } from '@/lib/queries/sala-schedule'
import { formatDisplayName, matchesCognome } from '@/lib/utils'
import { matchesFocusPerson, personNameMatches } from '@/lib/person-shift'
import { buildBareOwners, lookupNameDisplay, type BareOwnerMap } from '@/lib/shift-teams-matching'
import { GRUPPO_EXTRA_KEY, assentiPerTurno, normName, theoRealSectionCompare, surnameKey, type AssenteDelTurno, type TheoRealSectionCompare } from '@/lib/turni-teorici'
import { useAllDuplicateCognomi, useAllUsersForNames } from '@/hooks/use-users'
import { DeskCard } from './desk-card'
import { EditToolbar } from './edit-toolbar'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'

/** Tetto di attesa dell'evidenzia se il mese di destinazione tarda a caricare:
 *  meglio niente flash che un flash eterno (vedi l'effetto in DeskBoard). */
const SALA_FLASH_ATTESA_MAX_MS = 12_000

/** Id dell'avviso «la persona del salto non è in sala». È FISSO perché l'avviso
 *  appartiene a questa board: il toaster vive nel layout radice, quindi senza
 *  spegnerlo alla partenza un «non è in sala» sopravvive alla navigazione e si
 *  legge su un'altra pagina (segnalazione 25/09/2026: iOS, si torna indietro dal
 *  salto e il giallo compare sulla dashboard). */
const SALA_FOCUS_WARNING_ID = 'sala-focus-non-in-sala'

function DroppableCell({ id, children, isEditing }: { id: string; children: React.ReactNode; isEditing: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 transition-colors ${
        isEditing
          ? `min-h-[48px] rounded-lg border border-dashed ${isOver ? 'border-primary bg-primary/5' : 'border-border/30'}`
          : ''
      }`}
    >
      {children}
    </div>
  )
}

const KNOWN_SECTIONS = ['1', '2', '3', '4', '5', '6', '7', '8']

export const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const ALIGNS = ['left', 'center', 'right'] as const
type Align = typeof ALIGNS[number]

function getDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** «NEVANO P.» / «nevano p.» → «Nevano P.» per la visualizzazione. */
function toTitleCaseLike(s: string): string {
  return s ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s
}

function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return `${py}-${String(pm).padStart(2, '0')}`
}

function getNextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const nm = m === 12 ? 1 : m + 1
  const ny = m === 12 ? y + 1 : y
  return `${ny}-${String(nm).padStart(2, '0')}`
}

function getInitialShiftAndDay(month: string): { shift: SalaShiftType; day: number } {
  const now = new Date()
  const [y, m] = month.split('-').map(Number)
  if (now.getFullYear() !== y || now.getMonth() + 1 !== m) return { shift: 'M', day: 1 }
  const hour = now.getHours()
  const today = now.getDate()
  if (hour >= 6 && hour < 14) return { shift: 'M', day: today }
  if (hour >= 14 && hour < 22) return { shift: 'P', day: today }
  if (hour >= 22) return { shift: 'N', day: Math.min(today + 1, getDaysInMonth(month)) }
  return { shift: 'N', day: today }
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS_IT[m - 1]} ${y}`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function migrateCard(card: DeskCardType): DeskCardType {
  if (card.tirocinanti !== undefined) return card
  return {
    ...card,
    tirocinanti: card.hasTirocinante ? [card.tirocinante ?? ''] : [],
  }
}

function initCards(cards: DeskCardType[]): DeskCardType[] {
  return [...cards]
    .sort((a, b) => ((a.row ?? 0) * 100 + (a.col ?? 0)) - ((b.row ?? 0) * 100 + (b.col ?? 0)))
    .map(migrateCard)
}

interface Props {
  layout: SalaLayout
  isAdmin: boolean
  isManager?: boolean
  userId: string
  userCognome?: string
  userNome?: string
  onSave: (layout: SalaLayout) => Promise<void>
  schedule?: SalaSchedule | null
  currentMonth: string
  availableMonths: string[]
  theoreticalMonths: string[]
  /** Albero squadre: serve alla vista «Teorico ≠ reale» (solo admin). */
  shiftTree?: ShiftTeamTree | null
  onMonthChange: (month: string) => Promise<void>
  /** Upload MULTIPLI (19/09/2026): il board passa l'intero lotto confermato
   *  [{file, month}] a sala-page-client, che lo esegue in sequenza e mette in
   *  coda i cleanup di ogni mese. Un file solo è il caso particolare N=1. */
  onUploadBatch: (items: Array<{ file: File; month: string }>) => Promise<void>
  onDeleteMonth: (month: string) => Promise<void>
  onColorChange?: (month: string, day: number, name: string, color: string | null) => void
  /** «Vengo da qui» (18/09/2026): arrivo da una card di cambio in dashboard.
   *  La board apre quel GIORNO e quel TURNO e illumina per 5s la card della
   *  persona che cede il cambio; se non la trova, avvisa invece di far credere
   *  che sia un errore di navigazione. Vedi lib/shift-tokens (SalaFocus). */
  focus?: SalaFocus | null
  /** Il mese a schermo è stato CONFERMATO dalla rete (o generato dal tree)?
   *  `false` = è la copia in IndexedDB non ancora riconvalidata: può essere più
   *  vecchia del PDF, quindi non si dichiara «non è in sala» e non si fa partire
   *  il respiro su di lei (richiesta 19/09/2026 — il collega che vedeva il giallo
   *  su persone che c'erano). Default `true`: chi non lo passa si comporta come
   *  prima. */
  scheduleFresco?: boolean
}

export function DeskBoard({
  layout: initialLayout,
  isAdmin,
  isManager = false,
  userId,
  userCognome,
  userNome,
  onSave,
  schedule,
  currentMonth,
  availableMonths,
  theoreticalMonths,
  shiftTree,
  onMonthChange,
  onUploadBatch,
  onDeleteMonth,
  onColorChange,
  focus = null,
  scheduleFresco = true,
}: Props) {
  const canUpload = isAdmin || isManager
  const duplicateCognomi = useAllDuplicateCognomi()
  const [cards, setCards] = useState<DeskCardType[]>(() => initCards(initialLayout.cards))
  const [defaults, setDefaults] = useState<SalaLayoutDefaults>(
    initialLayout.defaults ?? DEFAULT_SALA_LAYOUT_DEFAULTS,
  )
  const [isEditing, setIsEditing] = useState(false)
  // MINIMI per card/turno (richiesta 15/09/2026): storia datata dentro la
  // piantina (SalaLayout.minimums). Stanno qui perché il salvataggio passa dallo
  // stesso documento della piantina — una sola scrittura, nessun rischio di
  // sovrascrivere le card mentre si salva il minimo.
  const [minimums, setMinimums] = useState<SalaMinimoEntry[]>(() => initialLayout.minimums ?? [])
  // PERIODI per singola casella (richiesta 16/09/2026, sera): «questa sezione,
  // in questo periodo, prevede N persone». Vivono nella piantina come i minimi
  // (un solo documento da salvare) e vincono sulla voce in vigore.
  const [minimumPeriods, setMinimumPeriods] = useState<SalaMinimoPeriod[]>(() => initialLayout.minimumPeriods ?? [])
  const [minPanelOpen, setMinPanelOpen] = useState(false)
  const [savedCards, setSavedCards] = useState<DeskCardType[]>(() => initCards(initialLayout.cards))
  const [savedDefaults, setSavedDefaults] = useState<SalaLayoutDefaults>(
    initialLayout.defaults ?? DEFAULT_SALA_LAYOUT_DEFAULTS,
  )
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const [selectedDay, setSelectedDay] = useState(() => getInitialShiftAndDay(currentMonth).day)
  const [selectedShift, setSelectedShift] = useState<SalaShiftType>(() => getInitialShiftAndDay(currentMonth).shift)
  /* Flash «vengo da qui» (18/09/2026): la richiesta in arrivo da dashboard. */
  const [flash, setFlash] = useState<SalaFocus | null>(null)
  const focusAppliedRef = useRef<string | null>(null)
  // Richieste di «vengo da qui» già segnalate come «persona non in sala»: l'avviso
  // si mostra una volta per navigazione, non a ogni render.
  const notFoundRef = useRef<Set<string>>(new Set())
  /* SI STA GUARDANDO LA BOARD? La board non giudica mentre la pagina è nascosta:
     su iOS il gesto di ritorno la mette in pausa e sospende i timer, quindi un
     avviso emesso in quel momento resta congelato a schermo e riemerge dove non
     c'entra (segnalazione 25/09/2026). Al ritorno visibile l'effetto rigira. */
  const [pageVisible, setPageVisible] = useState(true)
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== 'hidden')
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
  /* Ultimo arrivo da una card applicato dalla board (`consumed` = il «non tornare a
     oggi» è già stato usato una volta per quel mese). Vedi la guardia nell'effetto
     di cambio mese: serve perché il mese può arrivare DOPO la pulizia della URL. */
  const focusHonoredRef = useRef<{ month: string; consumed: boolean } | null>(null)
  const [showDayPicker, setShowDayPicker] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [showHistory, setShowHistory] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<UploadHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [deletingMonth, setDeletingMonth] = useState<string | null>(null)

  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  /* Upload MULTIPLI (19/09/2026): input accetta N PDF → /api/admin/detect-pdf-month
     deduce mese+anno da OGNI file → dialog di RIEPILOGO con correzione manuale →
     conferma → onUploadBatch. Sostituisce il vecchio flow «1 file + menù mese». */
  interface UploadRow {
    file: File
    month: string | null      // rilevato o corretto dall'admin (null = da risolvere)
    confidence: number
    error?: string
  }
  const [pendingFiles, setPendingFiles] = useState<UploadRow[] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveCardId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveCardId(null)
    const { active, over } = event
    if (!over) return
    // droppable id format: "row-{n}-align-{align}"
    const match = String(over.id).match(/^row-(\d+)-align-(.+)$/)
    if (!match) return
    const row = Number(match[1])
    const align = match[2] as 'left' | 'center' | 'right'
    const cardId = active.id as string
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, row, align } : c))
    setDirty(true)
  }, [])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const touchStartX = useRef<number | null>(null)
  const isEditingRef = useRef(isEditing)
  const totalDaysRef = useRef(getDaysInMonth(currentMonth))
  const selectedShiftRef = useRef<SalaShiftType>(selectedShift)
  const selectedDayRef = useRef<number>(selectedDay)
  // Mesi navigabili = caricati a mano + mesi teorici (non ancora caricati).
  /* Nessun limite di navigazione: il teorico si genera per QUALSIASI mese/anno.
     Restano solo i set per distinguere mese caricato vs teorico. */
  const isTheoreticalMonth = useMemo(() => new Set(theoreticalMonths), [theoreticalMonths])
  const uploadedMonthsSet = useMemo(() => new Set(availableMonths), [availableMonths])

  const currentMonthRef = useRef(currentMonth)
  const onMonthChangeRef = useRef(onMonthChange)
  const swipeMonthChangeRef = useRef(false)
  const pickerMonthChangeRef = useRef(false)

  useEffect(() => { isEditingRef.current = isEditing }, [isEditing])
  useEffect(() => { selectedShiftRef.current = selectedShift }, [selectedShift])
  useEffect(() => { selectedDayRef.current = selectedDay }, [selectedDay])
  useEffect(() => { currentMonthRef.current = currentMonth }, [currentMonth])
  useEffect(() => { onMonthChangeRef.current = onMonthChange }, [onMonthChange])

  const totalDays = getDaysInMonth(currentMonth)
  useEffect(() => { totalDaysRef.current = totalDays }, [totalDays])

  const [cy, cm] = currentMonth.split('-').map(Number)
  const currentYear = cy
  const activeDays = schedule
    ? new Set(Object.keys(schedule.schedule).map(Number))
    : null

  const [pickerMonth, setPickerMonth] = useState(() => new Date(cy, cm - 1))
  useEffect(() => { setPickerMonth(new Date(cy, cm - 1)) }, [cy, cm])

  /* Nessun limite di calendario: il teorico si genera per QUALSIASI mese/anno
     (generateTheoreticalMonth è funzione pura della data), quindi si può
     navigare ovunque, anche oltre i mesi caricati. */

  const weekdayLabel = format(new Date(cy, cm - 1, selectedDay), 'EEE', { locale: it }).replace('.', '').toUpperCase().slice(0, 3)

  const SHIFT_ORDER: SalaShiftType[] = ['N', 'M', 'P']

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (isEditingRef.current) return
      touchStartX.current = e.touches[0].clientX
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (isEditingRef.current || touchStartX.current === null) return
      const dx = e.changedTouches[0].clientX - touchStartX.current
      touchStartX.current = null
      if (Math.abs(dx) < 50) return
      const idx = SHIFT_ORDER.indexOf(selectedShiftRef.current)
      const day = selectedDayRef.current
      if (dx < 0) {
        if (idx < SHIFT_ORDER.length - 1) {
          setSelectedShift(SHIFT_ORDER[idx + 1])
        } else if (day < totalDaysRef.current) {
          setSelectedDay(day + 1)
          setSelectedShift(SHIFT_ORDER[0])
        } else {
          // LIBERO: il teorico si calcola per qualsiasi mese, niente guardia
          const next = getNextMonth(currentMonthRef.current)
          swipeMonthChangeRef.current = true
          setSelectedDay(1)
          setSelectedShift(SHIFT_ORDER[0])
          onMonthChangeRef.current(next)
        }
      } else {
        if (idx > 0) {
          setSelectedShift(SHIFT_ORDER[idx - 1])
        } else if (day > 1) {
          setSelectedDay(day - 1)
          setSelectedShift(SHIFT_ORDER[SHIFT_ORDER.length - 1])
        } else {
          // LIBERO: il teorico si calcola per qualsiasi mese, niente guardia
          const prev = getPrevMonth(currentMonthRef.current)
          const lastDay = getDaysInMonth(prev)
          swipeMonthChangeRef.current = true
          setSelectedDay(lastDay)
          setSelectedShift(SHIFT_ORDER[SHIFT_ORDER.length - 1])
          onMonthChangeRef.current(prev)
        }
      }
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (swipeMonthChangeRef.current) {
      swipeMonthChangeRef.current = false
      return
    }
    if (pickerMonthChangeRef.current) {
      pickerMonthChangeRef.current = false
      return
    }
    // ARRIVO DA UNA CARD DI CAMBIO (18/09/2026): c'è un arrivo già applicato e
    // non ancora «consumato»? Allora giorno e turno di QUEL mese li decide la
    // card: questo reset non deve toccarli né sul mese di destinazione né su
    // quello di partenza (che stiamo per lasciare).
    //
    // PERCHÉ NON BASTA GUARDARE IL MESE DELLA URL: l'arrivo si applica al mount,
    // quando il mese della card non è ancora a schermo; un attimo dopo qualcosa
    // rimette il giorno di oggi (in sviluppo React invoca gli effetti DUE volte —
    // la seconda passata del reset arriva dopo l'arrivo — e un mese lento arriva
    // quando la URL è già stata ripulita) e si finiva sul mese giusto al GIORNO
    // SBAGLIATO (9 → 19). Consumato una volta, i cambi mese tornano normali.
    const arrivo = focusHonoredRef.current && !focusHonoredRef.current.consumed
      ? focusHonoredRef.current.month
      : null
    if (arrivo) {
      if (arrivo === currentMonth) focusHonoredRef.current!.consumed = true
      return
    }
    const { shift, day } = getInitialShiftAndDay(currentMonth)
    setSelectedDay(day)
    setSelectedShift(shift)
    setShowDayPicker(false)
    // Dipendenze VOLUTE: solo il mese. L'arrivo da una card si legge dal ref
    // (`focusHonoredRef`), quindi non serve rimetterlo fra le dipendenze — e
    // mettercelo farebbe ripartire il reset quando il flash si spegne.
  }, [currentMonth])

  const updateCard = useCallback((updated: DeskCardType) => {
    setCards(prev => prev.map(c => c.id === updated.id ? updated : c))
    setDirty(true)
  }, [])

  const deleteCard = useCallback((id: string) => {
    setCards(prev => prev.filter(c => c.id !== id))
    setDirty(true)
  }, [])

  const addCard = useCallback((type: 'single' | 'double') => {
    const newCard: DeskCardType = {
      id: crypto.randomUUID(),
      title: type === 'single' ? 'Scrivania' : 'Scrivania doppia',
      type,
      surnames: type === 'single' ? [''] : ['', ''],
      tirocinanti: [],
      row: 1,
      align: 'left',
    }
    setCards(prev => [...prev, newCard])
    setDirty(true)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      // I periodi per casella vanno SEMPRE insieme alla piantina: il salvataggio
      // sostituisce l'intero jsonb, quindi ometterli li cancellerebbe.
      await onSave({ cards, defaults, minimums, minimumPeriods })
      setSavedCards(cards)
      setSavedDefaults(defaults)
      setDirty(false)
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  /**
   * Salva una nuova fotografia dei minimi valida dal giorno `from` e DAL TURNO
   * `fromShift` in poi (richieste 15/09 e 16/09/2026). Passa dallo stesso onSave
   * della piantina, ma scrive i CARD SALVATI (`savedCards`/`savedDefaults`): se
   * l'admin ha in corso una modifica della piantina non ancora confermata, aprire
   * i minimi e salvare non deve pubblicarla di nascosto.
   */
  const handleSaveMinimums = useCallback(async (
    values: Record<string, number>,
    from: string,
    fromShift: SalaShiftType,
    periods: SalaMinimoPeriod[],
  ) => {
    const next = withMinimoEntry(minimums, {
      from,
      fromShift,
      values,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    await onSave({ cards: savedCards, defaults: savedDefaults, minimums: next, minimumPeriods: periods })
    setMinimums(next)
    setMinimumPeriods(periods)
    setMinPanelOpen(false)
    toast.success(fromShift === 'M'
      ? `Minimi aggiornati dal ${from}`
      : `Minimi aggiornati dal ${from}, turno ${fromShift}`)
  }, [minimums, onSave, savedCards, savedDefaults, userId])

  const handleCancel = () => {
    setCards(savedCards)
    setDefaults(savedDefaults)
    setDirty(false)
    setIsEditing(false)
  }

  /* Pannello «Minimi per card» (solo admin, richiesta 15/09/2026): evento
     `sala-admin-minimi` dal mini-Fab della bottom-nav, come le altre azioni
     admin di /turnisala. */
  useEffect(() => {
    if (!isAdmin) return
    const onMinimi = () => setMinPanelOpen(true)
    document.addEventListener('sala-admin-minimi', onMinimi)
    return () => { document.removeEventListener('sala-admin-minimi', onMinimi) }
  }, [isAdmin])

  const handleChangeDefaults = useCallback((d: SalaLayoutDefaults) => {
    setDefaults(d)
    setDirty(true)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    e.target.value = ''
    const pdfs = files.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf')
    const rejected = files.length - pdfs.length
    if (rejected > 0) toast.info(`${rejected} file ignorati (solo PDF)`)
    if (pdfs.length === 0) return
    setAnalyzing(true)
    setPendingFiles(pdfs.map(f => ({ file: f, month: null, confidence: 0 })))
    const fd = new FormData()
    for (const f of pdfs) fd.append('files', f)
    fetch('/api/admin/detect-pdf-month', { method: 'POST', body: fd })
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Rilevamento fallito')
        return res.json() as Promise<{ results: Array<{ fileName: string; month: string | null; confidence: number; error?: string }> }>
      })
      .then(({ results }) => {
        const byName = new Map(results.map(r => [r.fileName, r]))
        setPendingFiles(pdfs.map(f => {
          const r = byName.get(f.name)
          return { file: f, month: r?.month ?? null, confidence: r?.confidence ?? 0, error: r?.error }
        }))
      })
      .catch(err => {
        toast.error('Errore rilevamento: ' + (err as Error).message)
        setPendingFiles(null)
      })
      .finally(() => setAnalyzing(false))
  }

  const confirmUploadBatch = async () => {
    const items = pendingFiles?.filter((r): r is UploadRow & { month: string } => !!r.month) ?? []
    if (items.length === 0) return
    setPendingFiles(null)
    setUploading(true)
    try {
      await onUploadBatch(items.map(it => ({ file: it.file, month: it.month })))
    } catch (err) {
      toast.error('Errore upload: ' + (err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const openHistory = useCallback(async () => {
    setShowHistory(true)
    setHistoryLoading(true)
    try {
      const supabase = createClient()
      const entries = await getUploadHistory(supabase)
      setHistoryEntries(entries)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!canUpload) return
    const onUploadEvt = () => fileInputRef.current?.click()
    const onHistory = () => openHistory()
    document.addEventListener('sala-admin-upload', onUploadEvt)
    document.addEventListener('sala-admin-history', onHistory)
    return () => {
      document.removeEventListener('sala-admin-upload', onUploadEvt)
      document.removeEventListener('sala-admin-history', onHistory)
    }
  }, [canUpload, openHistory])

  useEffect(() => {
    if (!isAdmin) return
    const onEdit = () => setIsEditing(true)
    document.addEventListener('sala-admin-edit', onEdit)
    return () => { document.removeEventListener('sala-admin-edit', onEdit) }
  }, [isAdmin])

  /* Vista «Teorico ≠ reale» (solo admin, 15/09/2026): arricchisce le card della
     sezione con le persone che secondo il TEORICO dovevano stare lì quel
     giorno/turno ma nel PDF reale risultano in un'altra sezione, in un altro
     turno o mancanti. Toggle via mini-Fab (evento sala-admin-theodiff): si
     SPEGNE da solo cambiando giorno/turno/mese o uscendo dalla modalità. */
  const [showTheoDiff, setShowTheoDiff] = useState(false)
  useEffect(() => {
    if (!isAdmin) return
    const onTheoDiff = () => setShowTheoDiff(v => !v)
    document.addEventListener('sala-admin-theodiff', onTheoDiff)
    return () => { document.removeEventListener('sala-admin-theodiff', onTheoDiff) }
  }, [isAdmin])
  // NOTA: niente auto-spegnimento al cambio giorno/turno/mese — il ricalcolo è
  // automatico (useMemo su giorno/turno/mese) e nei mesi TEORICI la vista resta
  // comunque inerte (theoDiffEnabled richiede un mese caricato da PDF).
  // Un reset sui cambi di contesto, invece, LA SPEGNEVA mentre l'admin navigava
  // (es. toccata la chip M dopo l'attivazione) — controsenso: è una modalità.

  const handleDeleteMonth = async (month: string) => {
    setDeletingMonth(month)
    try {
      await onDeleteMonth(month)
      toast.success(`Dati di ${formatMonthLabel(month)} eliminati`)
    } catch (err) {
      toast.error('Errore eliminazione: ' + (err as Error).message)
    } finally {
      setDeletingMonth(null)
    }
  }

  /* Vista «Teorico ≠ reale» (solo admin): attiva SOLO su mesi caricati da PDF
     (il confronto è teorico vs reale) con l'albero squadre disponibile.
     CONFRONTO COMPATTO (17/09/2026): per ogni sezione del teorico, le righe
     «nome + stato reale» (il teorico NON si riscrive: lo mostra già la card —
     assenze col CODICE PDF: A/AG/F.E.…) e le «Nuovi» (reali di provenienza
     diversa: altro turno, riposo, non in scheda).
     Niente più strisce «≠»/«←»: tropo largo su schermo stretto. */
  const theoDiffEnabled = !!(isAdmin && showTheoDiff && shiftTree && schedule && schedule.source !== 'theoretical')
  const usersForNames = useAllUsersForNames()
  // Omonimi e righe NUDE (caso NEVANO P./G.): di chi è «NEVANO» lo decide il
  // ROSTER — l'unico collega IN TURNO con quel cognome (Giuseppe è fuori dai
  // turni, quindi non rende ambiguo il cognome di Pietro). Il membro legato serve
  // per l'INIZIALE, e l'identità basta quando l'iniziale non c'è. Mappa calcolata
  // una volta per albero+anagrafica.
  const bareOwners: BareOwnerMap = useMemo(
    () => buildBareOwners(shiftTree, duplicateCognomi, usersForNames),
    [shiftTree, duplicateCognomi, usersForNames],
  )
  // Iniziali negli OMONIMI (richiesta 14/09/2026): dove appare il solo cognome
  // (card, altri presenti, righe teorico≠reale) i Nevano diventano «Nevano P.»
  // / «Nevano G.». La mappa copre le TRE forme con cui un nome può comparire:
  // «nevano pietro» (nome completo), «nevano» (bare, SOLO se proprietario
  // unico del bare) e «nevano p.» (iniziale) → tutte → «Nevano P.».
  const nameDisplay = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of usersForNames) {
      if (!u.cognome) continue
      if (!duplicateCognomi.has(u.cognome)) continue
      const display = formatDisplayName(u, duplicateCognomi)
      if (u.nome) map.set(`${u.cognome} ${u.nome}`.toLowerCase().replace(/\s+/g, ' ').trim(), display)
      // Forma bare: SOLO il proprietario del bare può rivendicarla (con due
      // proprietari la bare resterebbe ambigua: nessuna voce).
      const owner = bareOwners.get(u.cognome.toLowerCase().replace(/\s+/g, ' ').trim())
      const nome = u.nome ?? ''
      if (owner && owner.initial && nome.toLowerCase().startsWith(owner.initial)) {
        map.set(u.cognome.toLowerCase().replace(/\s+/g, ' ').trim(), display)
      }
      // Forma con iniziale «nevano p.»
      if (u.nome) map.set(`${u.cognome} ${u.nome.charAt(0).toLowerCase()}.`.toLowerCase().replace(/\s+/g, ' ').trim(), display)
    }
    return map
  }, [usersForNames, duplicateCognomi, bareOwners])
  const displayForPdfName = useCallback(
    (pdfName: string): string => {
      const resolved = lookupNameDisplay(pdfName, nameDisplay)
      return resolved ?? toTitleCaseLike(pdfName)
    },
    [nameDisplay],
  )
  /**
   * «QUESTO NOME È IL MIO» (richiesta 16/09/2026): un solo predicato per tutto
   * ciò che la board scrive di una persona — nomi in card, chip gialle,
   * tirocinanti, righe teorico≠reale, pill delle «altre presenze» e degli
   * assenti. Usa matchesCognome (omonimi compresi) come l'evidenzia della card,
   * così grassetto e bordo spesso cadono esattamente dove cade l'evidenzia.
   */
  const isOwn = useCallback(
    (name: string) => matchesCognome([name], userCognome, userNome, duplicateCognomi, bareOwners),
    [userCognome, userNome, duplicateCognomi, bareOwners],
  )
  // Codici PDF del giorno (mese v2) per le persone NON in sezione — assenze/
  // riposi COME NEL PDF («A», «AG7», «F.E.», «VS»…). Serve al teorico≠reale E
  // al blocco «Assenti»: memo condivisa, un solo decode per giorno.
  const realCodesForDay: Map<string, string> | undefined = useMemo(() => {
    if (!schedule?.data) return undefined
    const map = new Map<string, string>()
    for (const p of decodeSalaMonth(schedule.data)) {
      const code = p.days[selectedDay - 1] ?? ''
      if (!code) continue
      const key = surnameKey(p.name)
      if (key && !map.has(key)) map.set(key, code)
      map.set(normName(p.name), code)
    }
    return map
  }, [schedule, selectedDay])
  // Persone con CELLA GIALLA del PDF quel giorno (v3, 25/09/2026): set di
  // nomi normalizzati per ESCLUDERE i gialli da righe rosse del teorico≠reale,
  // extra di gruppo e blocco Assenti — il pallino giallo sulla card teorica
  // li rappresenta già. Definita PRIMA dei suoi consumatori.
  const yellowPeople = useMemo(() => {
    const set = new Set<string>()
    if (isEditing || !schedule?.data) return set
    // TUTTI i gialli del giorno (non solo quelli classificati): l'esclusione
    // da gruppi/Assenti/teorico≠reale riguarda la CELLA del PDF, che esiste
    // anche quando il classificatore non ne deduce un ruolo.
    for (const p of decodeSalaMonth(schedule.data)) {
      if (p.yellow.includes(selectedDay)) set.add(normName(p.name))
    }
    return set
  }, [schedule, selectedDay, isEditing])
  const theoCompareBySection = useMemo(() => {
    if (!theoDiffEnabled || !shiftTree || !schedule) return new Map<string, TheoRealSectionCompare>()
    const day = schedule.schedule[selectedDay]
    return theoRealSectionCompare(currentMonth, selectedDay, shiftTree, shiftTree.adjustments, day, realCodesForDay, bareOwners, duplicateCognomi, yellowPeople)
  }, [theoDiffEnabled, shiftTree, schedule, selectedDay, currentMonth, realCodesForDay, bareOwners, duplicateCognomi, yellowPeople])
  // Confronto per CARD: la card guarda la sua sezione collegata (sectionKey o titolo).
  const theoCompareByCardId = useMemo(() => {
    const map = new Map<string, TheoRealSectionCompare>()
    if (!theoDiffEnabled) return map
    for (const card of cards) {
      const cmp = theoCompareBySection.get(`${card.sectionKey ?? card.title}|${selectedShift}`)
      if (cmp && (cmp.rows.length || cmp.extras.length)) map.set(card.id, cmp)
    }
    return map
  }, [theoDiffEnabled, cards, theoCompareBySection, selectedShift])

  // Extra di GRUPPO del teorico≠reale (23/09/2026): bucket riservato
  // GRUPPO_EXTRA_KEY — reali presenti SOLO nelle «altre presenti» (trasferte,
  // corsi…) che il teorico non prevedeva lì. Ordinati per tipologia, lo stesso
  // ordine dei gruppi sotto. Il codice PDF del reale arriva nel «Nuovi» da
  // altriPresentiTokens (24/09).
  // Provenienza teorica dei «Nuovi» di gruppo (24/09/2026): niente riga
  // «Nuovi:» separata — quando il teorico≠reale è attivo, l'annotazione
  // «da <token>» appare DIRETTAMENTE sulla pill del gruppo corrispondente
  // (chiave = nome normalizzato), evitando di riscrivere le persone.
  const gruppoProvenienza = useMemo(() => {
    const bucket = theoCompareBySection.get(GRUPPO_EXTRA_KEY)
    if (!bucket) return undefined
    const m = new Map<string, string>()
    for (const e of bucket.extras) {
      const k = normName(e.name)
      if (e.theo && !m.has(k)) m.set(k, e.theo)
    }
    return m
  }, [theoCompareBySection])

  // CELLE GIALLE del PDF (richiesta 24/09/2026 v2): niente blocco a fondo
  // card — ogni giallo viene SPARSO dentro l'elenco persone della card:
  //  - già presente nell'elenco → EVIDENZIATO (testo giallo)
  //  - assente dall'elenco → AGGIUNTO in coda (testo giallo + codice)
  // Per persona/codice, così la card sa quali nomi marcari in giallo.
  // Solo mesi v2 (le gialle stanno nei dati compatti); teorico≠reale non serve.
  const yellowByCard = useMemo(() => {
    const map = new Map<string, Map<string, YellowEntry>>()
    if (isEditing || !schedule?.data) return map
    // v8: SOLO le celle gialle del PDF generano la chip (richiesta 26/09:
    // «solo quelle gialle devono essere segnalate»); la destinazione unica
    // resta (Di Meo 25/9: chip solo sulla notte).
    const perSection = yellowForDay(decodeSalaMonth(schedule.data), selectedDay)
    if (!perSection.size) return map
    const shift = selectedShift
    for (const card of cards) {
      const key = `${card.sectionKey ?? card.title}|${shift}`
      const entries = perSection.get(key)
      if (!entries?.length) continue
      const byNorm = new Map<string, YellowEntry>()
      for (const y of entries) byNorm.set(normName(y.name), y)
      map.set(card.id, byNorm)
    }
    return map
  }, [schedule, selectedDay, selectedShift, cards, isEditing])

  // NOMI DEI GIALLI per card, chiave = card.id (richiesta 27/09/2026): servono
  // all'EVIDENZIA della card del dipendente loggato. Un giallo RICHIEDENTE ha
  // reale di assenza/corso (A, SpCA…), quindi NON compare più fra i cognomi
  // della sezione: senza questi nomi la sua card non si evidenzierebbe
  // (verificato: BARRA il 24/9, cognomi DCCM = [SENATORE]).
  const yellowNamesByCard = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const [cardId, entries] of yellowByCard) map.set(cardId, [...entries.values()].map(y => y.name))
    return map
  }, [yellowByCard])

  // Data del giorno a schermo («YYYY-MM-DD»): governa quale voce di storia dei
  // minimi è in vigore (lib/sala-minimi).
  const dayISO = `${currentMonth}-${String(selectedDay).padStart(2, '0')}`

  // MINIMI in vigore nel giorno a schermo, per il turno scelto: chiave
  // «cardKey|TURNO». `null` = non configurati → vale solo la causa gialla.
  const minByKey = useMemo(
    () => minValuesForDay({ minimums, minimumPeriods }, cards, dayISO, selectedShift),
    [minimums, minimumPeriods, cards, dayISO, selectedShift],
  )

  // OGGI in ISO locale: separa il PASSATO (una card scoperta è un fatto, non un
  // allarme) dal presente/futuro.
  const todayISO = useMemo(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  }, [])
  const giornoPassato = dayISO < todayISO

  // POSTI previsti dalla PIANTINA su ogni card, chiave «sezione|TURNO»: servono a
  // dire QUALE posto è vuoto (titolare o sussidio) quando la causa è il minimo e
  // il teorico non nomina nessuno (caso ROTONDO, teorico di soli G).
  const expectedSlots = useMemo(() => {
    const out = new Map<string, SalaSlotKind[]>()
    for (const card of cards) {
      // Doppia → titolare + sussidio; singola → posto SENZA slot (nel PDF le
      // singole sono codici nudi: «M8», «PDCIF»), che si scrive come un nome.
      const slots: SalaSlotKind[] = card.type === 'double' ? ['T', 'S'] : ['noSlot']
      for (const s of SALA_SHIFTS) out.set(`${card.sectionKey ?? card.title}|${s}`, slots)
    }
    return out
  }, [cards])

  // CARD SCOPERTE (richieste 27/09 e 15/09/2026): quante PERSONE MANCANO su ogni
  // card → una chip gialla «— scoperto» ciascuna. Due cause che si sommano:
  // (1) le reali sono meno del MINIMO previsto per sezione e turno — è il caso
  // ROTONDO, che la vecchia regola non vedeva perché il suo teorico è una serie
  // di G (nessuna cella gialla, ma la card perde comunque una persona);
  // (2) un giallo ha spostato la persona altrove e nessuno l'ha rimpiazzata (la
  // chip sta sulla card di DESTINAZIONE). Il numero non somma le due letture: la
  // stessa persona verrebbe contata due volte — si prende il massimo.
  const scoperti = useMemo(() => {
    const out = new Map<string, ScopertoInfo>()
    if (isEditing || !schedule?.data) return out
    const perKey = scopertiDetailForDay(decodeSalaMonth(schedule.data), selectedDay, minByKey, expectedSlots)
    if (!perKey.size) return out
    for (const card of cards) {
      const info = perKey.get(`${card.sectionKey ?? card.title}|${selectedShift}`)
      if (info) out.set(card.id, info)
    }
    return out
  }, [schedule, selectedDay, selectedShift, cards, isEditing, minByKey, expectedSlots])

  // CARD in cui lo SCOPERTO si scrive come un nome invece che con la chip gialla
  // (richiesta 16/09/2026, sera): nei GIORNI PASSATI — quando l'assenza è ormai
  // un fatto — e dove il minimo in vigore per quella casella è 0, cioè la
  // sezione è scoperta DA PROGRAMMA. Con minimo 0 e nessuno mancante non compare
  // niente: il testo esce solo quando una persona manca davvero.
  const scopertoAsText = useMemo(() => {
    const out = new Set<string>()
    for (const card of cards) {
      const key = `${card.sectionKey ?? card.title}|${selectedShift}`
      if (giornoPassato || minByKey?.get(key) === 0) out.add(card.id)
    }
    return out
  }, [cards, selectedShift, minByKey, giornoPassato])

  // PRESENZE REALI per card, sui TRE turni del giorno a schermo: il pannello dei
  // minimi le mostra accanto a ogni valore, così si vede subito dove si buca.
  const realiPerCard = useMemo(() => {
    const out = new Map<string, number>()
    if (!schedule?.data) return out
    const people = decodeSalaMonth(schedule.data)
    for (const shift of SALA_SHIFTS) {
      const perKey = new Map<string, number>()
      for (const p of people) {
        const token = p.days[selectedDay - 1] ?? ''
        if (!isShiftWorkCode(token) || isPresentNoSection(token)) continue
        const parsed = parseShiftCode(token)
        if (NON_SECTION_DUTIES.has(parsed.section.toUpperCase())) continue
        const key = `${parsed.section}|${parsed.shift}`
        perKey.set(key, (perKey.get(key) ?? 0) + 1)
      }
      for (const card of cards) {
        const n = perKey.get(`${card.sectionKey ?? card.title}|${shift}`) ?? 0
        out.set(`${card.sectionKey ?? card.title}|${shift}`, n)
      }
    }
    return out
  }, [schedule, selectedDay, cards])

  // BLOCCO «ASSENTI» (richiesta 23/09/2026): chi nel PDF del giorno ha una
  // sigla di assenza (A/AG7/F.E./VS…), attribuito al SOLO turno teorico della
  // persona — mai in tutti e tre. Righe con tinta assenza (come le celle
  // «Il tuo turno»), sempre visibili anche fuori dalla vista teorico≠reale:
  // sono fatti reali del PDF, non confronti.
  const assenti: Map<string, AssenteDelTurno[]> = useMemo(() => {
    if (!shiftTree) return new Map()
    return assentiPerTurno(currentMonth, selectedDay, shiftTree, shiftTree.adjustments, realCodesForDay, bareOwners, duplicateCognomi, yellowPeople)
  }, [shiftTree, currentMonth, selectedDay, realCodesForDay, bareOwners, duplicateCognomi, yellowPeople])

  const scheduleSections: string[] = schedule
    ? [...new Set([
        ...KNOWN_SECTIONS,
        ...Object.values(schedule.schedule).flatMap(day => Object.keys(day.sections)),
      ])].sort()
    : []

  const displayCards = (schedule && !isEditing)
    ? cards.map(card => {
        const lookupKey = card.sectionKey ?? card.title
        const sectionData = schedule.schedule[selectedDay]?.sections[lookupKey]?.[selectedShift]
        if (!sectionData) {
          return { ...card, surnames: card.type === 'double' ? ['', ''] : [''], tirocinanti: [], surnameSlots: undefined, surnameColors: undefined }
        }
        const tNames = sectionData.surnames.T
        const sNames = sectionData.surnames.S
        const nNames = sectionData.surnames.noSlot
        const allNames = [...tNames, ...sNames, ...nNames]
        const surnameSlots: Array<'T' | 'S' | 'noSlot'> = [
          ...tNames.map(() => 'T' as const),
          ...sNames.map(() => 'S' as const),
          ...nNames.map(() => 'noSlot' as const),
        ]
        const dayColors = schedule.coloredPersons?.[selectedDay] ?? {}
        const surnameColors: Record<string, string> = {}
        for (const name of [...allNames, ...sectionData.tirocinanti]) {
          const col = dayColors[name]
          if (col) surnameColors[name] = col
        }
        return {
          ...card,
          surnames: allNames.length > 0 ? allNames : (card.type === 'double' ? ['', ''] : ['']),
          surnameSlots: allNames.length > 0 ? surnameSlots : undefined,
          surnameColors: Object.keys(surnameColors).length > 0 ? surnameColors : undefined,
          tirocinanti: sectionData.tirocinanti,
        }
      })
    : cards

  /* LA PILLOLA DEL FLASH: la persona cercata sta nella riga «Altre attività»?
     (richiesta 19/09/2026 — chi è presente nel PDF senza sezione non è su nessuna
     card: turni «nudi» M/N/P es. SPAGNULO, trasferte `NDis*`, `TUTOR`/`MTUTOR`,
     corsi `Sp*`… Senza questa evidenzia la board non aveva niente da accendere e
     rispondeva col vecchio avviso giallo «la persona non compare in questa
     sezione», anche nei mesi col PDF caricato.) La regola del match è la stessa
     delle card (`matchesFocusPerson`), così la pillola non può essere più
     difficile da trovare di una card. */
  const isFlashGroupName = useCallback(
    (name: string) => !!flash && matchesFocusPerson([name], flash.cognome, flash.nome, duplicateCognomi, bareOwners),
    [flash, duplicateCognomi, bareOwners],
  )

  // Raggruppamento per tipologia (richiesta 22/09/2026): i token espliciti
  // arrivano dal day schedule (v2 ricostruita, parser o teorico); i mesi v1
  // storici non hanno token → ricadono nel gruppo «Altre attività».
  const altriGruppi: AltriGruppo[] = useMemo(() => {
    if (isEditing || !schedule) return []
    const day = schedule.schedule[selectedDay]
    if (!day) return []
    // I mesi v2 portano già altriPresentiTokens (name → token PDF): la entry
    // del gruppo mostra il codice accanto al nome (richiesta 24/09). I mesi v1
    // non hanno token → entry senza codice, gruppo «Altre attività».
    // Persona GIALLA (v3, 25/09/2026): resta FUORI dai sottogruppi — il pallino
    // giallo sulla sua card teorica la rappresenta già (vale per tutti i
    // gruppi: SPCA giallo non finisce nei «Corsi», ecc.). UNICA eccezione: la
    // persona del FLASH — se è lì, la sua pillola DEVE esserci, altrimenti la
    // board non avrebbe niente da accendere e tornerebbe l'avviso giallo.
    return groupAltriPresenti(day)
      .map(g => ({
        ...g,
        entries: g.entries.filter(e => !yellowPeople.has(normName(e.name)) || isFlashGroupName(e.name)),
      }))
      .filter(g => g.entries.length > 0)
  }, [schedule, selectedDay, isEditing, yellowPeople, isFlashGroupName])

  /** La persona del flash è in una pillola delle «Altre attività» (non su una card)? */
  const flashInAltri = useMemo(
    () => altriGruppi.some(g => g.entries.some(e => isFlashGroupName(e.name))),
    [altriGruppi, isFlashGroupName],
  )

  // Build grid: rows 1-4, cols left/center/right
  const usedRows: number[] = isEditing
    ? [1, 2, 3, 4, 5]
    : [...new Set(displayCards.map(c => c.row ?? 1))].sort((a, b) => a - b)

  /* ── «Vengo da qui»: dalla card di un cambio al SUO posto in sala ───────────
     Arrivo da dashboard (focus, vedi lib/shift-tokens): la board salta su giorno
     e turno della card tappata e illumina per 5s la card che contiene la persona
     che cede il cambio. L'evidenzia è quella di `isFocusPerson`; qui sotto c'è
     solo la regia: applica, scorri in vista, avvisa se non c'è nessuno da
     illuminare. */
  useEffect(() => {
    if (!focus) return
    if (focusAppliedRef.current === focus.token) return
    focusAppliedRef.current = focus.token
    focusHonoredRef.current = { month: focus.month, consumed: false }
    setSelectedDay(focus.day)
    setSelectedShift(focus.shift)
    setFlash(focus)
  }, [focus])

  // Spegnimento del flash: legato a `flash` e NON alla richiesta in arrivo — la
  // pagina pulisce la URL dopo l'evidenzia (focus → null) e il timer deve
  // sopravvivere a quella pulizia, altrimenti la card resterebbe accesa.
  //
  // I 5s partono quando il mese di destinazione è DAVVERO a schermo: se il
  // caricamento è lento, l'evidenzia non si consuma mentre la board mostra ancora
  // il mese precedente (l'utente non vedrebbe niente). Tetto di 12s per non
  // lasciare la card accesa per sempre se il mese non arriva mai.
  useEffect(() => {
    if (!flash) return
    // «Pronto» = c'è il mese E la sua copia è confermata: sulla copia in cache il
    // respiro si consumerebbe guardando dati vecchi (la card si accenderebbe per
    // un istante e poi sparirebbe mentre la riconvalida arriva).
    const mesePronto = schedule?.month === flash.month && scheduleFresco
    const t = setTimeout(() => setFlash(null), mesePronto ? SALA_FLASH_MS : SALA_FLASH_ATTESA_MAX_MS)
    return () => clearTimeout(t)
  }, [flash, schedule?.month, scheduleFresco])

  /* L'ARRIVO VALE SOLO FINCHÉ LA BOARD MOSTRA QUELLA COPPIA GIORNO+TURNO
     (segnalazione 25/09/2026). Se l'utente, con l'evidenzia ancora in corso,
     cambia turno P/M/N dalla toolbar (o giorno, o mese), la domanda «dov'è la
     persona che cede il cambio?» non ha più un contesto: la board guarderebbe
     un'ALTRA sezione — e la persona, che nel turno dell'arrivo c'è, risulterebbe
     assente. Qui il flash si spegne in silenzio; l'effetto del giudizio legge LO
     STESSO predicato, perché nella stessa passata di effetti `flash` è ancora
     quello vecchio e basterebbe un istante per emettere l'avviso sbagliato.
     Stesso discorso per il ritorno in pagina dopo un gesto di sistema: se nel
     frattempo la vista è cambiata, il giudizio differito non parte.
     (Il confronto è sui VALORI, non sull'ordine degli eventi: con l'arrivo
     appena applicato giorno e turno sono già quelli richiesti.) */
  const arrivoInVista = !!flash && currentMonth === flash.month
    && selectedDay === flash.day && selectedShift === flash.shift

  /* Il confronto è sui VALORI, e mese, giorno e turno dell'arrivo si applicano
     nella STESSA passata che accende il flash (il mese di destinazione lo cambia
     `sala-page-client`, che chiama `handleMonthChange` in modo sincrono): una
     vista diversa, quindi, è sempre una vista che l'utente ha chiesto DOPO. Il
     caso «vengo da un ALTRO mese» è coperto dalla spec omonima. */
  useEffect(() => {
    if (flash && !arrivoInVista) setFlash(null)
  }, [flash, arrivoInVista])

  // La persona del flash è in QUESTA card? (stessa regola dell'evidenzia della
  // card dell'utente loggato: cognomi della sezione, tirocinanti e gialli).
  // `matchesFocusPerson` (lib/person-shift) = regola stretta della board + ripiego
  // con la regola della VERIFICA: elenco utenti o albero incompleti nel browser
  // non possono più far rispondere «non è in sala» a una persona che c'è.
  const isFocusPerson = useCallback(
    (card: DeskCardType) => !!flash && (
      matchesFocusPerson(card.surnames, flash.cognome, flash.nome, duplicateCognomi, bareOwners) ||
      matchesFocusPerson(card.tirocinanti ?? [], flash.cognome, flash.nome, duplicateCognomi, bareOwners) ||
      matchesFocusPerson(yellowNamesByCard.get(card.id) ?? [], flash.cognome, flash.nome, duplicateCognomi, bareOwners)
    ),
    [flash, duplicateCognomi, bareOwners, yellowNamesByCard],
  )

  /**
   * DOVE È DAVVERO LA PERSONA — la frase che ha preso il posto del generico «la
   * persona non compare in questa sezione» (richiesta 19/09/2026): quando la board
   * non ha NIENTE da accendere, l'avviso dice il codice del giorno tradotto in
   * parole — riposo, ferie, sezione senza card, codice che la board non disegna —
   * oppure ammette che quel giorno non risulta in turno. La fonte è il mese a
   * schermo (lo stesso che la board disegna), letto con la regola della VERIFICA
   * (`personNameMatches`): così la frase non può essere più severa del salto che ha
   * portato qui, e un omonimo che la board non ha saputo evidenziare viene comunque
   * nominato con la sua sezione.
   */
  const doveEPersona = useCallback((f: SalaFocus): string => {
    // Un mese GENERATO dal tree (nessun dato del PDF) è una previsione: dirlo è
    // più onesto che far passare la rotazione per un fatto del PDF.
    const nonNelMese = schedule?.data
      ? 'quel giorno non risulta in turno in questo mese'
      : 'nel mese teorico quel giorno non risulta in turno'
    if (!schedule?.schedule?.[f.day]) return nonNelMese
    // Il codice del giorno, dai dati del mese (v1 e v2, decodificati come fa la
    // board per i gialli e per gli assenti).
    let code = ''
    if (schedule.data) {
      const persona = decodeSalaMonth(schedule.data).find(p =>
        personNameMatches(p.name, { cognome: f.cognome, nome: f.nome }, duplicateCognomi, bareOwners))
      code = persona?.days[f.day - 1] ?? ''
    }
    if (!code) return nonNelMese
    // La sezione ha una card? Se sì la persona c'è ma sotto un ALTRO turno (o con un
    // nome che la board non ha saputo riconoscere): il codice lo dice.
    const sez = sectionTurnOf(code)
    const suUnaCard = !!sez && displayCards.some(c => (c.sectionKey ?? c.title) === sez.section)
    return spiegaCodiceNonMostrato(code, suUnaCard)
  }, [schedule, displayCards, duplicateCognomi, bareOwners])

  // Il flash può essere chiesto PRIMA che il mese di destinazione sia a schermo
  // (il mese si carica dal DB/cache): si aspetta di avere il mese giusto, poi si
  // scorre alla card. Una persona non trovata NON deve restare un mistero
  // (richiesta 18/09/2026): un avviso spiega cosa manca, una volta sola.
  useEffect(() => {
    if (!flash || isEditing) return
    // La vista non è più quella dell'arrivo (turno/giorno/mese cambiati, anche
    // mentre la pagina era nascosta): la board non ha niente da dire su questa
    // sezione (vedi `arrivoInVista`).
    if (!arrivoInVista) return
    if (!schedule || schedule.month !== flash.month) return
    // «Trovata» = su una card di sezione OPPURE in una pillola delle «Altre
    // attività»: in entrambi i casi c'è qualcosa da accendere, quindi non si
    // avvisa (richiesta 19/09/2026).
    const found = displayCards.some(isFocusPerson) || flashInAltri
    if (found) {
      document.querySelector('.desk-card-flash')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    // Mese non ancora confermato: NON si dice «non è in sala» — è esattamente il
    // caso del collega (copia in cache più vecchia del PDF, persona che c'era).
    // L'effetto rigira quando la riconvalida arriva (deps sotto).
    if (!scheduleFresco) return
    // Pagina nascosta (iOS: swipe-back / app in background): il giudizio non ha
    // un lettore, e un avviso emesso ora resterebbe a schermo al ritorno.
    if (!pageVisible) return
    if (notFoundRef.current.has(flash.token)) return
    notFoundRef.current.add(flash.token)
    toast.warning(
      `${flash.nome ? `${flash.nome} ` : ''}${flash.cognome} non è in sala nel turno ${SALA_SHIFT_LABEL[flash.shift]} del ${flash.day} — ${doveEPersona(flash)}.`,
      { id: SALA_FOCUS_WARNING_ID },
    )
  }, [flash, isEditing, arrivoInVista, schedule, displayCards, isFocusPerson, scheduleFresco, pageVisible, flashInAltri, doveEPersona])

  // L'avviso se ne va con la board: è un'informazione sul posto di quella
  // persona QUI, non una notizia da portarsi dietro (vedi SALA_FOCUS_WARNING_ID).
  useEffect(() => () => { toast.dismiss(SALA_FOCUS_WARNING_ID) }, [])

  return (
    <div className="flex flex-col gap-2 p-4">
      {/* Schedule header — hidden during layout edit */}
      {!isEditing && (
        <div className="flex items-center flex-wrap gap-1 sala-toolbar-bg border desk-schedule-border rounded-xl px-3 py-2 mr-14">
          <div className="relative">
            <button
              onClick={() => setShowDayPicker(v => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors select-none sala-toolbar-nav-bg sala-toolbar-nav-text"
            >
              {/* STILE OMogeneo (richiesta 12/09/2026): font, misura e colore
                  identici su tutta la data — «SAB 12 SETT 2026». Nessun override
                  di colore: tutti gli span ereditano il tinta-bottone della nav.
                  Mese ESTESO solo se c'è spazio (≥ sm) per stare sulla riga dei
                  P M N; sotto quel limite si abbrevia a 3 lettere. */}
              <span className="text-sm font-semibold uppercase leading-none">{weekdayLabel}</span>
              <span className="text-sm font-semibold tabular-nums leading-none">{selectedDay}</span>
              {/* Mese e anno nel trigger solo a picker CHIUSO: a pannello aperto
                  le tendine in testa al calendario dicono già mese e anno — il
                  trigger si riduce a «GIO 11» per non ripeterli sotto. */}
              {!showDayPicker && (
                <>
                  <span className="text-sm font-semibold uppercase leading-none hidden sm:inline">{MONTHS_IT[cm - 1]}</span>
                  <span className="text-sm font-semibold uppercase leading-none sm:hidden">{MONTHS_IT[cm - 1].slice(0, 3)}</span>
                  <span className="text-sm font-semibold tabular-nums leading-none">{cy}</span>
                </>
              )}
              <ChevronDown size={12} className={`text-muted-foreground transition-transform ${showDayPicker ? 'rotate-180' : ''}`} />
            </button>
            {showDayPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDayPicker(false)} />                <div className="absolute top-full left-0 z-50 mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden cal-panel">
                  {/* Selettori MESE e ANNO in testa (come «Il tuo turno»): il teorico
                      si calcola per qualsiasi mese, quindi l'anno copre il millennio. */}
                  <div className="flex gap-1.5 p-2 border-b border-border bg-muted/40">
                    {/* FIX off-by-one (21/09/2026): la tendina scriveva il value
                        1-based dentro new Date(y, month, 1) che attende l'indice
                        0-based → selezionando «Settembre» compariva Ottobre.
                        Ora le option portano l'indice 0-based come value e
                        currentMonth guida direttamente il value del select. */}
                    <select
                      value={cm - 1}
                      onChange={e => setPickerMonth(new Date(pickerMonth.getFullYear(), Number(e.target.value), 1))}
                      className="cal-monthsel flex-1 rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold"
                      aria-label="Scegli mese"
                    >
                      {MONTHS_IT.map((label, i) => (
                        <option key={label} value={i}>{label}</option>
                      ))}
                    </select>
                    <select
                      value={pickerMonth.getFullYear()}
                      onChange={e => setPickerMonth(new Date(Number(e.target.value), pickerMonth.getMonth(), 1))}
                      className="cal-monthsel w-[86px] rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold"
                      aria-label="Scegli anno"
                    >
                      {Array.from({ length: 81 }, (_, i) => 2020 + i).map(yy => (
                        <option key={yy} value={yy}>{yy}</option>
                      ))}
                    </select>
                  </div>
                  <Calendar
                    mode="single"
                    hideNavigation /* mese e anno si scelgono dalle tendine in testa: niente frecce doppie */
                    selected={new Date(cy, cm - 1, selectedDay)}
                    onSelect={(date) => {
                      if (!date) return
                      const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                      setSelectedDay(date.getDate())
                      if (newMonth !== currentMonth) {
                        pickerMonthChangeRef.current = true
                        onMonthChange(newMonth)
                      }
                      setShowDayPicker(false)
                    }}
                    month={pickerMonth}
                    onMonthChange={setPickerMonth}
                    disabled={(date) => {
                      const dateMonthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                      // Solo nei mesi caricati da PDF si limitano i giorni a quelli
                      // presenti nel file; i mesi teorici (anche fuori dalla lista
                      // precalcolata) sono interamente navigabili.
                      if (dateMonthStr === currentMonth && activeDays && !isTheoreticalMonth.has(dateMonthStr) && uploadedMonthsSet.has(dateMonthStr)) return !activeDays.has(date.getDate())
                      return false
                    }}
                    showOutsideDays={false}
                    locale={it}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex-1 min-w-1" />

          <div className="flex rounded-lg overflow-hidden border sala-toolbar-nav-border text-xs font-semibold shrink-0">
            {SHIFT_ORDER.map((s, i) => {
              const isSelected = selectedShift === s
              const prevNotSelected = i === 0 || selectedShift !== SHIFT_ORDER[i - 1]
              return (
                <button
                  key={s}
                  onClick={() => setSelectedShift(s)}
                  className={`px-2 py-1.5 transition-colors ${
                    isSelected
                      ? 'sala-toolbar-chip'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  } ${i > 0 && !isSelected && prevNotSelected ? 'sala-toolbar-sep' : ''}`}
                >
                  {s}
                </button>
              )
            })}
          </div>

          {canUpload && (
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
          )}
        </div>
      )}

      {/* Layout edit toolbar */}
      {isAdmin && isEditing && (
        <EditToolbar
          isEditing={isEditing}
          dirty={dirty}
          saving={saving}
          defaults={defaults}
          onStartEdit={() => setIsEditing(true)}
          onSave={handleSave}
          onCancel={handleCancel}
          onAddCard={addCard}
          onChangeDefaults={handleChangeDefaults}
          onHistory={openHistory}
        />
      )}

      {/* Cards grid — 3 columns (left/center/right), up to 5 rows */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-3">
          {usedRows.map(row => (
            <div key={row} className="grid grid-cols-3 gap-2">
              {ALIGNS.map(align => {
                const cellCards = displayCards.filter(
                  c => (c.row ?? 1) === row && (c.align ?? 'left') === align,
                )
                return (
                  <DroppableCell key={align} id={`row-${row}-align-${align}`} isEditing={isEditing}>
                    {cellCards.map(card => (
                      <DeskCard
                        key={card.id}
                        card={card}
                        isEditing={isEditing}
                        flash={!isEditing && isFocusPerson(card)}
                        highlighted={!isEditing && (
                          matchesCognome(card.surnames, userCognome, userNome, duplicateCognomi, bareOwners) ||
                          matchesCognome(card.tirocinanti ?? [], userCognome, userNome, duplicateCognomi, bareOwners) ||
                          // Gialli della card: il dipendente loggato c'è anche
                          // quando compare SOLO come chip gialla (richiedente
                          // con assenza/corso sul proprio turno).
                          matchesCognome(yellowNamesByCard.get(card.id) ?? [], userCognome, userNome, duplicateCognomi, bareOwners)
                        )}
                        minWidth={card.type === 'double' ? defaults.doubleMinWidth : defaults.singleMinWidth}
                        
                        scheduleSections={scheduleSections}
                        onUpdate={updateCard}
                        onDelete={deleteCard}
                        canEditColors={canUpload && !isEditing && !!schedule && schedule.source !== 'theoretical'}
                        onColorChange={canUpload && onColorChange
                          ? (name, color) => onColorChange(currentMonth, selectedDay, name, color)
                          : undefined}
                        theoCompare={theoCompareByCardId.get(card.id)}
                        nameDisplay={nameDisplay}
                        yellowByCard={yellowByCard.get(card.id)}
                        scoperti={scoperti.get(card.id)?.count ?? 0}
                        scopertoSlots={scoperti.get(card.id)?.slots}
                        scopertoAsText={scopertoAsText.has(card.id)}
                        duplicateCognomi={duplicateCognomi}
                        isOwn={isOwn}
                      />
                    ))}
                  </DroppableCell>
                )
              })}
            </div>
          ))}
        </div>

        <DragOverlay>
          {activeCardId && (() => {
            const card = cards.find(c => c.id === activeCardId)
            if (!card) return null
            return (
              <DeskCard
                card={card}
                isEditing={true}
                isDragOverlay={true}
                minWidth={card.type === 'double' ? defaults.doubleMinWidth : defaults.singleMinWidth}
                
                scheduleSections={scheduleSections}
                onUpdate={() => {}}
                onDelete={() => {}}
              />
            )
          })()}
        </DragOverlay>
      </DndContext>

      {/* Altri presenti RAGGRUPPATI per tipologia (richiesta 22/09/2026):
          Trasferte / Corsi / Istruttori / Altre attività. Ogni gruppo appare
          solo se ha almeno una persona oggi. TINTE = chip P/M/N + card verdi
          (24/09). In vista teorico≠reale NIENTE riga «Nuovi» separata: la
          provenienza teorica «da <token>» va DIRETTAMENTE sulla pill del
          gruppo dei non-previsti (richiesta 24/09, niente ridondanza). */}
      {(altriGruppi.length > 0 || assenti.size > 0) && (
        <div className="flex flex-col gap-1 pt-1 border-t border-border/40">
          {altriGruppi.map(gruppo => (
            <div key={gruppo.key} className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">{gruppo.label}:</span>
              {gruppo.entries.map((e, i) => {
                const isMe = isOwn(e.name)
                const da = gruppoProvenienza?.get(normName(e.name))
                // La pillola della persona arrivata dalla dashboard respira come
                // una card (richiesta 19/09/2026): è l'unica evidenzia possibile
                // per chi è presente senza sezione.
                const flashPill = isFlashGroupName(e.name)
                return (
                  <span
                    key={i}
                    // La pill dell'utente loggato è in GRASSETTO e con il bordo
                    // spesso (richiesta 16/09/2026): si riconosce a colpo d'occhio
                    // anche in mezzo a una riga di trasferte.
                    className={[
                      'text-xs px-2 py-0.5 rounded-full',
                      isMe ? 'desk-own-badge desk-own-badge-strong' : gruppo.colorClass,
                      flashPill ? 'desk-card-flash' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {displayForPdfName(e.name)}
                    {e.code && <span className="tabular-nums font-semibold opacity-80"> {e.code}</span>}
                    {da && <span className="tabular-nums opacity-70 font-medium"> da {da}</span>}
                  </span>
                )
              })}
            </div>
          ))}
          {/* ASSENTI (24/09/2026): sottogruppo singolo che segue la CHIP del
              turno selezionata in testa alla board — mostra solo gli assenti
              (A/AG7/F.E./VS/RI/RC…) attribuiti a QUEL turno teorico (mai
              ripetuti sugli altri). Tinta assenza, come le celle. */}
          {(assenti.get(selectedShift)?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">Assenti:</span>
              {assenti.get(selectedShift)!.map((a, i) => {
                const isMe = isOwn(a.name)
                return (
                  <span
                    key={i}
                    className={`text-xs px-2 py-0.5 rounded-full ${isMe ? 'desk-own-badge desk-own-badge-strong' : 'cell-tint-abs'}`}
                  >
                    {displayForPdfName(a.name)}
                    <span className="tabular-nums font-semibold opacity-80"> {a.code}</span>
                  </span>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Upload multiplo: riepilogo con mese/anno rilevati + conferma (19/09/2026) */}
      {pendingFiles && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-md flex flex-col gap-3 p-5 max-h-[85vh]">
            <div>
              <h2 className="text-sm font-semibold">Riepilogo caricamento PDF</h2>
              <p className="text-xs text-muted-foreground">
                {analyzing
                  ? 'Analisi dei file… (mese e anno letti dal contenuto)'
                  : `${pendingFiles.filter(r => r.month).length} di ${pendingFiles.length} file con mese rilevato — verifica e conferma`}
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 -mx-1 px-1">
              {pendingFiles.map((row, i) => {
                const dup = !!row.month && pendingFiles.filter(r => r.month === row.month).length > 1
                const existing = !!row.month && availableMonths.includes(row.month)
                const setRowMonth = (y: number, m: number) =>
                  setPendingFiles(prev =>
                    prev?.map((r, ri) => (ri === i ? { ...r, month: `${y}-${String(m).padStart(2, '0')}`, confidence: 1 } : r)) ?? prev,
                  )
                const [yy, mm] = (row.month ?? `${currentYear}-${String(currentMonth.split('-')[1]).padStart(2, '0')}`).split('-').map(Number)
                return (
                  <div key={i} className="rounded-lg border bg-background/50 px-2.5 py-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium flex-1 min-w-0 truncate" title={row.file.name}>{row.file.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{(row.file.size / 1024).toFixed(0)} KB</span>
                    </div>
                    {row.error ? (
                      <p className="text-[11px] text-destructive">Errore lettura: {row.error}</p>
                    ) : analyzing ? (
                      <p className="text-[11px] text-muted-foreground">Rilevamento…</p>
                    ) : row.month ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold text-primary uppercase">
                          {MONTHS_IT[mm - 1]} {yy}
                        </span>
                        {row.confidence < 0.6 && <span className="text-[10px] text-amber-600 dark:text-amber-400">bassa confidenza</span>}
                        {dup && <span className="text-[10px] text-amber-600 dark:text-amber-400">duplicato!</span>}
                        {!dup && existing && <span className="text-[10px] text-muted-foreground">mese già presente: sarà sovrascritto</span>}
                        {dup && existing && <span className="text-[10px] text-muted-foreground">mese già presente: sarà sovrascritto</span>}
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">Mese non rilevato: scegli a mano qui sotto</p>
                    )}
                    <div className="flex gap-1.5">
                      <select
                        value={mm}
                        onChange={e => setRowMonth(yy, Number(e.target.value))}
                        className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary"
                      >
                        {MONTHS_IT.map((label, mi) => (
                          <option key={mi + 1} value={mi + 1}>{label}</option>
                        ))}
                      </select>
                      <select
                        value={yy}
                        onChange={e => setRowMonth(Number(e.target.value), mm)}
                        className="w-24 px-2 py-1 rounded-lg border border-border bg-background text-xs outline-none focus:border-primary"
                      >
                        {[currentYear, currentYear + 1, currentYear - 1, currentYear - 2].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 justify-end items-center">
              <button
                onClick={() => setPendingFiles(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={confirmUploadBatch}
                disabled={analyzing || pendingFiles.filter(r => r.month).length === 0}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Conferma e carica ({pendingFiles.filter(r => r.month).length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MINIMI per card (solo admin, richiesta 15/09/2026): pannello aperto dal
          mini-Fab «Minimi per card» della bottom-nav. Sta FUORI dalla modalità
          modifica piantina: qui si scrivono solo i numeri, con la data da cui
          valgono, e accanto a ognuno le presenze reali del giorno a schermo. */}
      {minPanelOpen && isAdmin && (
        <MinimiPanel
          cards={cards}
          layout={{ minimums, minimumPeriods }}
          dayISO={dayISO}
          day={selectedDay}
          shift={selectedShift}
          reali={realiPerCard}
          onSave={handleSaveMinimums}
          onClose={() => setMinPanelOpen(false)}
        />
      )}

      {/* PDF upload timestamp / badge mese teorico — fixed sopra la bottom navbar.
          FIX (22/09/2026): renderizzato in PORTAL su document.body — prima viveva
          dentro PageTransitionWrapper (framer-motion): durante l'animazione di
          ingresso (translateY 7→0) un transform su un antenato RINCHIUDE i fixed
          nei bound del contenuto pagina, così il badge compariva a metà schermo
          e «teletrasportato» in fondo quando il transform veniva rimosso a
          animazione finita. Dal body non può più essere intrappolato. */}
      {!isEditing && schedule && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-[calc(4rem_+_env(safe-area-inset-bottom,0px))] inset-x-0 flex justify-center pointer-events-none z-30">
          <span className="text-[10px] text-muted-foreground/60 bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded-full">
            {schedule.source === 'theoretical'
              ? 'Turno teorico'
              : schedule.uploaded_at ? `PDF: ${formatDateTime(schedule.uploaded_at)}` : ''}
          </span>
        </div>,
        document.body,
      )}

      {/* History dialog */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex justify-end"
          onClick={e => { if (e.target === e.currentTarget) setShowHistory(false) }}
        >
          <div className="bg-card w-full max-w-sm h-full flex flex-col shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <h2 className="text-sm font-semibold">Gestione PDF sala</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-5">
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Mesi caricati
                </h3>
                {availableMonths.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nessun mese caricato.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {availableMonths.map(m => (
                      <li key={m} className="flex items-center justify-between rounded-lg px-3 py-2 bg-muted/50">
                        <span className="text-sm font-medium">{formatMonthLabel(m)}</span>
                        <button
                          onClick={() => handleDeleteMonth(m)}
                          disabled={deletingMonth === m}
                          className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                          title={`Elimina dati ${formatMonthLabel(m)}`}
                        >
                          {deletingMonth === m
                            ? <span className="text-xs">…</span>
                            : <X size={14} />
                          }
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Cronologia upload
                </h3>
                {historyLoading ? (
                  <p className="text-xs text-muted-foreground">Caricamento…</p>
                ) : historyEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nessun upload registrato.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {historyEntries.map(entry => (
                      <li key={entry.id} className="rounded-lg px-3 py-2 bg-muted/30 flex flex-col gap-0.5">
                        <span className="text-xs font-medium truncate" title={entry.filename}>
                          {entry.filename}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{formatMonthLabel(entry.month)}</span>
                          <span>·</span>
                          <span>{formatDateTime(entry.uploaded_at)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
