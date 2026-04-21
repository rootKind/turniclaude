'use client'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, UserPlus } from 'lucide-react'
import type { DeskCard as DeskCardType } from '@/types/database'

interface Props {
  card: DeskCardType
  isEditing: boolean
  onUpdate: (card: DeskCardType) => void
  onDelete: (id: string) => void
}

export function DeskCard({ card, isEditing, onUpdate, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !isEditing,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  const updateSurname = (index: number, value: string) => {
    const surnames = [...card.surnames]
    surnames[index] = value
    onUpdate({ ...card, surnames })
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card border border-border rounded-lg overflow-hidden flex h-full"
    >
      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/40">
          {isEditing && (
            <button
              {...listeners}
              {...attributes}
              className="touch-none text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing shrink-0"
              aria-label="Trascina"
            >
              <GripVertical size={14} />
            </button>
          )}
          {isEditing ? (
            <input
              className="flex-1 text-xs font-semibold bg-transparent outline-none min-w-0 text-foreground placeholder:text-muted-foreground"
              value={card.title}
              onChange={e => onUpdate({ ...card, title: e.target.value })}
              placeholder="Titolo scrivania"
            />
          ) : (
            <span className="flex-1 text-xs font-semibold truncate">{card.title}</span>
          )}
          {isEditing && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onUpdate({ ...card, hasTirocinante: !card.hasTirocinante })}
                className={`p-0.5 rounded transition-colors ${card.hasTirocinante ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title="Tirocinante"
              >
                <UserPlus size={13} />
              </button>
              <button
                onClick={() => onDelete(card.id)}
                className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Surnames area */}
        <div className="flex flex-1 items-center px-2 py-2 gap-2">
          {card.surnames.map((surname, i) => (
            <div key={i} className="flex-1 min-w-0">
              {isEditing ? (
                <input
                  className="w-full text-sm bg-transparent outline-none border-b border-border focus:border-primary text-foreground placeholder:text-muted-foreground"
                  value={surname}
                  onChange={e => updateSurname(i, e.target.value)}
                  placeholder="Cognome"
                />
              ) : (
                <span className="text-sm font-medium truncate block">
                  {surname || <span className="text-muted-foreground/40">—</span>}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tirocinante slot */}
      {card.hasTirocinante && (
        <div className="border-l border-border flex flex-col w-16 shrink-0">
          <div className="px-1 py-1 border-b border-border bg-muted/40">
            <span className="text-[10px] text-muted-foreground font-medium leading-none">Tiroc.</span>
          </div>
          <div className="flex-1 flex items-center px-1 py-2">
            {isEditing ? (
              <input
                className="w-full text-xs bg-transparent outline-none border-b border-border focus:border-primary text-foreground placeholder:text-muted-foreground"
                value={card.tirocinante}
                onChange={e => onUpdate({ ...card, tirocinante: e.target.value })}
                placeholder="Cogn."
              />
            ) : (
              <span className="text-xs font-medium truncate block">
                {card.tirocinante || <span className="text-muted-foreground/40">—</span>}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
