'use client'
import { useRef, useState, useEffect } from 'react'
import { Trash2, UserPlus, Link2, ArrowLeftRight, ArrowUpDown, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
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
}

const ALIGN_ICONS = [
  ['left', AlignLeft],
  ['center', AlignCenter],
  ['right', AlignRight],
] as const

export function DeskCard({ card, isEditing, highlighted, minWidth, tirocinanteWidth, scheduleSections, onUpdate, onDelete }: Props) {
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

  const isDoubleCol = card.type === 'double' && card.doubleLayout === 'col'
  const toggleDoubleLayout = () => onUpdate({ ...card, doubleLayout: isDoubleCol ? 'row' : 'col' })

  const currentRow = card.row ?? 1
  const currentAlign = card.align ?? 'left'

  return (
    <div
      className={`bg-card rounded-lg overflow-hidden flex h-full border ${highlighted ? 'border-amber-400 ring-2 ring-amber-300/40' : 'border-border'}`}
    >
      {/* Main area */}
      <div className="flex flex-col" style={{ minWidth: `${minWidth}px` }}>
        {/* Title row */}
        <div className="flex items-center gap-1 px-2 border-b border-border bg-muted/40 shrink-0" style={{ height: '28px' }}>
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
        </div>

        {/* Row + align pickers — edit mode only */}
        {isEditing && (
          <div className="flex items-center gap-2 px-2 py-0.5 border-b border-border/50 bg-muted/20">
            <span className="text-[10px] text-muted-foreground shrink-0">R:</span>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4].map(r => (
                <button
                  key={r}
                  onClick={() => onUpdate({ ...card, row: r })}
                  className={`w-5 h-5 text-[10px] rounded font-medium transition-colors ${
                    currentRow === r
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background border border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-0.5 ml-1">
              {ALIGN_ICONS.map(([a, Icon]) => (
                <button
                  key={a}
                  onClick={() => onUpdate({ ...card, align: a })}
                  className={`p-0.5 rounded transition-colors ${
                    currentAlign === a
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title={a}
                >
                  <Icon size={12} />
                </button>
              ))}
            </div>
          </div>
        )}

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
        {isDoubleCol ? (
          <div className="flex flex-col flex-1">
            {card.surnames.map((surname, i) => (
              <div
                key={i}
                className={`flex flex-1 items-center px-2 ${i < card.surnames.length - 1 ? 'border-b border-border/50' : ''}`}
              >
                {isEditing ? (
                  <input
                    className="text-sm bg-transparent outline-none border-b border-border focus:border-primary text-foreground placeholder:text-muted-foreground w-full"
                    value={surname}
                    onChange={e => updateSurname(i, e.target.value)}
                    placeholder="Cognome"
                  />
                ) : (
                  <span className="text-sm font-medium whitespace-nowrap leading-tight">
                    {surname || <span className="text-muted-foreground/40">—</span>}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
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
        )}
      </div>

      {/* Tirocinante slots */}
      {tirCount === 2 ? (
        <div
          ref={firstTirRef}
          className="border-l border-border flex flex-col shrink-0"
          style={{ minWidth: `${tirocinanteWidth}px` }}
        >
          <div className="px-1 border-b border-border bg-muted/40 flex items-center shrink-0" style={{ height: '28px' }}>
            <span className="text-[10px] text-muted-foreground font-medium leading-none whitespace-nowrap">
              {tirWide ? 'Tirocinante' : 'Tir.'}
            </span>
          </div>
          {tirocinanti.map((tir, i) => (
            <div key={i} className={`flex flex-1 items-center px-1 ${i === 0 ? 'border-b border-border/50' : ''}`}>
              {isEditing ? (
                <input
                  className="w-full text-xs bg-transparent outline-none border-b border-border focus:border-primary text-foreground placeholder:text-muted-foreground"
                  value={tir}
                  onChange={e => updateTirocinante(i, e.target.value)}
                  placeholder="Cogn."
                />
              ) : (
                <span className="text-xs font-medium whitespace-nowrap leading-tight">
                  {tir || <span className="text-muted-foreground/40">—</span>}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : tirocinanti.map((tir, i) => (
        <div
          key={i}
          ref={i === 0 ? firstTirRef : undefined}
          className="border-l border-border flex flex-col shrink-0"
          style={{ minWidth: `${tirocinanteWidth}px` }}
        >
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
