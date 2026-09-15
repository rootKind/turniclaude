'use client'
import { useRef, useState } from 'react'
import { Trash2, UserPlus, Link2, ArrowLeftRight, ArrowUpDown, GripVertical, Palette } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { DeskCard as DeskCardType } from '@/types/database'
import { normName, surnameKey, type TheoRealSectionCompare } from '@/lib/turni-teorici'
import { lookupNameDisplay } from '@/lib/shift-teams-matching'
import type { YellowEntry } from '@/lib/sala-month'

interface Props {
  card: DeskCardType
  isEditing: boolean
  highlighted?: boolean
  minWidth: number
  scheduleSections: string[]
  onUpdate: (card: DeskCardType) => void
  onDelete: (id: string) => void
  isDragOverlay?: boolean
  canEditColors?: boolean
  onColorChange?: (name: string, color: string | null) => void
  /** Vista admin «Teorico ≠ reale» COMPATTA (17/09/2026): per la sezione/turno
   *  della card, righe «Cognome <reale>» (i teorici NON confermati,
   *  assenze col CODICE PDF: A/AG/F.E.) e «Nuovi» (reali di provenienza diversa:
   *  altro turno, riposo RC/RI/RM/D, non in scheda → provenienza dopo il nome). */
  theoCompare?: TheoRealSectionCompare
  /** Iniziali degli OMONIMI (richiesta 14/09/2026): chiave = nome normalizzato
   *  dal PDF («nevano pietro»), valore = «Nevano P.». Dove appare il solo
   *  cognome evita gli equivoci fra persone con lo stesso cognome. */
  nameDisplay?: Map<string, string>
  /** CELLE GIALLE del PDF (richiesta 24/09/2026 v2): gialli di QUESTA card
   *  per persona (chiave = nome normalizzato). Niente blocco a fondo card:
   *  chi è già nell'elenco viene EVIDENZIATO in giallo, chi manca viene
   *  AGGIUNTO in coda con il codice. Undefined se non ci sono gialli. */
  yellowByCard?: Map<string, YellowEntry>
  /** Cognomi presenti più volte in anagrafica: la riga PDF col solo cognome
   *  è ambigua → il nome NON si aggiunge alla card (uno dei due è giallo,
   *  ma non si sa quale). */
  duplicateCognomi?: Set<string>
}

const toTitleCase = (s: string) =>
  s ? s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : s

/** Cognome da «COGNOME Nome»/«COGNOME N.»: toglie l'ultimo token SOLO quando
 *  è un'iniziale — «DI NAPOLI M.» → «Di Napoli», «DE GIOVANNI» resta intero. */
const cognomeOf = (name: string) => {
  const parts = name.trim().split(/\s+/)
  const last = parts[parts.length - 1] ?? ''
  const display = parts.length > 1 && /^[A-Za-z]\.?$/.test(last) ? parts.slice(0, -1).join(' ') : name.trim()
  return toTitleCase(display)
}

/** Etichetta di una riga compatta: per gli OMONIMI risolve con la mappa di
 *  desk-board («NEVANO» → «Nevano P.», l'iniziale evita equivoci); per tutti
 *  gli altri resta il cognome puro com'era prima. */
const rowLabel = (name: string, nameDisplay?: Map<string, string>) =>
  lookupNameDisplay(name, nameDisplay) ?? cognomeOf(name)


function colorToHex(color: string | null | undefined): string {
  if (!color) return '#000000'
  if (color === 'green') return '#10b981'
  if (color === 'salmon') return '#f87171'
  return color
}

function isCustomColor(color: string | null | undefined): boolean {
  return !!color && color !== 'green' && color !== 'salmon'
}

