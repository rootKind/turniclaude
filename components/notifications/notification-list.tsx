'use client'
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { ArrowLeftRight, Bell, BellOff, Check, Megaphone, Sparkles, Trash2, TreePalm } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { NotifType, NotificationEntry } from '@/types/database'
import type { LucideIcon } from 'lucide-react'

interface Section {
  key: string
  label: string
  Icon: LucideIcon
  entries: NotificationEntry[]
}

// ── Sezioni della bacheca ─────────────────────────────────────────────────────
// Quattro, una per FAMIGLIA di notifiche. Il tipo dice COSA è successo e resta
// preciso (lo usano la deduplica, le preferenze e i test): qui si decide solo
// come raggrupparlo. Aggiungere un tipo NON aggiunge una sezione.
type SezioneId = 'admin' | 'sistema' | 'turni' | 'ferie'

const SEZIONI: Record<SezioneId, { label: string; Icon: LucideIcon }> = {
  admin:   { label: 'Comunicazioni admin', Icon: Megaphone },
  sistema: { label: 'Sistema',             Icon: Sparkles },
  turni:   { label: 'Cambi turno',         Icon: ArrowLeftRight },
  ferie:   { label: 'Cambi ferie',         Icon: TreePalm },
}

/** Ordine di lettura in bacheca. */
const ORDINE_SEZIONI: SezioneId[] = ['admin', 'sistema', 'turni', 'ferie']

/**
 * Ogni tipo finisce in UNA sezione: è un `Record<NotifType, SezioneId>`, quindi
 * un tipo aggiunto a NOTIF_TYPES senza la sua sezione NON COMPILA — nessuna
 * notifica può restare invisibile (era il caso del changelog, che arrivava con
 * un tipo che nessuno rendeva).
 *
 * Dove va cosa: le comunicazioni manuali dell'admin in «Comunicazioni admin»,
 * gli avvisi automatici dell'app (novità della versione) in «Sistema», tutto ciò
 * che riguarda un cambio turno — richieste, interessi, esiti, pulizia — in
 * «Cambi turno», e tutto ciò che riguarda le ferie in «Cambi ferie».
 */
const SEZIONE_DI: Record<NotifType, SezioneId> = {
  system:            'admin',
  changelog_new:     'sistema',
  shift_outcome:     'turni',
  interest:          'turni',
  new_shift:         'turni',
  cleanup:           'turni',
  vacation_outcome:  'ferie',
  vacation_interest: 'ferie',
  new_vacation:      'ferie',
}

export function NotificationList() {
  const { history, markEntryRead, deleteEntry } = useNotificationHistory()
  const [swipingOut, setSwipingOut] = useState<Set<string>>(new Set())
  const [liveOffsets, setLiveOffsets] = useState<Map<string, number>>(new Map())
  const touchStartX = useRef<Map<string, number>>(new Map())

  function handleTouchStart(id: string, x: number) {
    touchStartX.current.set(id, x)
  }

  function handleTouchMove(id: string, x: number) {
    const startX = touchStartX.current.get(id) ?? x
    const delta = x - startX
    setLiveOffsets(prev => new Map(prev).set(id, delta))
  }

  function handleTouchEnd(id: string, x: number) {
    const startX = touchStartX.current.get(id) ?? x
    const delta = x - startX
    touchStartX.current.delete(id)
    setLiveOffsets(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    if (delta < -80) {
      setSwipingOut(prev => new Set([...prev, id]))
      setTimeout(() => deleteEntry(id), 300)
    } else if (delta > 80) {
      markEntryRead(id)
    }
  }

  if (!history.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <BellOff size={40} strokeWidth={1.5} />
        <p className="text-sm">Nessuna notifica ricevuta</p>
      </div>
    )
  }

  // Voci raggruppate per SEZIONE (poche e larghe), non per tipo: nove sezioni
  // erano un indice, non una bacheca (richiesta dell'utente 18/09/2026).
  const vociPerSezione = new Map<SezioneId, NotificationEntry[]>()
  const ignote: NotificationEntry[] = []
  for (const e of history) {
    // Voce senza tipo = salvata da una versione precedente al campo: è una
    // comunicazione dell'admin, come faceva il filtro di prima.
    const tipo = e.type ?? 'system'
    const sezione = (SEZIONE_DI as Record<string, SezioneId | undefined>)[tipo]
    if (!sezione) { ignote.push(e); continue }
    const voci = vociPerSezione.get(sezione)
    if (voci) voci.push(e)
    else vociPerSezione.set(sezione, [e])
  }

  const sections: Section[] = ORDINE_SEZIONI
    .filter(id => (vociPerSezione.get(id)?.length ?? 0) > 0)
    .map(id => ({ key: id as string, ...SEZIONI[id], entries: vociPerSezione.get(id)! }))

  // RETE DI SICUREZZA: un tipo SCONOSCIUTO (voce salvata da una build più nuova
  // dell'app, o scritta a mano) si mostra lo stesso, in fondo. Meglio una
  // sezione generica che una notifica sparita in silenzio.
  if (ignote.length > 0) {
    sections.push({ key: 'altre', label: 'Altre notifiche', Icon: Bell, entries: ignote })
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map(({ key, label, Icon, entries }, index) => (
        <motion.div
          key={key}
          data-notif-sezione={key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: index * 0.04, ease: 'easeOut' }}
          className="flex flex-col"
        >
          <div data-notif-sezione-titolo className="flex items-center gap-2 mb-1 px-1">
            <Icon size={13} className="text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {label}
            </span>
          </div>

          <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
            {entries.map(entry => {
              const offset = liveOffsets.get(entry.id) ?? 0
              const isSwipingOut = swipingOut.has(entry.id)
              const leftHintOpacity = offset < 0 ? Math.min(1, Math.abs(offset) / 80) : 0
              const rightHintOpacity = offset > 0 ? Math.min(1, offset / 80) : 0
              return (
                <div
                  key={entry.id}
                  className="relative overflow-hidden"
                >
                  {/* Red delete hint — revealed on left swipe */}
                  <div
                    className="absolute inset-0 bg-destructive flex items-center justify-end pr-4"
                    style={{ opacity: leftHintOpacity }}
                  >
                    <Trash2 size={18} className="text-white" />
                  </div>
                  {/* Blue mark-as-read hint — revealed on right swipe */}
                  <div
                    className="absolute inset-0 bg-primary flex items-center justify-start pl-4"
                    style={{ opacity: rightHintOpacity }}
                  >
                    <Check size={18} className="text-primary-foreground" />
                  </div>
                  {/* Swipeable row */}
                  <div
                    className={cn(
                      'relative py-3 px-3 bg-background',
                      isSwipingOut
                        ? 'transition-all duration-300 -translate-x-full opacity-0 pointer-events-none'
                        : offset !== 0 ? '' : 'transition-transform duration-200'
                    )}
                    style={!isSwipingOut ? { transform: `translateX(${offset}px)` } : undefined}
                    onTouchStart={e => handleTouchStart(entry.id, e.touches?.[0]?.clientX ?? 0)}
                    onTouchMove={e => handleTouchMove(entry.id, e.changedTouches?.[0]?.clientX ?? 0)}
                    onTouchEnd={e => handleTouchEnd(entry.id, e.changedTouches?.[0]?.clientX ?? 0)}
                  >
                    <div className="flex items-start gap-3">
                      <Icon size={15} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm', entry.read ? 'font-normal text-muted-foreground' : 'font-medium')}>{entry.title}</p>
                        <p className="text-sm text-muted-foreground">{entry.body}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                        {!entry.read && (
                          <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelativeTime(new Date(entry.timestamp).toISOString())}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
