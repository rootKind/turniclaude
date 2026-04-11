import { Suspense } from 'react'
import { OtpForm } from '@/components/auth/otp-form'
export default function VerifyPasswordOtpPage() {
  return (
    <Suspense>
      <OtpForm type="password-reset" />
    </Suspense>
  )
}
