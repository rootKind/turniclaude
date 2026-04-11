'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ShiftList } from '@/components/shifts/shift-list'
import { ShiftDialog } from '@/components/shifts/shift-dialog'
import { useCurrentUser } from '@/hooks/use-current-user'
import { usePush } from '@/hooks/use-push'

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const { profile } = useCurrentUser()
  const { registerServiceWorker } = usePush()

  useEffect(() => {
    registerServiceWorker()
  }, [])

  useEffect(() => {
    if (searchParams.get('new') === '1') setDialogOpen(true)
  }, [searchParams])

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">Turni Sala C.C.C.</h1>
        {profile && (
          <span className="text-xs text-muted-foreground">
            {profile.is_secondary ? 'Noni' : 'DCO'}
          </span>
        )}
      </div>

      <ShiftList />

      <ShiftDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        isSecondary={profile?.is_secondary ?? false}
      />
    </main>
  )
}
