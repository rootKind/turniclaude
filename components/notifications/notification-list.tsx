'use client'
import { useRef, useState } from 'react'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { BellOff, Megaphone, Heart, CalendarPlus, Trash2 } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { NotificationEntry } from '@/types/database'
import type { LucideIcon } from 'lucide-react'

interface Section {
  key: string
  label: string
  Icon: LucideIcon
  entries: NotificationEntry[]
}

export function NotificationList() {
  const { history, deleteEntry, clearAll } = useNotificationHistory()
  const [swipingOut, setSwipingOut] = useState<Set<string>>(new Set())
  const [liveOffsets, setLiveOffsets] = useState<Map<string, number>>(new Map())
  const touchStartX = useRef<Map<string, number>>(new Map())

  function handleTouchStart(id: string, x: number) {
    touchStartX.current.set(id, x)
  }

  function handleTouchMove(id: string, x: number) {
    const startX = touchStartX.current.get(id) ?? x
    const delta = x - startX
    if (delta < 0) {
      setLiveOffsets(prev => new Map(prev).set(id, delta))
    }
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

  const groups = {
    system: history.filter(e => !e.type || e.type === 'system'),
    interest: history.filter(e => e.type === 'interest'),
    new_shift: history.filter(e => e.type === 'new_shift'),
  }

  const sections: Section[] = [
    { key: 'system', label: 'Notifiche di sistema', Icon: Megaphone, entries: groups.system },
    { key: 'interest', label: 'Interessi ai tuoi turni', Icon: Heart, entries: groups.interest },
    { key: 'new_shift', label: 'Nuove richieste', Icon: CalendarPlus, entries: groups.new_shift },
  ].filter(s => s.entries.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          onClick={clearAll}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 size={13} />
          Cancella tutte
        </button>
      </div>

      {sections.map(({ key, label, Icon, entries }) => (
        <div key={key} className="flex flex-col">
          <div className="flex items-center gap-2 mb-1 px-1">
            <Icon size={13} className="text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {label}
            </span>
          </div>

          <div className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
            {entries.map(entry => {
              const offset = liveOffsets.get(entry.id) ?? 0
              const isSwipingOut = swipingOut.has(entry.id)
              const deleteHintOpacity = Math.min(1, Math.abs(offset) / 80)
              return (
                <div
                  key={entry.id}
                  className="relative overflow-hidden"
                >
                  {/* Red delete hint revealed behind */}
                  <div
                    className="absolute inset-0 bg-destructive flex items-center justify-end pr-4"
                    style={{ opacity: deleteHintOpacity }}
                  >
                    <Trash2 size={18} className="text-white" />
                  </div>
                  {/* Swipeable row */}
                  <div
                    className={cn(
                      'relative py-3 px-3 bg-background',
                      isSwipingOut
                        ? 'transition-all duration-300 -translate-x-full opacity-0 pointer-events-none'
                        : offset !== 0 ? '' : 'transition-transform duration-100'
                    )}
                    style={!isSwipingOut ? { transform: `translateX(${offset}px)` } : undefined}
                    onTouchStart={e => handleTouchStart(entry.id, e.touches?.[0]?.clientX ?? 0)}
                    onTouchMove={e => handleTouchMove(entry.id, e.changedTouches?.[0]?.clientX ?? 0)}
                    onTouchEnd={e => handleTouchEnd(entry.id, e.changedTouches?.[0]?.clientX ?? 0)}
                  >
                    <div className="flex items-start gap-3">
                      <Icon size={15} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{entry.title}</p>
                        <p className="text-sm text-muted-foreground">{entry.body}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">
                        {formatRelativeTime(new Date(entry.timestamp).toISOString())}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
