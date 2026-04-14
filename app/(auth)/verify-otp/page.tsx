import { Suspense } from 'react'
import { OtpForm } from '@/components/auth/otp-form'

export default function VerifyOtpPage() {
  return (
    <Suspense>
      <OtpForm />
    </Suspense>
  )
}
