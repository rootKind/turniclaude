'use client'
import { useRef, useState, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, UserPlus, Link2 } from 'lucide-react'
import type { DeskCard as DeskCardType } from '@/types/database'

interface Props {
  card: DeskCardType
  isEditing: boolean
  minWidth: number
  tirocinanteWidth: number
  scheduleSections: string[]
  onUpdate: (card: DeskCardType) => void
  onDelete: (id: string) => void
}

export function DeskCard({ card, isEditing, minWidth, tirocinanteWidth, scheduleSections, onUpdate, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !isEditing,
  })

  const firstTirRef = useRef<HTMLDivElement>(null)
  const [tirWide, setTirWide] = useState(false)
  const tirocinanti: string[] = card.tirocinanti ?? (card.hasTirocinante ? [card.tirocinante ?? ''] : [])
  const tirCount = tirocinanti.length

  useEffect(() => {
    const el = firstTirRef.current
    if (!el) { setTirWide(false); return }
    const ro = new ResizeObserver(([entry]) => {
      setTirWide(entry.contentRect.width >= 70)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [tirCount])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  const updateSurname = (index: number, value: string) => {
    const surnames = [...card.surnames]
    surnames[index] = value
    onUpdate({ ...card, surnames })
  }

  const updateTirocinante = (index: number, value: string) => {
    const tir = [...tirocinanti]
    tir[index] = value
    onUpdate({ ...card, tirocinanti: tir })
  }

  const cycleTirocinanti = () => {
    if (tirocinanti.length === 0) onUpdate({ ...card, tirocinanti: [''] })
    else if (tirocinanti.length === 1) onUpdate({ ...card, tirocinanti: [tirocinanti[0], ''] })
    else onUpdate({ ...card, tirocinanti: [] })
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card border border-border rounded-lg overflow-hidden flex h-full"
    >
      {/* Main area */}
      <div className="flex flex-col" style={{ minWidth: `${minWidth}px` }}>
        {/* Title row — fixed h-7 to match tirocinante header */}
        <div className="flex items-center gap-1 px-2 border-b border-border bg-muted/40 shrink-0" style={{ height: '28px' }}>
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
            <span className="text-xs font-semibold whitespace-nowrap">{card.title}</span>
          )}
          {isEditing && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={cycleTirocinanti}
                className={`p-0.5 rounded transition-colors ${tirocinanti.length > 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title={`Tirocinanti: ${tirocinanti.length}/2`}
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

        {/* Section key picker — only in edit mode when schedule sections available */}
        {isEditing && scheduleSections.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 border-b border-border/50 bg-muted/20">
            <Link2 size={10} className={card.sectionKey ? 'text-primary' : 'text-muted-foreground/50'} />
            <select
              value={card.sectionKey ?? ''}
              onChange={e => onUpdate({ ...card, sectionKey: e.target.value || undefined })}
              className="flex-1 text-[10px] bg-transparent outline-none text-muted-foreground cursor-pointer min-w-0"
              title="Sezione PDF collegata"
            >
              <option value="">— usa titolo —</option>
              {scheduleSections.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}

        {/* Surnames */}
        <div className="flex flex-1 items-center px-2 py-2 gap-3">
          {card.surnames.map((surname, i) => (
            <div key={i} className="shrink-0">
              {isEditing ? (
                <input
                  className="text-sm bg-transparent outline-none border-b border-border focus:border-primary text-foreground placeholder:text-muted-foreground"
                  style={{ minWidth: '52px', width: `${Math.max(52, surname.length * 9)}px` }}
                  value={surname}
                  onChange={e => updateSurname(i, e.target.value)}
                  placeholder="Cognome"
                />
              ) : (
                <span className="text-sm font-medium whitespace-nowrap">
                  {surname || <span className="text-muted-foreground/40">—</span>}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tirocinante slots — up to 2, each to the right of the previous */}
      {tirocinanti.map((tir, i) => (
        <div
          key={i}
          ref={i === 0 ? firstTirRef : undefined}
          className="border-l border-border flex flex-col shrink-0"
          style={{ minWidth: `${tirocinanteWidth}px` }}
        >
          {/* Header — same height as title row */}
          <div className="px-1 border-b border-border bg-muted/40 flex items-center shrink-0" style={{ height: '28px' }}>
            <span className="text-[10px] text-muted-foreground font-medium leading-none whitespace-nowrap">
              {tirWide ? 'Tirocinante' : 'Tir.'}
            </span>
          </div>
          <div className="flex-1 flex items-center px-1 py-2">
            {isEditing ? (
              <input
                className="w-full text-xs bg-transparent outline-none border-b border-border focus:border-primary text-foreground placeholder:text-muted-foreground"
                value={tir}
                onChange={e => updateTirocinante(i, e.target.value)}
                placeholder="Cogn."
              />
            ) : (
              <span className="text-xs font-medium whitespace-nowrap">
                {tir || <span className="text-muted-foreground/40">—</span>}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
