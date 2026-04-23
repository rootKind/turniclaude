'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RotateCcw, Save, Sun, Moon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { applyColorOverrides, clearColorOverrides, type ColorOverrides } from '@/lib/color-overrides'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type Theme = 'light' | 'dark'

const LIGHT_DEFAULTS: Record<string, string> = {
  '--background': '#f0f7fc',
  '--foreground': '#1c1c1c',
  '--card': '#f5f9fc',
  '--card-foreground': '#1c1c1c',
  '--primary': '#2a2a2a',
  '--primary-foreground': '#f8f8f8',
  '--secondary': '#e6edf5',
  '--secondary-foreground': '#2a2a2a',
  '--muted': '#e6edf5',
  '--muted-foreground': '#727272',
  '--accent': '#e6edf5',
  '--accent-foreground': '#2a2a2a',
  '--destructive': '#d94f37',
  '--border': '#d5e0ec',
  '--shift-others-bg': '#dde8f0',
  '--shift-others-date-bg': '#d0dde8',
  '--shift-others-date-border': '#bdd0e0',
  '--shift-own-empty-bg': '#e4e4f0',
  '--shift-own-empty-date-bg': '#d8d8ec',
  '--shift-own-empty-border': '#c8c8e0',
  '--shift-own-interest-bg': '#dcfce7',
  '--shift-own-interest-date-bg': '#bbf7d0',
  '--shift-own-interest-border': '#86efac',
  '--shift-highlight-bg': '#fef9e7',
  '--shift-highlight-date-bg': '#fef3c7',
  '--pill-mattina-bg': '#dbeafe',
  '--pill-mattina-text': '#1d4ed8',
  '--pill-pomeriggio-bg': '#fef3c7',
  '--pill-pomeriggio-text': '#b45309',
  '--pill-notte-bg': '#ede9fe',
  '--pill-notte-text': '#6d28d9',
}

const DARK_DEFAULTS: Record<string, string> = {
  '--background': '#1a1a1a',
  '--foreground': '#f5f5f5',
  '--card': '#282828',
  '--card-foreground': '#f5f5f5',
  '--primary': '#ebebeb',
  '--primary-foreground': '#282828',
  '--secondary': '#363636',
  '--secondary-foreground': '#f5f5f5',
  '--muted': '#363636',
  '--muted-foreground': '#b5b5b5',
  '--accent': '#363636',
  '--accent-foreground': '#f5f5f5',
  '--destructive': '#d94f37',
  '--border': '#2e2e2e',
  '--shift-others-bg': '#1a1a1a',
  '--shift-others-date-bg': '#252525',
  '--shift-others-date-border': '#2e2e2e',
  '--shift-own-empty-bg': '#2a2a35',
  '--shift-own-empty-date-bg': '#32323f',
  '--shift-own-empty-border': '#3a3a4a',
  '--shift-own-interest-bg': '#162416',
  '--shift-own-interest-date-bg': '#1a2e1a',
  '--shift-own-interest-border': '#22c55e40',
  '--shift-highlight-bg': '#2a2000',
  '--shift-highlight-date-bg': '#332800',
  '--pill-mattina-bg': '#1e3a5f',
  '--pill-mattina-text': '#60a5fa',
  '--pill-pomeriggio-bg': '#3b2300',
  '--pill-pomeriggio-text': '#fbbf24',
  '--pill-notte-bg': '#2d1b69',
  '--pill-notte-text': '#a78bfa',
}

