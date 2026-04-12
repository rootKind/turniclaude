'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { motion, type PanInfo } from 'framer-motion'
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

export function FeedbackList() {
  const [open, setOpen] = useState(false)
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState('Tutti')
  const [selected, setSelected] = useState<FeedbackItem | null>(null)

  useEffect(() => {
    if (!open) return
    const supabase = createClient()
    supabase
      .from('feedback')
      .select('id, created_at, categories, message, user_id, read, users:user_id(id, nome, cognome)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { toast.error('Errore caricamento feedback'); return }
        setFeedbacks(
          (data ?? []).map(f => ({
            ...f,
            user: Array.isArray(f.users) ? (f.users[0] ?? null) : (f.users as FeedbackItem['user'] ?? null),
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

  function handleSwipe(id: string, info: PanInfo) {
    if (info.offset.x > 50) markRead(id)
    else if (info.offset.x < -50) deleteFeedback(id)
  }

  const filtered = feedbacks.filter(f => selectedCategory === 'Tutti' || f.categories === selectedCategory)

  return (
    <>
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        Leggi feedback
      </Button>

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
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
                <div key={f.id} className="relative overflow-hidden rounded-lg">
                  <div className="absolute inset-y-0 right-0 flex items-center justify-center w-14 text-destructive z-0">
                    <Trash size={16} />
                  </div>
                  <div className="absolute inset-y-0 left-0 flex items-center justify-center w-14 text-green-500 z-0">
                    <Check size={16} />
                  </div>
                  <motion.div
                    drag="x"
                    dragConstraints={{ left: -56, right: 56 }}
                    dragElastic={0.1}
                    dragMomentum={false}
                    animate={{ x: 0 }}
                    onDragEnd={(_, info) => { if (Math.abs(info.offset.x) > 40) handleSwipe(f.id, info) }}
                    className={cn(
                      'relative z-10 p-3 border rounded-lg bg-background cursor-pointer',
                      !f.read && 'border-primary bg-primary/5'
                    )}
                    onClick={() => setSelected(f)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium">{f.user?.cognome ?? ''} {f.user?.nome ?? ''}</p>
                        <p className="text-xs text-muted-foreground">{f.categories}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(f.created_at).toLocaleDateString('it-IT')}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{f.message}</p>
                  </motion.div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
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
