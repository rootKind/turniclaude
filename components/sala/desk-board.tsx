'use client'
import { useState, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import type { DeskCard as DeskCardType, SalaLayout } from '@/types/database'
import { DeskCard } from './desk-card'
import { EditToolbar } from './edit-toolbar'

const ROWS = 5
const COLS = 3

interface GridCellProps {
  row: number
  col: number
  span: number
  isEditing: boolean
  isOver?: boolean
  isEmpty: boolean
}

function GridCell({ row, col, span, isEditing, isOver, isEmpty }: GridCellProps) {
  const { setNodeRef, isOver: droppableOver } = useDroppable({
    id: `cell-${row}-${col}`,
    disabled: !isEditing || !isEmpty,
  })

  if (!isEmpty) return null

  return (
    <div
      ref={setNodeRef}
      style={{ gridColumn: `span ${span}` }}
      className={`rounded-lg border-2 border-dashed min-h-[72px] transition-colors ${
        isEditing
          ? droppableOver || isOver
            ? 'border-primary bg-primary/10'
            : 'border-border/50 bg-muted/20'
          : 'border-transparent'
      }`}
    />
  )
}

interface Props {
  layout: SalaLayout
  isAdmin: boolean
  userId: string
  onSave: (layout: SalaLayout) => Promise<void>
}

export function DeskBoard({ layout: initialLayout, isAdmin, userId, onSave }: Props) {
  const [layout, setLayout] = useState<SalaLayout>(initialLayout)
  const [isEditing, setIsEditing] = useState(false)
  const [savedLayout, setSavedLayout] = useState<SalaLayout>(initialLayout)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const updateCard = useCallback((updated: DeskCardType) => {
    setLayout(prev => ({ cards: prev.cards.map(c => c.id === updated.id ? updated : c) }))
    setDirty(true)
  }, [])

  const deleteCard = useCallback((id: string) => {
    setLayout(prev => ({ cards: prev.cards.filter(c => c.id !== id) }))
    setDirty(true)
  }, [])

  const addCard = useCallback((type: 'single' | 'double') => {
    // Find first available cell
    const occupied = new Set<string>()
    layout.cards.forEach(c => {
      occupied.add(`${c.row}-${c.col}`)
      if (c.type === 'double') occupied.add(`${c.row}-${c.col + 1}`)
    })

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (occupied.has(`${row}-${col}`)) continue
        if (type === 'double') {
          // Need 2 consecutive cols in same row
          if (col + 1 >= COLS) continue
          if (occupied.has(`${row}-${col + 1}`)) continue
        }
        const newCard: DeskCardType = {
          id: crypto.randomUUID(),
          title: type === 'single' ? 'Scrivania' : 'Scrivania doppia',
          type,
          hasTirocinante: false,
          surnames: type === 'single' ? [''] : ['', ''],
          tirocinante: '',
          row,
          col,
        }
        setLayout(prev => ({ cards: [...prev.cards, newCard] }))
        setDirty(true)
        return
      }
    }
  }, [layout.cards])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const cardId = active.id as string
    const overId = over.id as string
    if (!overId.startsWith('cell-')) return

    const [, rowStr, colStr] = overId.split('-')
    const newRow = parseInt(rowStr)
    const newCol = parseInt(colStr)

    const card = layout.cards.find(c => c.id === cardId)
    if (!card) return

    // Check if target cell is valid
    if (card.type === 'double' && newCol + 1 >= COLS) return

    // Check if target cell is free (excluding the dragged card itself)
    const occupied = new Set<string>()
    layout.cards
      .filter(c => c.id !== cardId)
      .forEach(c => {
        occupied.add(`${c.row}-${c.col}`)
        if (c.type === 'double') occupied.add(`${c.row}-${c.col + 1}`)
      })

    if (occupied.has(`${newRow}-${newCol}`)) return
    if (card.type === 'double' && occupied.has(`${newRow}-${newCol + 1}`)) return

    setLayout(prev => ({
      cards: prev.cards.map(c => c.id === cardId ? { ...c, row: newRow, col: newCol } : c),
    }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(layout)
      setSavedLayout(layout)
      setDirty(false)
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setLayout(savedLayout)
    setDirty(false)
    setIsEditing(false)
  }

  // Build occupied cell map
  const cardMap = new Map<string, DeskCardType>()
  const blockedCells = new Set<string>()
  layout.cards.forEach(c => {
    cardMap.set(`${c.row}-${c.col}`, c)
    if (c.type === 'double') blockedCells.add(`${c.row}-${c.col + 1}`)
  })

  const activeCard = activeId ? layout.cards.find(c => c.id === activeId) : null

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-3 p-4">
        {isAdmin && (
          <EditToolbar
            isEditing={isEditing}
            dirty={dirty}
            saving={saving}
            onStartEdit={() => setIsEditing(true)}
            onSave={handleSave}
            onCancel={handleCancel}
            onAddCard={addCard}
          />
        )}

        {/* Grid 3×5 */}
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: ROWS }).flatMap((_, row) => {
            const cells: React.ReactNode[] = []
            let col = 0
            while (col < COLS) {
              const key = `${row}-${col}`
              if (blockedCells.has(key)) {
                col++
                continue
              }
              const card = cardMap.get(key)
              const span = card?.type === 'double' ? 2 : 1
              if (card) {
                cells.push(
                  <div
                    key={card.id}
                    style={{ gridColumn: `span ${span}` }}
                    className="min-h-[72px]"
                  >
                    <DeskCard
                      card={card}
                      isEditing={isEditing}
                      onUpdate={updateCard}
                      onDelete={deleteCard}
                    />
                  </div>
                )
              } else {
                cells.push(
                  <GridCell
                    key={key}
                    row={row}
                    col={col}
                    span={1}
                    isEditing={isEditing}
                    isEmpty={true}
                  />
                )
              }
              col += span
            }
            return cells
          })}
        </div>
      </div>

      <DragOverlay>
        {activeCard && (
          <div className="min-h-[72px] w-full opacity-90">
            <DeskCard
              card={activeCard}
              isEditing={false}
              onUpdate={() => {}}
              onDelete={() => {}}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
