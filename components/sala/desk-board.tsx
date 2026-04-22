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
import { ChevronLeft, ChevronRight, Upload } from 'lucide-react'
import type { DeskCard as DeskCardType, SalaLayout, SalaLayoutDefaults, SalaSchedule, SalaShiftType } from '@/types/database'
import { DEFAULT_SALA_LAYOUT_DEFAULTS } from '@/types/database'
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
  userId: string
  onSave: (layout: SalaLayout) => Promise<void>
  schedule?: SalaSchedule | null
  currentMonth: string
  availableMonths: string[]
  onMonthChange: (month: string) => Promise<void>
  onUpload: (file: File, month: string) => Promise<void>
}

export function DeskBoard({
  layout: initialLayout,
  isAdmin,
  onSave,
  schedule,
  currentMonth,
  availableMonths,
  onMonthChange,
  onUpload,
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

  const fileInputRef = useRef<HTMLInputElement>(null)
  const touchStartX = useRef<number | null>(null)
  const totalDays = getDaysInMonth(currentMonth)

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

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isEditing) return
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isEditing || touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 50) return
    setSelectedDay(d => dx < 0 ? Math.min(d + 1, totalDays) : Math.max(d - 1, 1))
  }

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

  const scheduleSections: string[] = schedule
    ? [...new Set(
        Object.values(schedule.schedule).flatMap(day => Object.keys(day.sections))
      )].sort()
    : []

  // Build display cards: merge schedule data for selected day/shift, or fallback to layout
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
      <div
        className="flex flex-col gap-2 p-4"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Schedule header — hidden during layout edit */}
        {!isEditing && (
          <div className="flex items-center gap-1 flex-wrap">
            {/* Day navigation */}
            <button
              onClick={() => setSelectedDay(d => Math.max(d - 1, 1))}
              disabled={selectedDay <= 1}
              className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-xl font-bold w-8 text-center tabular-nums select-none">
              {selectedDay}
            </span>
            <button
              onClick={() => setSelectedDay(d => Math.min(d + 1, totalDays))}
              disabled={selectedDay >= totalDays}
              className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={20} />
            </button>

            {/* Month selector */}
            <select
              value={currentMonth}
              onChange={e => onMonthChange(e.target.value)}
              className="ml-1 text-sm font-medium bg-transparent border-0 outline-none cursor-pointer text-muted-foreground hover:text-foreground"
            >
              {monthOptions.map(mo => (
                <option key={mo} value={mo}>{formatMonthLabel(mo)}</option>
              ))}
            </select>

            <div className="flex-1" />

            {/* P / M / N toggle */}
            <div className="flex rounded-lg overflow-hidden border border-border text-xs font-semibold">
              {(['M', 'P', 'N'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSelectedShift(s)}
                  className={`px-3 py-1.5 transition-colors ${
                    selectedShift === s
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Upload PDF (admin) */}
            {isAdmin && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <Upload size={13} />
                  {uploading ? 'Caricamento…' : 'PDF'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Layout edit toolbar */}
        {isAdmin && (
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
    </DndContext>
  )
}
