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
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { VACATION_PERIOD_LABELS } from '@/lib/vacations'
import type { VacationPeriod } from '@/types/database'

const ALL_PERIODS: VacationPeriod[] = [1, 2, 3, 4, 5, 6]

const formSchema = z.object({
  userId: z.string().min(1, 'Seleziona un utente'),
  nome: z.string().min(1, 'Nome obbligatorio'),
  cognome: z.string().min(1, 'Cognome obbligatorio'),
  password: z.string().min(6, 'Minimo 6 caratteri').optional().or(z.literal('')),
})
type FormData = z.infer<typeof formSchema>

type UserOption = { id: string; nome: string | null; cognome: string | null; is_secondary: boolean; is_manager: boolean }

interface Props {
  open: boolean
  onClose: () => void
}

export function EditUserDialog({ open, onClose }: Props) {
  const router = useRouter()
  const [users, setUsers] = useState<UserOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [basePeriod, setBasePeriod] = useState<VacationPeriod | null>(null)
  const [isSecondary, setIsSecondary] = useState(false)
  const [isManagerState, setIsManagerState] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { userId: '', nome: '', cognome: '', password: '' },
  })

  useEffect(() => {
    if (!open) { setConfirmDelete(false); setBasePeriod(null); setIsSecondary(false); setIsManagerState(false); form.reset(); return }
    const supabase = createClient()
    supabase.from('users').select('id, nome, cognome, is_secondary, is_manager').order('cognome').then(({ data }) => {
      setUsers((data ?? []) as UserOption[])
    })
  }, [open, form])

  async function onUserSelect(userId: string) {
    const u = users.find(u => u.id === userId)
    if (u) {
      form.setValue('nome', u.nome ?? '')
      form.setValue('cognome', u.cognome ?? '')
      setIsSecondary(u.is_secondary)
      setIsManagerState(u.is_manager)
    }
    setBasePeriod(null)
    const supabase = createClient()
    const { data } = await supabase
      .from('vacation_assignments')
      .select('base_period')
      .eq('user_id', userId)
      .maybeSingle()
    setBasePeriod(data?.base_period ?? null)
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
          isSecondary: isManagerState ? false : isSecondary,
          isManager: isManagerState,
          ...(values.password ? { password: values.password } : {}),
        }),
      })
      if (!res.ok) throw new Error()

      // Upsert vacation_assignment se un periodo è selezionato
      if (basePeriod !== null) {
        const supabase = createClient()
        const { error } = await supabase
          .from('vacation_assignments')
          .upsert({ user_id: values.userId, base_period: basePeriod }, { onConflict: 'user_id' })
        if (error) throw error
      }

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

            {/* Ruolo Manager */}
            {form.watch('userId') && (
              <div className="flex items-center justify-between py-1">
                <div>
                  <Label className="text-sm font-medium">Manager</Label>
                  <p className="text-[11px] text-muted-foreground">Né DCO né Noni</p>
                </div>
                <Switch checked={isManagerState} onCheckedChange={(v) => {
                  setIsManagerState(v)
                  if (v) setIsSecondary(false)
                }} />
              </div>
            )}

            {/* Categoria utente — nascosta se manager */}
            {form.watch('userId') && !isManagerState && (
              <div className="flex items-center justify-between py-1">
                <div>
                  <Label className="text-sm font-medium">Categoria</Label>
                  <p className="text-[11px] text-muted-foreground">{isSecondary ? 'Noni' : 'DCO'}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={!isSecondary ? 'font-semibold text-foreground' : ''}>DCO</span>
                  <Switch checked={isSecondary} onCheckedChange={setIsSecondary} />
                  <span className={isSecondary ? 'font-semibold text-foreground' : ''}>Noni</span>
                </div>
              </div>
            )}

            {/* Periodo ferie base */}
            {form.watch('userId') && (
              <div>
                <p className="text-sm font-medium mb-2">Periodo ferie base (2026)</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {ALL_PERIODS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setBasePeriod(prev => prev === p ? null : p)}
                      className={cn(
                        'text-left px-2.5 py-2 rounded-lg border text-[11px] font-medium transition-colors leading-snug',
                        basePeriod === p
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-foreground hover:bg-muted/60'
                      )}
                    >
                      <span className="opacity-50 mr-1">{p}</span>
                      {VACATION_PERIOD_LABELS[p].label}
                    </button>
                  ))}
                </div>
                {basePeriod === null && (
                  <p className="text-[11px] text-muted-foreground mt-1">Nessun periodo assegnato</p>
                )}
              </div>
            )}

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
