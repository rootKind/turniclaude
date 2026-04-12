'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { motion, useMotionValue, useTransform, animate, type PanInfo } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Check, Trash } from 'lucide-react'

type FeedbackItem = {
  id: string
  created_at: string
  categories: string
  message: string
  user_id: string
  read: boolean
  user: { id: string; nome: string | null; cognome: string | null } | null
}

const CATEGORIES = ['Tutti', 'Assistenza', 'Bug', 'Modifica', 'Feature', 'Altro']

function FeedbackCard({
  f,
  onMarkRead,
  onDelete,
  onClick,
}: {
  f: FeedbackItem
  onMarkRead: (id: string) => void
  onDelete: (id: string) => void
  onClick: () => void
}) {
  const x = useMotionValue(0)
  const bg = useTransform(
    x,
    [-60, -1, 0, 1, 60],
    [
      'rgba(239,68,68,0.18)',
      'rgba(239,68,68,0.04)',
      'transparent',
      'rgba(34,197,94,0.04)',
      'rgba(34,197,94,0.18)',
    ]
  )
  const checkOpacity = useTransform(x, [0, 60], [0, 1])
  const trashOpacity = useTransform(x, [-60, 0], [1, 0])

  async function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > 40) {
      await animate(x, 320, { duration: 0.18 })
      onMarkRead(f.id)
    } else if (info.offset.x < -40) {
      await animate(x, -320, { duration: 0.18 })
      onDelete(f.id)
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 })
    }
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center justify-center w-14 text-destructive z-0"
        style={{ opacity: trashOpacity }}
      >
        <Trash size={16} />
      </motion.div>
      <motion.div
        className="absolute inset-y-0 left-0 flex items-center justify-center w-14 text-green-500 z-0"
        style={{ opacity: checkOpacity }}
      >
        <Check size={16} />
      </motion.div>
      <motion.div
        drag="x"
        dragConstraints={{ left: -60, right: 60 }}
        dragElastic={0.08}
        dragMomentum={false}
        style={{ x }}
        onDragEnd={handleDragEnd}
        className={cn(
          'relative z-10 p-3 border rounded-lg bg-background cursor-pointer',
          !f.read && 'border-primary bg-primary/5'
        )}
        onClick={onClick}
      >
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{ backgroundColor: bg }}
        />
        <div className="relative flex justify-between items-start">
          <div>
            <p className="text-sm font-medium">{f.user?.cognome ?? ''} {f.user?.nome ?? ''}</p>
            <p className="text-xs text-muted-foreground">{f.categories}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(f.created_at).toLocaleDateString('it-IT')}
          </p>
        </div>
        <p className="relative text-sm text-muted-foreground line-clamp-2 mt-1">{f.message}</p>
      </motion.div>
    </div>
  )
}

interface FeedbackListProps {
  open: boolean
  onClose: () => void
}

export function FeedbackList({ open, onClose }: FeedbackListProps) {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState('Tutti')
  const [selected, setSelected] = useState<FeedbackItem | null>(null)

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    Promise.all([
      supabase.from('feedback').select('id, created_at, categories, message, user_id, read').order('created_at', { ascending: false }),
      supabase.from('users').select('id, nome, cognome'),
    ]).then(([{ data: fbData, error }, { data: usersData }]) => {
        if (error) { toast.error('Errore caricamento feedback'); return }
        const usersMap = new Map((usersData ?? []).map(u => [u.id, u] as const))
        setFeedbacks(
          (fbData ?? []).map(f => ({
            ...f,
            user: usersMap.get(f.user_id) ?? null,
          }))
        )
      })
  }, [open])

  async function markRead(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('feedback').update({ read: true }).eq('id', id)
    if (error) { toast.error('Errore'); return }
    setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, read: true } : f))
  }

  async function deleteFeedback(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('feedback').delete().eq('id', id)
    if (error) { toast.error('Errore'); return }
    setFeedbacks(prev => prev.filter(f => f.id !== id))
  }

  const filtered = feedbacks.filter(f => selectedCategory === 'Tutti' || f.categories === selectedCategory)

  return (
    <>
      <Dialog open={open} onOpenChange={v => !v && onClose()}>
        <DialogContent className="max-w-md h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle>Feedback ricevuti</DialogTitle>
          </DialogHeader>
          <div className="px-4 py-2 border-b shrink-0">
            <Select value={selectedCategory} onValueChange={v => v && setSelectedCategory(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <ScrollArea className="flex-1 px-4 py-2">
            <div className="space-y-2">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nessun feedback</p>
              )}
              {filtered.map(f => (
                <FeedbackCard
                  key={f.id}
                  f={f}
                  onMarkRead={markRead}
                  onDelete={deleteFeedback}
                  onClick={() => setSelected(f)}
                />
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{selected?.categories}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{selected?.user?.cognome} {selected?.user?.nome}</span>
              <span className="text-muted-foreground">
                {selected && new Date(selected.created_at).toLocaleDateString('it-IT')}
              </span>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap break-words">{selected?.message}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
