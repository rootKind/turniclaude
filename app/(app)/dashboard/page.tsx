'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShiftList } from '@/components/shifts/shift-list'
import { ShiftDialog } from '@/components/shifts/shift-dialog'
import { useCurrentUser } from '@/hooks/use-current-user'
import { usePush } from '@/hooks/use-push'
import { isAdmin } from '@/types/database'

export default function DashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [viewSecondary, setViewSecondary] = useState(false)
  const { profile } = useCurrentUser()
  const { registerServiceWorker } = usePush()

  const adminUser = profile ? isAdmin(profile.id) : false
  const effectiveIsSecondary = adminUser ? viewSecondary : (profile?.is_secondary ?? false)

  useEffect(() => {
    registerServiceWorker()
  }, [registerServiceWorker])

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setDialogOpen(true)
      router.replace('/dashboard')
    }
  }, [searchParams, router])

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">Turni Sala C.C.C.</h1>
        {profile && (
          adminUser ? (
            <button
              onClick={() => setViewSecondary(v => !v)}
              className="text-xs font-medium px-2 py-0.5 rounded-full border border-current text-primary hover:bg-primary/10 transition-colors"
            >
              {viewSecondary ? 'Noni' : 'DCO'}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {profile.is_secondary ? 'Noni' : 'DCO'}
            </span>
          )
        )}
      </div>

      <ShiftList isSecondary={effectiveIsSecondary} />

      <ShiftDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        isSecondary={effectiveIsSecondary}
      />
    </main>
  )
}