const COLOR_GROUPS: { label: string; tokens: { key: string; label: string }[] }[] = [
  {
    label: 'UI Base',
    tokens: [
      { key: '--background', label: 'Sfondo' },
      { key: '--foreground', label: 'Testo' },
      { key: '--card', label: 'Card' },
      { key: '--card-foreground', label: 'Testo card' },
      { key: '--primary', label: 'Primario' },
      { key: '--primary-foreground', label: 'Testo primario' },
      { key: '--secondary', label: 'Secondario' },
      { key: '--muted', label: 'Sfondo muted' },
      { key: '--muted-foreground', label: 'Testo muted' },
      { key: '--accent', label: 'Accent' },
      { key: '--destructive', label: 'Distruttivo' },
      { key: '--border', label: 'Bordo' },
    ],
  },
  {
    label: 'Turni altrui',
    tokens: [
      { key: '--shift-others-bg', label: 'Sfondo riga' },
      { key: '--shift-others-date-bg', label: 'Sfondo data' },
      { key: '--shift-others-date-border', label: 'Bordo data' },
    ],
  },
  {
    label: 'Turno proprio',
    tokens: [
      { key: '--shift-own-empty-bg', label: 'Sfondo riga' },
      { key: '--shift-own-empty-date-bg', label: 'Sfondo data' },
      { key: '--shift-own-empty-border', label: 'Bordo' },
    ],
  },
  {
    label: 'Turno con interesse',
    tokens: [
      { key: '--shift-own-interest-bg', label: 'Sfondo riga' },
      { key: '--shift-own-interest-date-bg', label: 'Sfondo data' },
      { key: '--shift-own-interest-border', label: 'Bordo' },
    ],
  },
  {
    label: 'Highlight',
    tokens: [
      { key: '--shift-highlight-bg', label: 'Sfondo riga' },
      { key: '--shift-highlight-date-bg', label: 'Sfondo data' },
    ],
  },
  {
    label: 'Pill Mattina',
    tokens: [
      { key: '--pill-mattina-bg', label: 'Sfondo' },
      { key: '--pill-mattina-text', label: 'Testo' },
    ],
  },
  {
    label: 'Pill Pomeriggio',
    tokens: [
      { key: '--pill-pomeriggio-bg', label: 'Sfondo' },
      { key: '--pill-pomeriggio-text', label: 'Testo' },
    ],
  },
  {
    label: 'Pill Notte',
    tokens: [
      { key: '--pill-notte-bg', label: 'Sfondo' },
      { key: '--pill-notte-text', label: 'Testo' },
    ],
  },
]

function isValidHex(v: string) {
  return /^#[0-9a-fA-F]{3,8}$/.test(v)
}

