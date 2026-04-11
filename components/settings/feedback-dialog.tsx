'use client'
import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

const schema = z.object({
  categories: z.string().min(1),
  message: z.string().min(5, 'Minimo 5 caratteri'),
})
type FormData = z.infer<typeof schema>

const CATEGORIES = ['Assistenza', 'Bug', 'Modifica', 'Feature', 'Altro']

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setIsSubmitting(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('feedback').insert({ ...data, user_id: user.id })
      toast.success('Segnalazione inviata')
      reset()
      onClose()
    } catch { toast.error('Errore invio') } finally { setIsSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Invia segnalazione</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            name="categories"
            control={control}
            render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value ?? ''}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          />
          <Textarea placeholder="Descrivi il problema..." rows={4} {...register('message')} />
          {errors.message && <p className="text-destructive text-xs">{errors.message.message}</p>}
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Invio...' : 'Invia'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
