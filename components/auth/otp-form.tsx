'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const schema = z.object({
  token: z.string().min(6, 'Il codice deve contenere almeno 6 caratteri.').max(8),
})
type FormData = z.infer<typeof schema>

export function OtpForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const [isLoading, setIsLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { token: '' },
  })

  async function onSubmit(values: FormData) {
    if (!email) {
      toast.error('Email mancante. Torna al reset password.')
      return
    }
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: values.token,
        type: 'recovery',
      })
      if (error) throw error
      router.push('/update-password')
    } catch {
      toast.error('Codice non valido o scaduto')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Inserisci il codice</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Abbiamo inviato un codice OTP a <strong>{email || 'la tua email'}</strong>
        </p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="token">Codice OTP</Label>
          <Input
            id="token"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            {...register('token')}
          />
          {errors.token && <p className="text-destructive text-xs">{errors.token.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Verifica...' : 'Verifica codice'}
        </Button>
      </form>
      <p className="text-center text-sm">
        <a href="/reset-password" className="text-muted-foreground hover:underline">
          Reinvia codice
        </a>
      </p>
    </div>
  )
}