function ColorRow({
  token,
  value,
  defaultValue,
  onChange,
}: {
  token: string
  label: string
  value: string
  defaultValue: string
  onChange: (val: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(value)

  useEffect(() => { setText(value) }, [value])

  const effective = isValidHex(value) ? value : defaultValue

  return (
    <div className="flex items-center gap-3 py-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-8 h-8 rounded-lg border border-border flex-shrink-0 shadow-sm"
        style={{ background: effective }}
        title={token}
      />
      <input
        ref={inputRef}
        type="color"
        value={isValidHex(effective) && effective.length === 7 ? effective : '#000000'}
        onChange={e => { onChange(e.target.value); setText(e.target.value) }}
        className="sr-only"
      />
      <input
        type="text"
        value={text}
        onChange={e => {
          setText(e.target.value)
          if (isValidHex(e.target.value)) onChange(e.target.value)
        }}
        onBlur={() => {
          if (!isValidHex(text)) setText(value)
        }}
        className="flex-1 text-xs font-mono bg-muted/40 border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
        spellCheck={false}
      />
    </div>
  )
}

export function ColorSettingsPage() {
  const router = useRouter()
  const [theme, setTheme] = useState<Theme>('light')
  const [lightColors, setLightColors] = useState<Record<string, string>>({})
  const [darkColors, setDarkColors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('app_settings')
      .select('color_overrides')
      .single()
      .then(({ data }) => {
        const ov = (data?.color_overrides ?? {}) as ColorOverrides
        setLightColors(ov.light ?? {})
        setDarkColors(ov.dark ?? {})
        setLoaded(true)
      })
  }, [])

  const colors = theme === 'light' ? lightColors : darkColors
  const defaults = theme === 'light' ? LIGHT_DEFAULTS : DARK_DEFAULTS

  const setColor = useCallback((key: string, val: string) => {
    if (theme === 'light') {
      setLightColors(prev => {
        const next = { ...prev, [key]: val }
        applyColorOverrides({ light: next, dark: darkColors })
        return next
      })
    } else {
      setDarkColors(prev => {
        const next = { ...prev, [key]: val }
        applyColorOverrides({ light: lightColors, dark: next })
        return next
      })
    }
  }, [theme, lightColors, darkColors])

  async function handleSave() {
    setSaving(true)
    try {
      const supabase = createClient()
      const overrides: ColorOverrides = {}
      if (Object.keys(lightColors).length) overrides.light = lightColors
      if (Object.keys(darkColors).length) overrides.dark = darkColors
      await supabase.from('app_settings').update({ color_overrides: overrides }).eq('id', true)
      toast.success('Colori salvati')
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    if (theme === 'light') {
      setLightColors({})
      applyColorOverrides({ light: {}, dark: darkColors })
    } else {
      setDarkColors({})
      applyColorOverrides({ light: lightColors, dark: {} })
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const newLight = theme === 'light' ? {} : lightColors
      const newDark = theme === 'dark' ? {} : darkColors
      const overrides: ColorOverrides = {}
      if (Object.keys(newLight).length) overrides.light = newLight
      if (Object.keys(newDark).length) overrides.dark = newDark
      await supabase.from('app_settings').update({ color_overrides: overrides }).eq('id', true)
      toast.success('Ripristinati i colori predefiniti')
    } catch {
      toast.error('Errore nel ripristino')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetAll() {
    setLightColors({})
    setDarkColors({})
    clearColorOverrides()
    setSaving(true)
    try {
      const supabase = createClient()
      await supabase.from('app_settings').update({ color_overrides: {} }).eq('id', true)
      toast.success('Tutti i colori ripristinati')
    } catch {
      toast.error('Errore nel ripristino')
    } finally {
      setSaving(false)
    }
  }

  const hasOverrides = Object.keys(colors).length > 0
  const hasAnyOverrides = Object.keys(lightColors).length > 0 || Object.keys(darkColors).length > 0

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold flex-1">Gestione colori</h1>
        {hasAnyOverrides && (
          <button
            onClick={handleResetAll}
            disabled={saving}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted transition-colors disabled:opacity-40"
          >
            <RotateCcw size={12} />
            Reset tutto
          </button>
        )}
      </div>

      {/* Theme tab */}
      <div className="flex gap-2 mb-6 p-1 rounded-xl bg-muted/50 border border-border">
        <button
          onClick={() => setTheme('light')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors',
            theme === 'light' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Sun size={15} /> Chiaro
        </button>
        <button
          onClick={() => setTheme('dark')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors',
            theme === 'dark' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Moon size={15} /> Scuro
        </button>
      </div>

      {!loaded && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border bg-muted/20 h-32 animate-pulse" />
          ))}
        </div>
      )}

      {loaded && (
        <div className="space-y-4">
          {COLOR_GROUPS.map(group => (
            <div key={group.label} className="rounded-xl border bg-card px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {group.label}
              </p>
              <div className="divide-y divide-border/50">
                {group.tokens.map(({ key, label }) => (
                  <ColorRow
                    key={key}
                    token={key}
                    label={label}
                    value={colors[key] ?? defaults[key] ?? '#000000'}
                    defaultValue={defaults[key] ?? '#000000'}
                    onChange={val => setColor(key, val)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-background/90 backdrop-blur border-t border-border flex gap-3">
        {hasOverrides && (
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
          >
            <RotateCcw size={15} />
            Ripristina {theme === 'light' ? 'chiaro' : 'scuro'}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          <Save size={15} />
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
      </div>
    </div>
  )
}
