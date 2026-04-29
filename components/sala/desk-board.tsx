'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { it } from 'date-fns/locale'
import { format } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import type { DeskCard as DeskCardType, SalaLayout, SalaLayoutDefaults, SalaSchedule, SalaShiftType } from '@/types/database'
import { DEFAULT_SALA_LAYOUT_DEFAULTS } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getUploadHistory } from '@/lib/queries/sala-schedule'
import type { UploadHistoryEntry } from '@/lib/queries/sala-schedule'
import { formatDisplayName } from '@/lib/utils'
import { useAllDuplicateCognomi } from '@/hooks/use-users'
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

const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

const ALIGNS = ['left', 'center', 'right'] as const
type Align = typeof ALIGNS[number]

function getDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
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

function matchesCognome(surnames: string[], cognome?: string, nome?: string, duplicateCognomi?: Set<string>): boolean {
  if (!cognome) return false
  const displayName = formatDisplayName({ nome: nome ?? '', cognome }, duplicateCognomi).toLowerCase().trim()
  const normCognome = cognome.toLowerCase().trim()
  const isOmonimo = duplicateCognomi?.has(cognome) ?? false
  return surnames.some(s => {
    const sNorm = s.toLowerCase().trim()
    if (sNorm === displayName) return true
    // PDF può aggiungere suffisso anche senza omonimia — strip fallback solo per non-omonimi
    if (!isOmonimo && sNorm.replace(/\s+[a-z]+\.$/, '') === normCognome) return true
    return false
  })
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
  onMonthChange: (month: string) => Promise<void>
  onUpload: (file: File, month: string) => Promise<void>
  onDeleteMonth: (month: string) => Promise<void>
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
  onMonthChange,
  onUpload,
  onDeleteMonth,
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
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadMonth, setUploadMonth] = useState(() => {
    const [y, m] = currentMonth.split('-').map(Number)
    const nm = m === 12 ? 1 : m + 1
    const ny = m === 12 ? y + 1 : y
    return { year: ny, month: nm }
  })

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
  const availableMonthsRef = useRef(availableMonths)
  const currentMonthRef = useRef(currentMonth)
  const onMonthChangeRef = useRef(onMonthChange)
  const swipeMonthChangeRef = useRef(false)
  const pickerMonthChangeRef = useRef(false)

  useEffect(() => { isEditingRef.current = isEditing }, [isEditing])
  useEffect(() => { selectedShiftRef.current = selectedShift }, [selectedShift])
  useEffect(() => { selectedDayRef.current = selectedDay }, [selectedDay])
  useEffect(() => { availableMonthsRef.current = availableMonths }, [availableMonths])
  useEffect(() => { currentMonthRef.current = currentMonth }, [currentMonth])
  useEffect(() => { onMonthChangeRef.current = onMonthChange }, [onMonthChange])

  const totalDays = getDaysInMonth(currentMonth)
  useEffect(() => { totalDaysRef.current = totalDays }, [totalDays])

  const [cy, cm] = currentMonth.split('-').map(Number)
  const activeDays = schedule
    ? new Set(Object.keys(schedule.schedule).map(Number))
    : null

  const [pickerMonth, setPickerMonth] = useState(() => new Date(cy, cm - 1))
  useEffect(() => { setPickerMonth(new Date(cy, cm - 1)) }, [cy, cm])

  const availableMonthsSet = new Set(availableMonths)
  const sortedAvailable = [...availableMonths].sort()
  const calFromMonth = sortedAvailable.length > 0
    ? (() => { const [y, m] = sortedAvailable[0].split('-').map(Number); return new Date(y, m - 1) })()
    : new Date(cy, cm - 1)
  const calToMonth = sortedAvailable.length > 0
    ? (() => { const [y, m] = sortedAvailable[sortedAvailable.length - 1].split('-').map(Number); return new Date(y, m - 1) })()
    : new Date(cy, cm - 1)

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
          const next = getNextMonth(currentMonthRef.current)
          if (availableMonthsRef.current.includes(next)) {
            swipeMonthChangeRef.current = true
            setSelectedDay(1)
            setSelectedShift(SHIFT_ORDER[0])
            onMonthChangeRef.current(next)
          }
        }
      } else {
        if (idx > 0) {
          setSelectedShift(SHIFT_ORDER[idx - 1])
        } else if (day > 1) {
          setSelectedDay(day - 1)
          setSelectedShift(SHIFT_ORDER[SHIFT_ORDER.length - 1])
        } else {
          const prev = getPrevMonth(currentMonthRef.current)
          if (availableMonthsRef.current.includes(prev)) {
            const lastDay = getDaysInMonth(prev)
            swipeMonthChangeRef.current = true
            setSelectedDay(lastDay)
            setSelectedShift(SHIFT_ORDER[SHIFT_ORDER.length - 1])
            onMonthChangeRef.current(prev)
          }
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
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const [y, m] = currentMonth.split('-').map(Number)
    const nm = m === 12 ? 1 : m + 1
    const ny = m === 12 ? y + 1 : y
    setUploadMonth({ year: ny, month: nm })
    setPendingFile(file)
  }

  const handleConfirmUpload = async () => {
    if (!pendingFile) return
    const month = `${uploadMonth.year}-${String(uploadMonth.month).padStart(2, '0')}`
    setPendingFile(null)
    setUploading(true)
    try {
      await onUpload(pendingFile, month)
    } catch (err) {
      alert('Errore upload: ' + (err as Error).message)
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

  const handleDeleteMonth = async (month: string) => {
    setDeletingMonth(month)
    try {
      await onDeleteMonth(month)
    } finally {
      setDeletingMonth(null)
    }
  }

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
          return { ...card, surnames: card.type === 'double' ? ['', ''] : [''], tirocinanti: [] }
        }
        const allNames = [
          ...sectionData.surnames.T,
          ...sectionData.surnames.S,
          ...sectionData.surnames.noSlot,
        ]
        return {
          ...card,
          surnames: allNames.length > 0 ? allNames : (card.type === 'double' ? ['', ''] : ['']),
          tirocinanti: sectionData.tirocinanti,
        }
      })
    : cards

  const altriPresenti = (schedule && !isEditing)
    ? (schedule.schedule[selectedDay]?.altriPresenti ?? [])
    : []

  // Build grid: rows 1-4, cols left/center/right
  const usedRows: number[] = isEditing
    ? [1, 2, 3, 4, 5]
    : [...new Set(displayCards.map(c => c.row ?? 1))].sort((a, b) => a - b)

  return (
    <div className="flex flex-col gap-2 p-4">
      {/* Schedule header — hidden during layout edit */}
      {!isEditing && (
        <div className="flex items-center gap-1 bg-card border desk-schedule-border rounded-xl px-3 py-2 mr-14">
          <div className="relative">
            <button
              onClick={() => setShowDayPicker(v => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors select-none"
            >
              <span className="text-sm font-semibold text-muted-foreground uppercase leading-none">{weekdayLabel}</span>
              <span className="text-sm font-semibold tabular-nums leading-none">{selectedDay}</span>
              <span className="text-sm font-semibold leading-none">{MONTHS_IT[cm - 1]}</span>
              <span className="text-sm font-semibold text-muted-foreground leading-none">{cy}</span>
              <ChevronDown size={12} className={`text-muted-foreground transition-transform ${showDayPicker ? 'rotate-180' : ''}`} />
            </button>
            {showDayPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDayPicker(false)} />
                <div className="absolute top-full left-0 z-50 mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                  <Calendar
                    mode="single"
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
                    fromMonth={calFromMonth}
                    toMonth={calToMonth}
                    disabled={(date) => {
                      const dateMonthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
                      if (!availableMonthsSet.has(dateMonthStr)) return true
                      if (dateMonthStr === currentMonth && activeDays) return !activeDays.has(date.getDate())
                      return false
                    }}
                    showOutsideDays={false}
                    locale={it}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex rounded-lg overflow-hidden border border-border text-xs font-semibold shrink-0">
            {(['N', 'M', 'P'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSelectedShift(s)}
                className={`px-2 py-1.5 transition-colors ${
                  selectedShift === s
                    ? 'chip-selected'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {canUpload && (
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
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
                        highlighted={!isEditing && matchesCognome(card.surnames, userCognome, userNome, duplicateCognomi)}
                        minWidth={card.type === 'double' ? defaults.doubleMinWidth : defaults.singleMinWidth}
                        tirocinanteWidth={defaults.tirocinanteWidth}
                        scheduleSections={scheduleSections}
                        onUpdate={updateCard}
                        onDelete={deleteCard}
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
                tirocinanteWidth={defaults.tirocinanteWidth}
                scheduleSections={scheduleSections}
                onUpdate={() => {}}
                onDelete={() => {}}
              />
            )
          })()}
        </DragOverlay>
      </DndContext>

      {/* Altri presenti */}
      {altriPresenti.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
          <span className="text-xs text-muted-foreground shrink-0">Altri presenti:</span>
          {altriPresenti.map((name, i) => (
            <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded-full">
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Upload month picker dialog */}
      {pendingFile && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-xl w-full max-w-xs flex flex-col gap-4 p-5">
            <h2 className="text-sm font-semibold">Mese del PDF</h2>
            <p className="text-xs text-muted-foreground truncate" title={pendingFile.name}>
              {pendingFile.name}
            </p>
            <div className="flex gap-2">
              <select
                value={uploadMonth.month}
                onChange={e => setUploadMonth(prev => ({ ...prev, month: Number(e.target.value) }))}
                className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
              >
                {MONTHS_IT.map((label, i) => (
                  <option key={i + 1} value={i + 1}>{label}</option>
                ))}
              </select>
              <select
                value={uploadMonth.year}
                onChange={e => setUploadMonth(prev => ({ ...prev, year: Number(e.target.value) }))}
                className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-sm outline-none focus:border-primary"
              >
                {[currentMonth.split('-')[0], String(Number(currentMonth.split('-')[0]) + 1)].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingFile(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmUpload}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Carica
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF upload timestamp — fixed above bottom navbar */}
      {!isEditing && schedule?.uploaded_at && (
        <div className="fixed bottom-16 inset-x-0 flex justify-center pointer-events-none z-30">
          <span className="text-[10px] text-muted-foreground/60 bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded-full">
            PDF: {formatDateTime(schedule.uploaded_at)}
          </span>
        </div>
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
