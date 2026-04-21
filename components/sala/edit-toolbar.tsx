'use client'
import { Pencil, Save, X, LayoutGrid, Square } from 'lucide-react'
import type { SalaLayoutDefaults } from '@/types/database'

interface Props {
  isEditing: boolean
  dirty: boolean
  saving: boolean
  defaults: SalaLayoutDefaults
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
  onAddCard: (type: 'single' | 'double') => void
  onChangeDefaults: (d: SalaLayoutDefaults) => void
}

export function EditToolbar({
  isEditing, dirty, saving, defaults,
  onStartEdit, onSave, onCancel, onAddCard, onChangeDefaults,
}: Props) {
  if (!isEditing) {
    return (
      <div className="flex justify-end">
        <button
          onClick={onStartEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pencil size={14} />
          Modifica piantina
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-muted/50 border border-border">
      {/* Add + save row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground shrink-0">Aggiungi:</span>

        <button
          onClick={() => onAddCard('single')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-background border border-border hover:border-primary hover:text-primary transition-colors"
        >
          <Square size={13} />
          Singola
        </button>

        <button
          onClick={() => onAddCard('double')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-background border border-border hover:border-primary hover:text-primary transition-colors"
        >
          <LayoutGrid size={13} />
          Doppia
        </button>

        <div className="flex-1" />

        {dirty && (
          <span className="text-xs text-amber-500 font-medium shrink-0">
            Modifiche non salvate
          </span>
        )}

        <button
          onClick={onCancel}
          disabled={saving}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-background border border-border transition-colors"
        >
          <X size={13} />
          Annulla
        </button>

        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <Save size={13} />
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>

      {/* Min-width defaults row */}
      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border/50">
        <span className="text-[11px] font-semibold text-muted-foreground shrink-0">Larghezza min:</span>

        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Singola
          <input
            type="number"
            min={40}
            max={400}
            value={defaults.singleMinWidth}
            onChange={e => onChangeDefaults({ ...defaults, singleMinWidth: Number(e.target.value) })}
            className="w-16 px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[11px] outline-none focus:border-primary"
          />
          px
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Doppia
          <input
            type="number"
            min={80}
            max={600}
            value={defaults.doubleMinWidth}
            onChange={e => onChangeDefaults({ ...defaults, doubleMinWidth: Number(e.target.value) })}
            className="w-16 px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[11px] outline-none focus:border-primary"
          />
          px
        </label>

        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Tirocinio
          <input
            type="number"
            min={30}
            max={200}
            value={defaults.tirocinanteWidth}
            onChange={e => onChangeDefaults({ ...defaults, tirocinanteWidth: Number(e.target.value) })}
            className="w-16 px-1.5 py-0.5 rounded border border-border bg-background text-foreground text-[11px] outline-none focus:border-primary"
          />
          px
        </label>
      </div>
    </div>
  )
}