export function DeskCard({ card, isEditing, highlighted, minWidth, scheduleSections, onUpdate, onDelete, isDragOverlay, canEditColors, onColorChange, theoCompare, nameDisplay, yellowByCard, duplicateCognomi }: Props) {
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

  const isDoubleCol = card.type === 'double' && card.doubleLayout === 'col'
  const filledNames = card.surnames.filter(Boolean)
  const useColLayout = isDoubleCol || filledNames.length > 2 || (card.type === 'single' && filledNames.length > 1)

  const getSlotClass = (i: number): string => {
    const slot = card.surnameSlots?.[i]
    if (slot === 'S') return 'italic text-muted-foreground'
    return ''
  }

  const getColor = (name: string) => card.surnameColors?.[name]

  // Marker GIALLA del PDF (v7, 26/09/2026): CHIP DOPO/il posto del nome che
  // INGLOBA il COGNOME (testo ROSSO --cell-abs-text, come i pill Assenti);
  // riempimento giallo = chip trasferte (--altri-pill-trasferte-bg), bordo
  // sottile del tinta-testo. La sigla del reale sta DENTRO solo per assenze
  // (A/AG/FE/VS) e attività senza sezione (corsi/trasferte): per i turni di
  // sezione la card su cui sta la persona dice già dove lavora (showCode=false).
  const YellowChip = ({ name, code }: { name: string; code?: string }) => (
    <span
      style={{
        background: 'var(--altri-pill-trasferte-bg)',
        border: '1px solid color-mix(in srgb, var(--altri-pill-trasferte-text) 30%, transparent)',
      }}
      className="select-none inline-flex items-center rounded-full px-1.5 leading-4"
    >
      <span className="text-sm font-medium whitespace-nowrap" style={{ color: 'var(--cell-abs-text)' }}>
        {name}
        {code ? <span className="text-[10px] font-semibold tabular-nums ml-1">{code}</span> : null}
      </span>
    </span>
  )
  const renderDot = (name: string) => {
    // v7: il giallo 'teo' SOSTITUISCE la riga del nome — la chip INGLOBA il
    // cognome (renderYellowRow). Qui restano solo i pallini admin.
    const y = yellowForSlot.get(normName(name))
    // Pallino del COLORE scelto dall'admin (verde/salmone/personalizzato):
    // coesiste con la chip gialla (fianco a fianco, fix 25/09/2026).
    const col = getColor(name)
    const admin = !col ? null
      : col === 'green' ? <span key="a" className="text-emerald-500 select-none">●</span>
      : col === 'salmon' ? <span key="a" className="text-red-400 select-none">●</span>
      : <span key="a" style={{ color: col }} className="select-none">●</span>
    if (y?.target === 'teo' && admin) return admin
    if (!admin) return null
    return admin
  }

  // Nome in card: per gli OMONIMI (mappa di desk-board) mostra l'iniziale
  // («NEVANO» → «Nevano P.») — richiesta 14/09/2026; gli altri restano tali e quali.
  const renderName = (surname: string, i: number) => {
    const y = yellowForSlot.get(normName(surname))
    // v7: giallo 'teo' → la chip INGLOBA il cognome al posto della riga
    // normale (renderYellowRow); i pallini admin restano fuori, a fianco.
    // Il 'real' (sostituto in slot) è interamente chip, come le righe in coda.
    if (y?.target === 'real') return renderYellowRow(y)
    if (y?.target === 'teo') {
      const admin = renderDot(surname)
      return (
        <span className="flex items-center gap-1 text-sm leading-tight whitespace-nowrap">
          {renderYellowRow(y)}
          {admin}
        </span>
      )
    }
    const dot = renderDot(surname)
    const slotClass = getSlotClass(i)
    const resolved = lookupNameDisplay(surname, nameDisplay)
    const label = resolved ?? toTitleCase(surname)
    return (
      <span className={`text-sm whitespace-nowrap leading-tight flex items-center gap-0.5 ${slotClass}`}>
        {dot}
        {surname ? (
          <span>{label}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
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
    ...filledNames.map(n => ({ name: n, label: lookupNameDisplay(n, nameDisplay) ?? toTitleCase(n) })),
    ...tirocinanti.filter(Boolean).map(n => ({ name: n, label: `Tir. ${lookupNameDisplay(n, nameDisplay) ?? toTitleCase(n)}` })),
  ]

  // GIALLI v4 (25/09/2026): match slot↔giallo tollerando le forme diverse
  // («CAIAZZO» vs «CAIAZZO M.» vs «CAIAZZO MARIO»). Le voci 'real'
  // (sostituti) presenti nell'elenco lo LASCIANO (renderName → null) e
  // finiscono in fondo; le 'teo' restano in elenco col pallino.
  const yellowForSlot = new Map<string, YellowEntry>()
  const matchedYellow = new Set<string>()
  if (yellowByCard) {
    for (const s of [...card.surnames, ...tirocinanti]) {
      if (!s) continue
      const k = normName(s)
      for (const [key, y] of yellowByCard) {
        const n = normName(y.name)
        if (n === k || surnameKey(y.name) === k || normName(cognomeOf(y.name)) === k) {
          yellowForSlot.set(k, y)
          matchedYellow.add(key)
          break
        }
      }
    }
  }
  const dupNorm = duplicateCognomi ? new Set([...duplicateCognomi].map(normName)) : null
  // v5 (25/09/2026): TUTTE le aggiunte gialle stanno IN CODA all'elenco della
  // card, senza separatore né blocco a fondo card (richiesta: Langione/Principe
  // non separati, sotto gli altri in ordine di altezza). I 'real' (sostituti)
  // presenti nell'elenco lasciano la lista e rientrano in coda col pallino.
  const yellowInList: YellowEntry[] = []
  if (yellowByCard) {
    for (const [key, y] of yellowByCard) {
      if (matchedYellow.has(key)) {
        // Già nell'elenco: il 'real' sta AL SUO POSTO (renderName), i 'teo'
        // sono marcati lì col pallino.
        continue
      } else {
        const n = normName(y.name)
        // Riga nuda di cognome DUPLICATO in anagrafica → NON aggiunta
        // (ambigua, come nel resto dell'app).
        if (!n.includes(' ') && dupNorm?.has(n)) continue
      }
      yellowInList.push(y)
    }
  }

  // Riga GIALLA (v7): «[Nome Sigla]» — la CHIP INGLOBA il cognome (rosso,
  // come i pill Assenti), la sigla del reale dentro SOLO per assenze/corsi.
  // Vale sia per le righe aggiunte in coda sia per lo slot dell'equipaggio
  // occupato dal giallo (renderName la usa al posto della riga normale).
  const renderYellowRow = (y: YellowEntry) => (
    <span className="flex items-center text-sm leading-tight">
      <YellowChip
        name={rowLabel(y.name, nameDisplay)}
        code={y.showCode && y.code ? y.code : undefined}
      />
    </span>
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sala-card-bg sala-card-border rounded-lg overflow-hidden flex flex-col h-full border transition-opacity ${
        highlighted ? 'desk-card-highlight' : ''
      } ${isDragging && !isDragOverlay ? 'opacity-40' : ''}`}
    >
      {/* Main area */}
      <div className="flex flex-col flex-1 min-h-0" style={{ minWidth: `${minWidth}px` }}>
        {/* Title row */}
        <div
          className={`flex items-center gap-1 px-2 border-b sala-card-title-sep sala-card-title shrink-0 ${!isEditing ? 'justify-center' : ''}`}
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
          <div className="flex flex-col flex-1 sala-card-body items-center justify-center">
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
            {/* v5: le aggiunte gialle in CODA all'elenco, senza separatore
                (es. Minino sulla card della P8, Langione sulla PDCP). */}
            {!isEditing && yellowInList.map((y, i) => (
              <div key={`yl-${i}`} className="flex items-center px-2 py-0.5">{renderYellowRow(y)}</div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col flex-1">
            <div className="flex flex-1 items-center justify-center px-2 py-2 gap-3 sala-card-body">
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
            {/* v5: variante RIGA con aggiunte in coda, sotto i nomi. */}
            {!isEditing && yellowInList.length > 0 && (
              <div className="flex flex-col items-center gap-0.5 px-2 pb-1.5">{yellowInList.map((y, i) => <span key={`yl-${i}`}>{renderYellowRow(y)}</span>)}</div>
            )}
          </div>
        )}
      </div>

      {/* Vista «Teorico ≠ reale» COMPATTA (solo admin): sotto i nomi reali della
          sezione. Righe teoriche NON confermate: «Cognome N6» — SOLO lo stato
          reale, in rosso (altro turno, sigla A/AG/F.E., «presente», «assente»
          solo con cella PDF vuota): la card in cui la riga sta mostra GIÀ il
          teorico atteso (sezione+turno nell'intestazione, 18/09/2026).
          Poi i «Nuovi»: reali che il teorico non prevedeva qui, con la
          provenienza (teorico di origine). */}
      {!isEditing && theoCompare && (theoCompare.rows.length > 0 || theoCompare.extras.length > 0) && (
        <div className="border-t sala-card-title-sep shrink-0 bg-muted/30">
          {theoCompare.rows.map(r => (
            <div key={r.name} className="flex items-center justify-center gap-1 px-2 py-0.5 text-[11px] leading-tight">
              <span className="whitespace-nowrap font-medium">{rowLabel(r.name, nameDisplay)}</span>
              {/* Il teorico NON si riscrive: la card in cui la riga sta parla
                  già di sezione+turno previsti (es. M 14/9). Solo il REALE —
                  spostamento, sigla di assenza, «presente»/«assente» — in rosso. */}
              <span className="tabular-nums whitespace-nowrap text-destructive font-semibold">{r.real}</span>
            </div>
 ))}
          {theoCompare.extras.map(e => (
            <div key={e.name} className="flex items-center justify-center gap-1 px-2 py-0.5 text-[11px] leading-tight">
              <span className="whitespace-nowrap font-medium">{rowLabel(e.name, nameDisplay)}</span>
              {e.theo && <span className="tabular-nums text-muted-foreground whitespace-nowrap">da {e.theo}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Tirocinante bottom extension */}
      {tirCount > 0 && (
        <div className="border-t sala-card-title-sep shrink-0">
          <div className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 sala-card-tir">
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
                ) : yellowForSlot.get(normName(tir))?.target === 'teo' ? (
                  // v7: tirocinante giallo → chip che ingloba il nome (rosso).
                  renderYellowRow(yellowForSlot.get(normName(tir))!)
                ) : (
                  <span className="text-xs whitespace-nowrap italic text-muted-foreground flex items-center gap-0.5">
                    {renderDot(tir)}
                    {tir ? lookupNameDisplay(tir, nameDisplay) ?? toTitleCase(tir) : <span className="text-muted-foreground/40">—</span>}
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
