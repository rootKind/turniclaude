'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { DeskCard as DeskCardType, SalaLayout, SalaLayoutDefaults, SalaSchedule, SalaShiftType } from '@/types/database'
import { DEFAULT_SALA_LAYOUT_DEFAULTS } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { getUploadHistory } from '@/lib/queries/sala-schedule'
import type { UploadHistoryEntry } from '@/lib/queries/sala-schedule'
import { DeskCard } from './desk-card'
import { EditToolbar } from './edit-toolbar'

const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

function getDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
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

function matchesCognome(surnames: string[], cognome?: string): boolean {
  if (!cognome) return false
  const norm = cognome.toLowerCase().trim()
  return surnames.some(s => s.toLowerCase().trim() === norm)
}

interface Props {
  layout: SalaLayout
  isAdmin: boolean
  userId: string
  userCognome?: string
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
  userCognome,
  onSave,
  schedule,
  currentMonth,
  availableMonths,
  onMonthChange,
  onUpload,
  onDeleteMonth,
}: Props) {
  const [cards, setCards] = useState<DeskCardType[]>(() => initCards(initialLayout.cards))
  const [defaults, setDefaults] = useState<SalaLayoutDefaults>(
    initialLayout.defaults ?? DEFAULT_SALA_LAYOUT_DEFAULTS,
  )
  const [isEditing, setIsEditing] = useState(false)
  const [savedCards, setSavedCards] = useState<DeskCardType[]>(() => initCards(initialLayout.cards))
  const [savedDefaults, setSavedDefaults] = useState<SalaLayoutDefaults>(
    initialLayout.defaults ?? DEFAULT_SALA_LAYOUT_DEFAULTS,
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const [selectedDay, setSelectedDay] = useState(() => {
    const [y, m] = currentMonth.split('-').map(Number)
    const today = new Date()
    return today.getFullYear() === y && today.getMonth() + 1 === m ? today.getDate() : 1
  })
  const [selectedShift, setSelectedShift] = useState<SalaShiftType>('M')
  const [uploading, setUploading] = useState(false)

  // History dialog
  const [showHistory, setShowHistory] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<UploadHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [deletingMonth, setDeletingMonth] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const touchStartX = useRef<number | null>(null)
  const isEditingRef = useRef(isEditing)
  const totalDaysRef = useRef(getDaysInMonth(currentMonth))

  useEffect(() => { isEditingRef.current = isEditing }, [isEditing])

  const totalDays = getDaysInMonth(currentMonth)
  useEffect(() => { totalDaysRef.current = totalDays }, [totalDays])

  // Document-level swipe — works in any area of the page
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
      setSelectedDay(d => dx < 0 ? Math.min(d + 1, totalDaysRef.current) : Math.max(d - 1, 1))
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  useEffect(() => {
    const [y, m] = currentMonth.split('-').map(Number)
    const today = new Date()
    if (today.getFullYear() === y && today.getMonth() + 1 === m) {
      setSelectedDay(today.getDate())
    } else {
      setSelectedDay(1)
    }
  }, [currentMonth])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

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
    }
    setCards(prev => [...prev, newCard])
    setDirty(true)
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    setCards(prev => {
      const oldIndex = prev.findIndex(c => c.id === active.id)
      const newIndex = prev.findIndex(c => c.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
    setDirty(true)
  }

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      await onUpload(file, currentMonth)
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
    if (!isAdmin) return
    const onUpload = () => fileInputRef.current?.click()
    const onHistory = () => openHistory()
    const onEdit = () => setIsEditing(true)
    document.addEventListener('sala-admin-upload', onUpload)
    document.addEventListener('sala-admin-history', onHistory)
    document.addEventListener('sala-admin-edit', onEdit)
    return () => {
      document.removeEventListener('sala-admin-upload', onUpload)
      document.removeEventListener('sala-admin-history', onHistory)
      document.removeEventListener('sala-admin-edit', onEdit)
    }
  }, [isAdmin, openHistory])

  const handleDeleteMonth = async (month: string) => {
    setDeletingMonth(month)
    try {
      await onDeleteMonth(month)
    } finally {
      setDeletingMonth(null)
    }
  }

  const scheduleSections: string[] = schedule
    ? [...new Set(
        Object.values(schedule.schedule).flatMap(day => Object.keys(day.sections))
      )].sort()
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

  const monthOptions = availableMonths.includes(currentMonth)
    ? availableMonths
    : [...availableMonths, currentMonth].sort((a, b) => b.localeCompare(a))

  const activeCard = activeId ? cards.find(c => c.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col gap-2 p-4">
        {/* Schedule header — hidden during layout edit */}
        {!isEditing && (
          <div className="flex items-center gap-1.5 bg-card border border-sky-200 dark:border-border rounded-xl px-3 py-2 mr-14">
            {/* Day navigation */}
            <button
              onClick={() => setSelectedDay(d => Math.max(d - 1, 1))}
              disabled={selectedDay <= 1}
              className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-lg font-bold w-7 text-center tabular-nums select-none">
              {selectedDay}
            </span>
            <button
              onClick={() => setSelectedDay(d => Math.min(d + 1, totalDays))}
              disabled={selectedDay >= totalDays}
              className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>

            {/* Month + Year with overlay select */}
            <div className="relative ml-1">
              <span className="text-sm font-medium pointer-events-none select-none">
                {MONTHS_IT[parseInt(currentMonth.split('-')[1]) - 1]}{' '}
                {currentMonth.split('-')[0]}
              </span>
              <select
                value={currentMonth}
                onChange={e => onMonthChange(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
              >
                {monthOptions.map(mo => (
                  <option key={mo} value={mo}>{formatMonthLabel(mo)}</option>
                ))}
              </select>
            </div>

            <div className="flex-1" />

            {/* P/M/N buttons */}
            <div className="flex rounded-lg overflow-hidden border border-border text-xs font-semibold">
              {(['P', 'M', 'N'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSelectedShift(s)}
                  className={`px-3 py-1.5 transition-colors ${
                    selectedShift === s
                      ? 'bg-sky-400 text-white dark:bg-zinc-900 dark:text-white'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {isAdmin && (
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

        {/* Layout edit toolbar — visible only while editing */}
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

        {/* Cards grid */}
        <SortableContext items={cards.map(c => c.id)} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap gap-2 items-stretch">
            {displayCards.map(card => (
              <DeskCard
                key={card.id}
                card={card}
                isEditing={isEditing}
                highlighted={!isEditing && matchesCognome(card.surnames, userCognome)}
                minWidth={card.type === 'double' ? defaults.doubleMinWidth : defaults.singleMinWidth}
                tirocinanteWidth={defaults.tirocinanteWidth}
                scheduleSections={scheduleSections}
                onUpdate={updateCard}
                onDelete={deleteCard}
              />
            ))}
          </div>
        </SortableContext>

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
      </div>

      <DragOverlay>
        {activeCard && (
          <DeskCard
            card={activeCard}
            isEditing={false}
            minWidth={activeCard.type === 'double' ? defaults.doubleMinWidth : defaults.singleMinWidth}
            tirocinanteWidth={defaults.tirocinanteWidth}
            scheduleSections={[]}
            onUpdate={() => {}}
            onDelete={() => {}}
          />
        )}
      </DragOverlay>

      {/* History dialog */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex justify-end"
          onClick={e => { if (e.target === e.currentTarget) setShowHistory(false) }}
        >
          <div className="bg-card w-full max-w-sm h-full flex flex-col shadow-xl overflow-hidden">
            {/* Header */}
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
              {/* Currently loaded months */}
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

              {/* Upload history */}
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
    </DndContext>
  )
}
