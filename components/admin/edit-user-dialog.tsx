'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { toast } from 'sonner'
import { Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const formSchema = z.object({
  userId: z.string().min(1, 'Seleziona un utente'),
  nome: z.string().min(1, 'Nome obbligatorio'),
  cognome: z.string().min(1, 'Cognome obbligatorio'),
  password: z.string().min(6, 'Minimo 6 caratteri').optional().or(z.literal('')),
})
type FormData = z.infer<typeof formSchema>

type UserOption = { id: string; nome: string | null; cognome: string | null }

interface Props {
  open: boolean
  onClose: () => void
}

export function EditUserDialog({ open, onClose }: Props) {
  const router = useRouter()
  const [users, setUsers] = useState<UserOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { userId: '', nome: '', cognome: '', password: '' },
  })

  useEffect(() => {
    if (!open) { setConfirmDelete(false); form.reset(); return }
    const supabase = createClient()
    supabase.from('users').select('id, nome, cognome').order('cognome').then(({ data }) => {
      setUsers(data ?? [])
    })
  }, [open, form])

  function onUserSelect(userId: string) {
    const u = users.find(u => u.id === userId)
    if (u) {
      form.setValue('nome', u.nome ?? '')
      form.setValue('cognome', u.cognome ?? '')
    }
  }

  async function onSubmit(values: FormData) {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: values.userId,
          nome: values.nome,
          cognome: values.cognome,
          ...(values.password ? { password: values.password } : {}),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Utente aggiornato')
      onClose()
    } catch {
      toast.error('Errore aggiornamento utente')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleDelete() {
    const userId = form.getValues('userId')
    if (!userId) return
    if (!confirmDelete) { setConfirmDelete(true); return }
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) throw new Error()
      toast.success('Utente eliminato')
      onClose()
    } catch {
      toast.error('Errore eliminazione utente')
    } finally {
      setIsLoading(false)
      setConfirmDelete(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Modifica utente</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="userId" render={({ field }) => (
              <FormItem>
                <FormLabel>Utente</FormLabel>
                <Select onValueChange={(v) => { if (v) { field.onChange(v); onUserSelect(v) } }} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Seleziona utente" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.cognome} {u.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            {form.watch('userId') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full flex items-center gap-2"
                onClick={() => {
                  onClose()
                  router.push(`/dashboard?as=${form.getValues('userId')}`)
                }}
              >
                <Eye size={14} />
                Vedi dashboard di questo utente
              </Button>
            )}
            <FormField control={form.control} name="nome" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="cognome" render={({ field }) => (
              <FormItem>
                <FormLabel>Cognome</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel>Nuova password (opzionale)</FormLabel>
                <FormControl><Input type="password" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex gap-2">
              {confirmDelete ? (
                <>
                  <Button type="button" variant="destructive" className="flex-1" disabled={isLoading} onClick={handleDelete}>
                    Conferma
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                    Annulla
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isLoading || !form.watch('userId')}
                  onClick={handleDelete}
                >
                  Elimina
                </Button>
              )}
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? 'Salvataggio...' : 'Salva'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
