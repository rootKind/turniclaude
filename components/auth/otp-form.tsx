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
  otp: z.string().length(6, 'Il codice OTP deve essere di 6 caratteri'),
})
type FormData = z.infer<typeof schema>

type VerificationType = 'password-reset' | 'email-change'

export function OtpForm({ type = 'password-reset' }: { type?: VerificationType }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email')
  const [isLoading, setIsLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { otp: '' },
  })

  async function onSubmit(values: FormData) {
    if (!email) {
      toast.error('Email non trovata, riprova')
      return
    }
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: values.otp,
        type: type === 'password-reset' ? 'recovery' : 'email',
      })
      if (error) throw error

      if (type === 'password-reset') {
        router.push('/update-password')
      } else {
        toast.success('Email verificata con successo')
        await supabase.auth.signOut()
        setTimeout(() => router.push('/login'), 1000)
      }
    } catch {
      toast.error('Codice OTP non valido')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">
          {type === 'password-reset' ? 'Verifica Reset Password' : 'Verifica Email'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Inserisci il codice di verifica che hai ricevuto via email
        </p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="otp">Codice OTP</Label>
          <Input
            id="otp"
            placeholder="123456"
            maxLength={6}
            pattern="[0-9]*"
            inputMode="numeric"
            {...register('otp')}
          />
          {errors.otp && <p className="text-destructive text-xs">{errors.otp.message}</p>}
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Verifica in corso...' : 'Verifica'}
        </Button>
      </form>
    </div>
  )
}
