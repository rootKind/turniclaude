'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Crosshair, RotateCcw, ChevronDown, ChevronUp, Sun, Moon, Save, Loader2 } from 'lucide-react'
import { useColorInspectStore } from '@/stores/color-inspect-store'
import { applyColorOverrides, type ColorOverrides } from '@/lib/color-overrides'
import { VAR_LABELS } from '@/lib/color-inspect-map'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type Theme = 'light' | 'dark'

const LIGHT_DEFAULTS: Record<string, string> = {
  '--background': '#f0f7fc', '--foreground': '#1c1c1c', '--card': '#f5f9fc',
  '--card-foreground': '#1c1c1c', '--primary': '#2a2a2a', '--primary-foreground': '#f8f8f8',
  '--secondary': '#e6edf5', '--secondary-foreground': '#2a2a2a', '--muted': '#e6edf5',
  '--muted-foreground': '#727272', '--accent': '#e6edf5', '--accent-foreground': '#2a2a2a',
  '--destructive': '#d94f37', '--border': '#d5e0ec', '--input': '#d5e0ec',
  '--shift-others-bg': '#dde8f0', '--shift-others-date-bg': '#d0dde8',
  '--shift-others-date-border': '#bdd0e0', '--shift-own-empty-bg': '#e4e4f0',
  '--shift-own-empty-date-bg': '#d8d8ec', '--shift-own-empty-border': '#c8c8e0',
  '--shift-own-interest-bg': '#dcfce7', '--shift-own-interest-date-bg': '#bbf7d0',
  '--shift-own-interest-border': '#86efac', '--shift-highlight-bg': '#fef9e7',
  '--shift-highlight-date-bg': '#fef3c7', '--pill-mattina-bg': '#dbeafe',
  '--pill-mattina-text': '#1d4ed8', '--pill-pomeriggio-bg': '#fef3c7',
  '--pill-pomeriggio-text': '#b45309', '--pill-notte-bg': '#ede9fe',
  '--pill-notte-text': '#6d28d9',
}
const DARK_DEFAULTS: Record<string, string> = {
  '--background': '#1a1a1a', '--foreground': '#f5f5f5', '--card': '#282828',
  '--card-foreground': '#f5f5f5', '--primary': '#ebebeb', '--primary-foreground': '#282828',
  '--secondary': '#363636', '--secondary-foreground': '#f5f5f5', '--muted': '#363636',
  '--muted-foreground': '#b5b5b5', '--accent': '#363636', '--accent-foreground': '#f5f5f5',
  '--destructive': '#d94f37', '--border': '#2e2e2e', '--input': '#2e2e2e',
  '--shift-others-bg': '#1a1a1a', '--shift-others-date-bg': '#252525',
  '--shift-others-date-border': '#2e2e2e', '--shift-own-empty-bg': '#2a2a35',
  '--shift-own-empty-date-bg': '#32323f', '--shift-own-empty-border': '#3a3a4a',
  '--shift-own-interest-bg': '#162416', '--shift-own-interest-date-bg': '#1a2e1a',
  '--shift-own-interest-border': '#22c55e', '--shift-highlight-bg': '#2a2000',
  '--shift-highlight-date-bg': '#332800', '--pill-mattina-bg': '#1e3a5f',
  '--pill-mattina-text': '#60a5fa', '--pill-pomeriggio-bg': '#3b2300',
  '--pill-pomeriggio-text': '#fbbf24', '--pill-notte-bg': '#2d1b69',
  '--pill-notte-text': '#a78bfa',
}

const COLOR_GROUPS: { label: string; tokens: string[] }[] = [
  { label: 'UI Base', tokens: ['--background','--foreground','--card','--card-foreground','--primary','--primary-foreground','--secondary','--muted','--muted-foreground','--accent','--destructive','--border'] },
  { label: 'Turni altrui',       tokens: ['--shift-others-bg','--shift-others-date-bg','--shift-others-date-border'] },
  { label: 'Turno proprio',      tokens: ['--shift-own-empty-bg','--shift-own-empty-date-bg','--shift-own-empty-border'] },
  { label: 'Turno con interesse',tokens: ['--shift-own-interest-bg','--shift-own-interest-date-bg','--shift-own-interest-border'] },
  { label: 'Highlight',          tokens: ['--shift-highlight-bg','--shift-highlight-date-bg'] },
  { label: 'Pill Mattina',       tokens: ['--pill-mattina-bg','--pill-mattina-text'] },
  { label: 'Pill Pomeriggio',    tokens: ['--pill-pomeriggio-bg','--pill-pomeriggio-text'] },
  { label: 'Pill Notte',         tokens: ['--pill-notte-bg','--pill-notte-text'] },
]

function isValidHex(v: string) {
  return /^#[0-9a-fA-F]{3,8}$/.test(v)
}

function ColorRow({ varName, value, defaultValue, onChange }: {
  varName: string; value: string; defaultValue: string; onChange: (v: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])

  const safeHex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : (/^#[0-9a-fA-F]{6}$/.test(defaultValue) ? defaultValue : '#000000')
  const info = VAR_LABELS[varName]

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-8 h-8 rounded-lg border border-border flex-shrink-0 shadow-sm transition-transform active:scale-95"
        style={{ background: value }}
      />
      <input ref={inputRef} type="color" value={safeHex}
        onChange={e => { onChange(e.target.value); setText(e.target.value) }}
        className="sr-only"
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-tight">{info?.label ?? varName}</p>
        <input
          type="text" value={text} spellCheck={false}
          onChange={e => { setText(e.target.value); if (isValidHex(e.target.value)) onChange(e.target.value) }}
          onBlur={() => { if (!isValidHex(text)) setText(value) }}
          className="w-full text-[11px] font-mono text-muted-foreground bg-transparent focus:outline-none focus:text-foreground"
        />
      </div>
    </div>
  )
}

