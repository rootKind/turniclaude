'use client'
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNotificationHistory } from '@/hooks/use-notification-history'
import { BellOff, Megaphone, Heart, CalendarPlus, Check, Trash2, TreePalm } from 'lucide-react'
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

  const groups = {
    system:            history.filter(e => !e.type || e.type === 'system'),
    interest:          history.filter(e => e.type === 'interest'),
    new_shift:         history.filter(e => e.type === 'new_shift'),
    vacation_interest: history.filter(e => e.type === 'vacation_interest'),
    new_vacation:      history.filter(e => e.type === 'new_vacation'),
  }

  const sections: Section[] = [
    { key: 'system',            label: 'Notifiche admin',              Icon: Megaphone,  entries: groups.system },
    { key: 'interest',          label: 'Interessati ai tuoi cambi turno',           Icon: Heart,      entries: groups.interest },
    { key: 'new_shift',         label: 'Nuove richieste cambi turno',             Icon: CalendarPlus, entries: groups.new_shift },
    { key: 'vacation_interest', label: 'Interessati ai tuoi cambi ferie',    Icon: Heart,      entries: groups.vacation_interest },
    { key: 'new_vacation',      label: 'Nuove richieste cambi ferie',                Icon: TreePalm,   entries: groups.new_vacation },
  ].filter(s => s.entries.length > 0)

  return (
    <div className="flex flex-col gap-4">
      {sections.map(({ key, label, Icon, entries }, index) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: index * 0.05, ease: 'easeOut' }}
          className="flex flex-col"
        >
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
