'use client'
import { useRef, useState } from 'react'
import { Trash2, UserPlus, Link2, ArrowLeftRight, ArrowUpDown, GripVertical, Palette } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { DeskCard as DeskCardType } from '@/types/database'

interface Props {
  card: DeskCardType
  isEditing: boolean
  highlighted?: boolean
  minWidth: number
  tirocinanteWidth: number
  scheduleSections: string[]
  onUpdate: (card: DeskCardType) => void
  onDelete: (id: string) => void
  isDragOverlay?: boolean
  canEditColors?: boolean
  onColorChange?: (name: string, color: string | null) => void
}

const toTitleCase = (s: string) =>
  s ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s

// preset colors cycle on the ⬜ button: none → green → salmon → none
const PRESET_CYCLE: Array<string | null> = ['green', 'salmon', null]

function colorToHex(color: string | null | undefined): string {
  if (!color) return '#000000'
  if (color === 'green') return '#10b981'
  if (color === 'salmon') return '#f87171'
  return color
}

function isCustomColor(color: string | null | undefined): boolean {
  return !!color && color !== 'green' && color !== 'salmon'
}

export function DeskCard({ card, isEditing, highlighted, minWidth, tirocinanteWidth: _, scheduleSections, onUpdate, onDelete, isDragOverlay, canEditColors, onColorChange }: Props) {
  const firstTirRef = useRef<HTMLDivElement>(null)
  const tirocinanti: string[] = card.tirocinanti ?? (card.hasTirocinante ? [card.tirocinante ?? ''] : [])
  const tirCount = tirocinanti.length
  const [colorPickerOpen, setColorPickerOpen] = useState(false)
  // One color-input ref per picker row — keyed by name
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    disabled: !isEditing || isDragOverlay,
  })

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

  const cyclePreset = (name: string) => {
    if (!onColorChange || !name) return
    const current = card.surnameColors?.[name] ?? null
    // If currently a custom color, go straight to null
    const base = isCustomColor(current) ? null : current
    const idx = PRESET_CYCLE.indexOf(base)
    const next = PRESET_CYCLE[(idx + 1) % PRESET_CYCLE.length]
    onColorChange(name, next)
  }

  const isDoubleCol = card.type === 'double' && card.doubleLayout === 'col'
  const filledNames = card.surnames.filter(Boolean)
  const useColLayout = isDoubleCol || filledNames.length > 2 || (card.type === 'single' && filledNames.length > 1)

  const getSlotClass = (i: number): string => {
    const slot = card.surnameSlots?.[i]
    if (slot === 'S') return 'italic text-muted-foreground'
    return ''
  }

  const getColor = (name: string) => card.surnameColors?.[name]

  const renderDot = (name: string) => {
    const col = getColor(name)
    if (!col) return null
    if (col === 'green') return <span className="text-emerald-500 select-none">●</span>
    if (col === 'salmon') return <span className="text-red-400 select-none">●</span>
    return <span style={{ color: col }} className="select-none">●</span>
  }

  const renderName = (surname: string, i: number) => {
    const dot = renderDot(surname)
    const slotClass = getSlotClass(i)
    return (
      <span className={`text-sm whitespace-nowrap leading-tight flex items-center gap-0.5 ${slotClass}`}>
        {dot}
        {surname ? toTitleCase(surname) : <span className="text-muted-foreground/40">—</span>}
        {dot}
      </span>
    )
  }

  const toggleDoubleLayout = () => onUpdate({ ...card, doubleLayout: isDoubleCol ? 'row' : 'col' })

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  const displayTitle = isEditing
    ? card.title
    : card.title.replace(/\s*doppia\s*/gi, '').trim()

  // All names that appear in the color picker: surnames + tirocinanti
  const pickerNames: Array<{ name: string; label: string }> = [
    ...filledNames.map(n => ({ name: n, label: toTitleCase(n) })),
    ...tirocinanti.filter(Boolean).map(n => ({ name: n, label: `Tir. ${toTitleCase(n)}` })),
  ]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card rounded-lg overflow-hidden flex flex-col h-full border transition-opacity ${
        highlighted ? 'border-amber-400 ring-2 ring-amber-300/40' : 'border-border'
      } ${isDragging && !isDragOverlay ? 'opacity-40' : ''}`}
    >
      {/* Main area */}
      <div className="flex flex-col flex-1 min-h-0" style={{ minWidth: `${minWidth}px` }}>
        {/* Title row */}
        <div
          className={`flex items-center gap-1 px-2 border-b border-border bg-muted/40 shrink-0 ${!isEditing ? 'justify-center' : ''}`}
          style={{ height: '28px' }}
        >
          {isEditing && (
            <button
              {...attributes}
              {...listeners}
              className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0"
              title="Trascina per riposizionare"
            >
              <GripVertical size={13} />
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
            <span className="text-xs font-semibold whitespace-nowrap">{displayTitle}</span>
          )}
          {isEditing && (
            <div className="flex items-center gap-1 shrink-0">
              {card.type === 'double' && (
                <button
                  onClick={toggleDoubleLayout}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                  title={isDoubleCol ? 'Nomi affiancati' : 'Nomi sovrapposti'}
                >
                  {isDoubleCol ? <ArrowLeftRight size={13} /> : <ArrowUpDown size={13} />}
                </button>
              )}
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
          {!isEditing && canEditColors && pickerNames.length > 0 && (
            <button
              onClick={() => setColorPickerOpen(v => !v)}
              className={`p-0.5 rounded transition-colors shrink-0 ${colorPickerOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              title="Imposta colori"
            >
              <Palette size={12} />
            </button>
          )}
        </div>

        {/* Section key picker */}
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

        {/* Inline color picker */}
        {colorPickerOpen && !isEditing && (
          <div className="border-b border-border bg-muted/20 px-2 py-1.5 flex flex-col gap-1.5">
            {pickerNames.map(({ name, label }) => {
              const current = card.surnameColors?.[name] ?? null
              const custom = isCustomColor(current)
              return (
                <div key={name} className="flex items-center justify-between gap-1">
                  <span className="text-[10px] text-muted-foreground truncate flex-1">{label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* none */}
                    <button
                      onClick={() => onColorChange?.(name, null)}
                      className={`w-4 h-4 rounded-full border-2 transition-colors ${
                        current === null ? 'border-primary bg-primary/20' : 'border-border bg-transparent hover:border-muted-foreground'
                      }`}
                      title="Nessun colore"
                    />
                    {/* green */}
                    <button
                      onClick={() => onColorChange?.(name, 'green')}
                      className={`w-4 h-4 rounded-full border-2 transition-colors bg-emerald-500 ${
                        current === 'green' ? 'border-primary scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                      title="Verde"
                    />
                    {/* salmon */}
                    <button
                      onClick={() => onColorChange?.(name, 'salmon')}
                      className={`w-4 h-4 rounded-full border-2 transition-colors bg-red-400 ${
                        current === 'salmon' ? 'border-primary scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                      title="Salmone"
                    />
                    {/* custom color */}
                    <label
                      className={`w-4 h-4 rounded-full border-2 cursor-pointer transition-colors overflow-hidden ${
                        custom ? 'border-primary scale-110' : 'border-border hover:border-muted-foreground'
                      }`}
                      style={custom ? { background: current! } : { background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
                      title="Colore personalizzato"
                    >
                      <input
                        ref={el => { colorInputRefs.current[name] = el }}
                        type="color"
                        className="sr-only"
                        value={colorToHex(current)}
                        onChange={e => onColorChange?.(name, e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Surnames */}
        {useColLayout ? (
          <div className="flex flex-col flex-1 bg-muted/60 items-center justify-center">
            {card.surnames.map((surname, i) => (
              <div key={i} className="flex items-center px-2 py-0.5">
                {isEditing ? (
                  <input
                    className="text-sm bg-transparent outline-none border-b border-border focus:border-primary text-foreground placeholder:text-muted-foreground w-full"
                    value={surname}
                    onChange={e => updateSurname(i, e.target.value)}
                    placeholder="Cognome"
                  />
                ) : renderName(surname, i)}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-2 py-2 gap-3 bg-muted/60">
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
                ) : renderName(surname, i)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tirocinante bottom extension */}
      {tirCount > 0 && (
        <div className="border-t border-border shrink-0">
          <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 bg-muted/50">
            {tirocinanti.map((tir, i) => (
              <div key={i} ref={i === 0 ? firstTirRef : undefined} className="flex items-center gap-1">
                <span className="text-[8px] text-muted-foreground font-medium uppercase leading-none">Tir.</span>
                {isEditing ? (
                  <input
                    className="text-xs bg-transparent outline-none border-b border-border focus:border-primary text-foreground placeholder:text-muted-foreground"
                    value={tir}
                    onChange={e => updateTirocinante(i, e.target.value)}
                    placeholder="Cogn."
                  />
                ) : (
                  <span className="text-xs whitespace-nowrap italic text-muted-foreground flex items-center gap-0.5">
                    {renderDot(tir)}
                    {tir ? toTitleCase(tir) : <span className="text-muted-foreground/40">—</span>}
                    {renderDot(tir)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
