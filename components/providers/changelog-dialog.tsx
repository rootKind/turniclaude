'use client'
import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { fetchChangelog, markChangelogSeen, type ChangelogEntry } from '@/lib/changelog'

// Evento per riaprire il changelog con TUTTE le entry (voce "Novità" nelle impostazioni).
export const CHANGELOG_SHOW_ALL_EVENT = 'changelog:show-all'

// Popup "changelog" mostrato all'apertura della PWA quando esiste una versione
// più recente di quella già vista (persistita per utente su server, changelog_reads).
// - Ritardo iniziale per non sovrapporsi alla boot splash.
// - SOLO il pulsante "Continua" marca la versione come vista: se l'utente chiude
//   l'app (o dismissa il dialog) senza premerlo, il popup riappare al prossimo avvio.
export function ChangelogDialog() {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async (mode: 'auto' | 'all') => {
    try {
      const data = await fetchChangelog()
      if (mode === 'all') {
        if (data.entries.length > 0) {
          setEntries(data.entries)
          setOpen(true)
        }
      } else {
        const unseen = data.entries.filter(e => e.version > data.lastSeenVersion)
        if (unseen.length > 0) {
          setEntries(unseen)
          setOpen(true)
        }
      }
    } catch {
      // Offline o errore: nessun popup (non blocca l'app)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load('auto'), 1500)
    const onShowAll = () => load('all')
    window.addEventListener(CHANGELOG_SHOW_ALL_EVENT, onShowAll)
    return () => {
      clearTimeout(t)
      window.removeEventListener(CHANGELOG_SHOW_ALL_EVENT, onShowAll)
    }
  }, [load])

  const handleContinue = async () => {
    const latest = entries?.[0]?.version
    if (latest !== undefined) {
      try { await markChangelogSeen(latest) } catch { /* ignora */ }
    }
    setOpen(false)
  }

  if (entries === null || entries.length === 0) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Chiusura (Escape/backdrop) SENZA marcare come visto: il popup
        // riapparirà al prossimo avvio finché l'utente non preme "Continua".
        if (!next) setOpen(false)
      }}
    >
      <DialogContent showCloseButton={false} className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novità di questa versione</DialogTitle>
          <DialogDescription>Ecco un riepilogo di cosa è cambiato nell&apos;app.</DialogDescription>
        </DialogHeader>
        {entries.map(e => (
          <div key={e.version}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {e.title} · {e.date}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {e.changes.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="shrink-0 text-primary">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <DialogFooter>
          <Button onClick={handleContinue}>Continua</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