export function ColorSettingsPage() {
  const router = useRouter()
  const { setActive, pendingChanges, setPendingChange, clearPending } = useColorInspectStore()
  const [theme, setTheme] = useState<Theme>('light')
  const [localLight, setLocalLight] = useState<Record<string, string>>({})
  const [localDark, setLocalDark] = useState<Record<string, string>>({})
  const [listOpen, setListOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    createClient()
      .from('app_settings')
      .select('color_overrides')
      .single()
      .then(({ data }) => {
        const ov = (data?.color_overrides ?? {}) as ColorOverrides
        setLocalLight(ov.light ?? {})
        setLocalDark(ov.dark ?? {})
        if (ov.light) Object.entries(ov.light).forEach(([k, v]) => setPendingChange('light', k, v))
        if (ov.dark) Object.entries(ov.dark).forEach(([k, v]) => setPendingChange('dark', k, v))
        setLoaded(true)
      })
  }, [])

  const colors = theme === 'light' ? localLight : localDark
  const defaults = theme === 'light' ? LIGHT_DEFAULTS : DARK_DEFAULTS

  const setColor = useCallback((varName: string, val: string) => {
    if (theme === 'light') {
      setLocalLight(prev => {
        const next = { ...prev, [varName]: val }
        applyColorOverrides({ light: next, dark: localDark })
        return next
      })
    } else {
      setLocalDark(prev => {
        const next = { ...prev, [varName]: val }
        applyColorOverrides({ light: localLight, dark: next })
        return next
      })
    }
    setPendingChange(theme, varName, val)
  }, [theme, localLight, localDark, setPendingChange])

  async function handleSave() {
    setSaving(true)
    try {
      const overrides: ColorOverrides = {}
      if (Object.keys(localLight).length) overrides.light = localLight
      if (Object.keys(localDark).length) overrides.dark = localDark
      const res = await fetch('/api/admin/save-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })
      if (!res.ok) throw new Error()
      toast.success('Colori salvati')
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetTheme() {
    if (theme === 'light') {
      setLocalLight({})
      applyColorOverrides({ light: {}, dark: localDark })
    } else {
      setLocalDark({})
      applyColorOverrides({ light: localLight, dark: {} })
    }
    await handleSaveWith(theme === 'light' ? {} : localLight, theme === 'dark' ? {} : localDark)
  }

  async function handleResetAll() {
    setLocalLight({}); setLocalDark({})
    clearPending()
    applyColorOverrides({})
    await handleSaveWith({}, {})
    toast.success('Tutti i colori ripristinati')
  }

  async function handleSaveWith(light: Record<string, string>, dark: Record<string, string>) {
    setSaving(true)
    try {
      const overrides: ColorOverrides = {}
      if (Object.keys(light).length) overrides.light = light
      if (Object.keys(dark).length) overrides.dark = dark
      await fetch('/api/admin/save-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })
    } finally {
      setSaving(false)
    }
  }

  function activateInspector() {
    setActive(true)
    router.back()
  }

  const hasOverrides = Object.keys(colors).length > 0
  const hasAny = Object.keys(localLight).length + Object.keys(localDark).length > 0

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold flex-1">Colori app</h1>
        {hasAny && (
          <button onClick={handleResetAll} disabled={saving}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted transition-colors disabled:opacity-40">
            <RotateCcw size={12} /> Reset tutto
          </button>
        )}
      </div>

      {/* Inspector CTA */}
      <button
        onClick={activateInspector}
        className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-left mb-6"
      >
        <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center flex-shrink-0 text-primary-foreground">
          <Crosshair size={22} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold">Inspector elementi</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tappa qualsiasi elemento nell'app per cambiarne il colore al volo
          </p>
        </div>
      </button>

      {/* Full list accordion */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <button
          onClick={() => setListOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-semibold hover:bg-muted/50 transition-colors"
        >
          Elenco completo variabili
          {listOpen ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
        </button>

        {listOpen && (
          <div className="border-t border-border">
            {/* Theme tab */}
            <div className="flex gap-2 m-3 p-1 rounded-xl bg-muted/50">
              {(['light', 'dark'] as const).map(t => (
                <button key={t} onClick={() => setTheme(t)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    theme === t ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                  )}>
                  {t === 'light' ? <Sun size={12} /> : <Moon size={12} />}
                  {t === 'light' ? 'Chiaro' : 'Scuro'}
                </button>
              ))}
            </div>

            {!loaded && <div className="px-4 py-8 text-center text-sm text-muted-foreground">Caricamento…</div>}

            {loaded && (
              <div className="px-4 pb-4 space-y-4">
                {COLOR_GROUPS.map(group => (
                  <div key={group.label}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 mt-2">
                      {group.label}
                    </p>
                    {group.tokens.map(varName => (
                      <ColorRow
                        key={varName}
                        varName={varName}
                        value={colors[varName] ?? defaults[varName] ?? '#000000'}
                        defaultValue={defaults[varName] ?? '#000000'}
                        onChange={val => setColor(varName, val)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky save bar — visible only when list is open and has changes */}
      {listOpen && loaded && (
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-background/95 backdrop-blur border-t border-border flex gap-3">
          {hasOverrides && (
            <button onClick={handleResetTheme} disabled={saving}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40">
              <RotateCcw size={14} />
              Reset {theme === 'light' ? 'chiaro' : 'scuro'}
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      )}
    </div>
  )
}
