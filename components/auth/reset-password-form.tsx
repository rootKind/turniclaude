'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const schema = z.object({
  email: z.string().email('Inserisci un indirizzo email valido.'),
})
type FormData = z.infer<typeof schema>

export function ResetPasswordForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: FormData) {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
      })
      if (error) throw error
      setSent(true)
    } catch {
      toast.error('Non è stato possibile inviare il codice')
    } finally {
      setIsLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Email inviata</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Controlla la tua casella di posta e clicca il link per reimpostare la password.
          </p>
        </div>
        <p className="text-center text-sm">
          <a href="/login" className="text-muted-foreground hover:underline">Torna al login</a>
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Reset Password</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Inserisci la tua email per reimpostare la password
        </p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="nome@esempio.com" {...register('email')} />
          {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Invio in corso...' : 'Invia email'}
        </Button>
      </form>
      <p className="text-center text-sm">
        <a href="/login" className="text-muted-foreground hover:underline">Torna al login</a>
      </p>
    </div>
  )
}
