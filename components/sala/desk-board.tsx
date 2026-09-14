'use client'
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronDown } from 'lucide-react'
import { it } from 'date-fns/locale'
import { format } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { toast } from 'sonner'
import type { DeskCard as DeskCardType, SalaLayout, SalaLayoutDefaults, SalaSchedule, SalaShiftType, ShiftTeamTree } from '@/types/database'
import { groupAltriPresenti, ALTRI_COLORS, type AltriGruppo } from '@/lib/altri-gruppi'
import { DEFAULT_SALA_LAYOUT_DEFAULTS } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getUploadHistory } from '@/lib/queries/sala-schedule'
import { decodeSalaMonth } from '@/lib/sala-month'
import type { UploadHistoryEntry } from '@/lib/queries/sala-schedule'
import { formatDisplayName, matchesCognome } from '@/lib/utils'
import { buildBareOwners, lookupNameDisplay, type BareOwnerMap } from '@/lib/shift-teams-matching'
import { GRUPPO_EXTRA_KEY, normName, theoRealSectionCompare, surnameKey, type TheoRealExtra, type TheoRealSectionCompare } from '@/lib/turni-teorici'
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
}

export function DeskBoard({
  layout: initialLayout,
  isAdmin,
  isManager = false,
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
}: Props) {
  const canUpload = isAdmin || isManager
  const duplicateCognomi = useAllDuplicateCognomi()
  const [cards, setCards] = useState<DeskCardType[]>(() => initCards(initialLayout.cards))
  const [defaults, setDefaults] = useState<SalaLayoutDefaults>(
    initialLayout.defaults ?? DEFAULT_SALA_LAYOUT_DEFAULTS,
  )
  const [isEditing, setIsEditing] = useState(false)
  const [savedCards, setSavedCards] = useState<DeskCardType[]>(() => initCards(initialLayout.cards))
  const [savedDefaults, setSavedDefaults] = useState<SalaLayoutDefaults>(
    initialLayout.defaults ?? DEFAULT_SALA_LAYOUT_DEFAULTS,
  )
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const [selectedDay, setSelectedDay] = useState(() => getInitialShiftAndDay(currentMonth).day)
  const [selectedShift, setSelectedShift] = useState<SalaShiftType>(() => getInitialShiftAndDay(currentMonth).shift)
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
    const { shift, day } = getInitialShiftAndDay(currentMonth)
    setSelectedDay(day)
    setSelectedShift(shift)
    setShowDayPicker(false)
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
      await onSave({ cards, defaults })
      setSavedCards(cards)
      setSavedDefaults(defaults)
      setDirty(false)
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setCards(savedCards)
    setDefaults(savedDefaults)
    setDirty(false)
    setIsEditing(false)
  }

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
  // Omonimi con membro LEGATO via user_id (caso NEVANO P./G.): la riga PDF con
  // il solo cognome («NEVANO») appartiene al legato, gli altri omonimi solo con
  // l'iniziale. Mappa calcolata una volta per albero+anagrafica.
  const bareOwners: BareOwnerMap = useMemo(
    () => buildBareOwners(shiftTree, duplicateCognomi),
    [shiftTree, duplicateCognomi],
  )
  const usersForNames = useAllUsersForNames()
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
  const theoCompareBySection = useMemo(() => {
    if (!theoDiffEnabled || !shiftTree || !schedule) return new Map<string, TheoRealSectionCompare>()
    const day = schedule.schedule[selectedDay]
    // Codici PDF del giorno per le persone NON in sezione (assenza/riposo):
    // dal mese compatto v2, che conserva le celle originali del PDF. Due chiavi:
    // nome normalizzato ESATTO (gli omonimi hanno celle diverse) e chiave
    // cognome (fallback: vince il primo trovato).
    let realCodes: Map<string, string> | undefined
    if (schedule.data) {
      realCodes = new Map()
      for (const p of decodeSalaMonth(schedule.data)) {
        const code = p.days[selectedDay - 1] ?? ''
        if (!code) continue
        const key = surnameKey(p.name)
        if (key && !realCodes.has(key)) realCodes.set(key, code)
        realCodes.set(normName(p.name), code)
      }
    }
    return theoRealSectionCompare(currentMonth, selectedDay, shiftTree, shiftTree.adjustments, day, realCodes, bareOwners, duplicateCognomi)
  }, [theoDiffEnabled, shiftTree, schedule, selectedDay, currentMonth, bareOwners, duplicateCognomi])
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
  // ordine dei gruppi sotto.
  const gruppoExtras: TheoRealExtra[] = useMemo(() => {
    const bucket = theoCompareBySection.get(GRUPPO_EXTRA_KEY)
    if (!bucket) return []
    const order = ['trasferte', 'corsi', 'istruttori', 'tutor', 'altro']
    return [...bucket.extras].sort(
      (a, b) => order.indexOf(a.group ?? 'altro') - order.indexOf(b.group ?? 'altro'),
    )
  }, [theoCompareBySection])

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

  // Raggruppamento per tipologia (richiesta 22/09/2026): i token espliciti
  // arrivano dal day schedule (v2 ricostruita, parser o teorico); i mesi v1
  // storici non hanno token → ricadono nel gruppo «Altre attività».
  const altriGruppi: AltriGruppo[] = useMemo(() => {
    if (isEditing || !schedule) return []
    const day = schedule.schedule[selectedDay]
    if (!day) return []
    return groupAltriPresenti(day)
  }, [schedule, selectedDay, isEditing])

  // Build grid: rows 1-4, cols left/center/right
  const usedRows: number[] = isEditing
    ? [1, 2, 3, 4, 5]
    : [...new Set(displayCards.map(c => c.row ?? 1))].sort((a, b) => a - b)

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
                        highlighted={!isEditing && (
                          matchesCognome(card.surnames, userCognome, userNome, duplicateCognomi, bareOwners) ||
                          matchesCognome(card.tirocinanti ?? [], userCognome, userNome, duplicateCognomi, bareOwners)
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
          Trasferte / Corsi SP / Istruttori SP / Tutor / Altre attività.
          Ogni gruppo appare solo se ha almeno una persona oggi.
          TINTE dedicate per gruppo (23/09/2026): pill riconoscibile a colpo
          d'occhio. In testa, solo in vista teorico≠reale, i «Nuovi» di GRUPPO:
          reali presenti SOLO nelle altre presenti che il teorico non prevedeva
          lì, con la tinta della tipologia e la provenienza «da <token>». */}
      {(gruppoExtras.length > 0 || altriGruppi.length > 0) && (
        <div className="flex flex-col gap-1 pt-1 border-t border-border/40">
          {gruppoExtras.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">Nuovi:</span>
              {gruppoExtras.map((e, i) => (
                <span key={i} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${ALTRI_COLORS[(e.group ?? 'altro') as AltriGruppo['key']]}`}>
                  {displayForPdfName(e.name)}
                  {e.theo && <span className="tabular-nums opacity-70 font-medium">da {e.theo}</span>}
                </span>
              ))}
            </div>
          )}
          {altriGruppi.map(gruppo => (
            <div key={gruppo.key} className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">{gruppo.label}:</span>
              {gruppo.names.map((name, i) => {
                const isMe = matchesCognome([name], userCognome, userNome, duplicateCognomi, bareOwners)
                return (
                  <span
                    key={i}
                    className={`text-xs px-2 py-0.5 rounded-full ${isMe ? 'desk-own-badge' : gruppo.colorClass}`}
                  >
                    {displayForPdfName(name)}
                  </span>
                )
              })}
            </div>
          ))}
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
