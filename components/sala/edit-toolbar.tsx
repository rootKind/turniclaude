'use client'
import { Pencil, Save, X, LayoutGrid, Square } from 'lucide-react'

interface Props {
  isEditing: boolean
  dirty: boolean
  saving: boolean
  onStartEdit: () => void
  onSave: () => void
  onCancel: () => void
  onAddCard: (type: 'single' | 'double') => void
}

export function EditToolbar({ isEditing, dirty, saving, onStartEdit, onSave, onCancel, onAddCard }: Props) {
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
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-muted/50 border border-border">
      <span className="text-xs font-semibold text-muted-foreground mr-1 shrink-0">Aggiungi:</span>

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
  )
}
