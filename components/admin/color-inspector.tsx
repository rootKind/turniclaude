'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { X, Save, Loader2 } from 'lucide-react'
import { useColorInspectStore } from '@/stores/color-inspect-store'
import { useUserStore } from '@/stores/user-store'
import { getVarsForElement, VAR_LABELS } from '@/lib/color-inspect-map'
import { applyColorOverrides, type ColorOverrides } from '@/lib/color-overrides'
import { LIGHT_DEFAULTS, DARK_DEFAULTS } from '@/lib/color-defaults'
import { ADMIN_ID } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface HighlightRect { top: number; left: number; width: number; height: number }

export function ColorInspector() {
  const profile = useUserStore(s => s.profile)
  const { active, setActive, pendingChanges, setPendingChange, clearPending } = useColorInspectStore()
  const { resolvedTheme } = useTheme()
  const theme = (resolvedTheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark'

  const [highlight, setHighlight] = useState<HighlightRect | null>(null)
  const [sheetVars, setSheetVars] = useState<string[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const hoveredRef = useRef<HTMLElement | null>(null)
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const isAdmin = profile?.id === ADMIN_ID

  // Load current overrides from DB when first activated
  useEffect(() => {
    if (!isAdmin) return
    if (!active) return
    createClient()
      .from('app_settings')
      .select('color_overrides')
      .single()
      .then(({ data }) => {
        if (data?.color_overrides) {
          const ov = data.color_overrides as ColorOverrides
          applyColorOverrides(ov)
          // Sync pending with existing overrides
          if (ov.light) Object.entries(ov.light).forEach(([k, v]) => setPendingChange('light', k, v))
          if (ov.dark) Object.entries(ov.dark).forEach(([k, v]) => setPendingChange('dark', k, v))
        }
      })
  }, [active])

  const updateHighlight = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    setHighlight({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
  }, [])

  useEffect(() => {
    if (!active) { setHighlight(null); return }

    function onMove(e: MouseEvent | TouchEvent) {
      if (sheetOpen) return
      const point = 'touches' in e ? e.touches[0] : e
      const el = document.elementFromPoint(point.clientX, point.clientY) as HTMLElement | null
      if (el && !el.closest('[data-color-inspector-ui]')) {
        hoveredRef.current = el
        updateHighlight(el)
      }
    }

    function onClick(e: MouseEvent | TouchEvent) {
      const point = 'touches' in e ? (e as TouchEvent).changedTouches[0] : e as MouseEvent
      const el = document.elementFromPoint(point.clientX, point.clientY) as HTMLElement | null
      if (!el || el.closest('[data-color-inspector-ui]')) return
      e.preventDefault()
      e.stopPropagation()
      const vars = getVarsForElement(el)
      if (vars.length === 0) {
        toast('Elemento non personalizzabile tramite variabili CSS')
        return
      }
      hoveredRef.current = el
      updateHighlight(el)
      setSheetVars(vars)
      setSheetOpen(true)
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('click', onClick, true)
    document.addEventListener('touchend', onClick, true)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('touchend', onClick, true)
    }
  }, [active, sheetOpen, updateHighlight])

  function getCurrentValue(varName: string): string {
    const pending = pendingChanges[theme]?.[varName]
    if (pending) return pending
    const defaults = theme === 'light' ? LIGHT_DEFAULTS : DARK_DEFAULTS
    return defaults[varName] ?? '#000000'
  }

  function handleColorChange(varName: string, value: string) {
    setPendingChange(theme, varName, value)
    applyColorOverrides({
      light: { ...(pendingChanges.light ?? {}), ...(theme === 'light' ? { [varName]: value } : {}) },
      dark: { ...(pendingChanges.dark ?? {}), ...(theme === 'dark' ? { [varName]: value } : {}) },
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/save-colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: pendingChanges }),
      })
      if (!res.ok) throw new Error('Errore server')
      toast.success('Colori salvati')
    } catch {
      toast.error('Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  function handleDeactivate() {
    setActive(false)
    setSheetOpen(false)
    setHighlight(null)
  }

  if (!isAdmin || !active) return null

  return (
    <>
      {/* Highlight box */}
      {highlight && !sheetOpen && (
        <div
          className="fixed pointer-events-none z-[9990] rounded-sm"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            outline: '2px solid #3b82f6',
            outlineOffset: '1px',
            background: 'rgba(59,130,246,0.08)',
          }}
        />
      )}

      {/* Floating status bar */}
      <div
        data-color-inspector-ui
        className="fixed top-3 left-1/2 -translate-x-1/2 z-[9995] flex items-center gap-2 bg-gray-900 text-white text-xs font-semibold px-3 py-2 rounded-full shadow-lg select-none"
      >
        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
        Inspector attivo · {theme === 'light' ? 'Chiaro' : 'Scuro'}
        {Object.keys(pendingChanges.light ?? {}).length + Object.keys(pendingChanges.dark ?? {}).length > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-1 flex items-center gap-1 bg-blue-500 hover:bg-blue-400 px-2 py-0.5 rounded-full transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
            Salva
          </button>
        )}
        <button onClick={handleDeactivate} className="ml-1 hover:text-gray-300 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Bottom sheet */}
      {sheetOpen && (
        <div
          data-color-inspector-ui
          className="fixed inset-0 z-[9996] flex flex-col justify-end"
          onClick={e => { if (e.target === e.currentTarget) setSheetOpen(false) }}
        >
          <div className="bg-background border-t border-border rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <p className="text-sm font-semibold">
                {sheetVars.length} variabil{sheetVars.length === 1 ? 'e' : 'i'} rilevat{sheetVars.length === 1 ? 'a' : 'e'}
              </p>
              <button onClick={() => setSheetOpen(false)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Color rows */}
            <div className="overflow-y-auto px-4 py-2 space-y-1">
              {sheetVars.map(varName => {
                const info = VAR_LABELS[varName]
                const currentVal = getCurrentValue(varName)
                const safeHex = /^#[0-9a-fA-F]{6}$/.test(currentVal) ? currentVal : '#000000'
                return (
                  <div key={varName} className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
                    <button
                      type="button"
                      onClick={() => colorInputRefs.current[varName]?.click()}
                      className="w-9 h-9 rounded-xl border border-border shadow-sm flex-shrink-0 transition-transform active:scale-95"
                      style={{ background: currentVal }}
                    />
                    <input
                      ref={el => { colorInputRefs.current[varName] = el }}
                      type="color"
                      value={safeHex}
                      onChange={e => handleColorChange(varName, e.target.value)}
                      className="sr-only"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{info?.label ?? varName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{varName}</p>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{currentVal}</span>
                  </div>
                )
              })}
            </div>

            {/* Save button */}
            <div className="px-4 py-3 border-t border-border safe-area-pb">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Salvataggio…' : 'Salva modifiche'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
