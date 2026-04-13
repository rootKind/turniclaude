'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShiftList } from '@/components/shifts/shift-list'
import { ShiftDialog } from '@/components/shifts/shift-dialog'
import { useCurrentUser } from '@/hooks/use-current-user'
import { usePush } from '@/hooks/use-push'
import { isAdmin } from '@/types/database'
import { X } from 'lucide-react'

type UserOption = { id: string; nome: string | null; cognome: string | null; is_secondary: boolean }

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const asUserId = searchParams.get('as')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [viewSecondary, setViewSecondary] = useState(false)
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [impersonatedUser, setImpersonatedUser] = useState<UserOption | null>(null)

  const { profile } = useCurrentUser()
  const { registerServiceWorker } = usePush()

  const adminUser = profile ? isAdmin(profile.id) : false
  const loggedInUserId = profile?.id ?? ''
  const isImpersonating = adminUser && !!asUserId && asUserId !== loggedInUserId

  // Load all users list for dropdown (admin only)
  useEffect(() => {
    if (!adminUser) return
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(({ users }: { users: UserOption[] }) => setAllUsers(users ?? []))
      .catch(() => {})
  }, [adminUser])

  // Resolve impersonated user from list
  useEffect(() => {
    if (!asUserId || !allUsers.length) { setImpersonatedUser(null); return }
    const found = allUsers.find(u => u.id === asUserId) ?? null
    setImpersonatedUser(found)
  }, [asUserId, allUsers])

  useEffect(() => {
    registerServiceWorker()
  }, [registerServiceWorker])

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setDialogOpen(true)
      router.replace('/dashboard')
    }
  }, [searchParams, router])

  // Effective values
  const effectiveUserId = isImpersonating && impersonatedUser
    ? impersonatedUser.id
    : loggedInUserId
  const effectiveIsSecondary = isImpersonating && impersonatedUser
    ? impersonatedUser.is_secondary
    : (adminUser ? viewSecondary : (profile?.is_secondary ?? false))

  const displayName = impersonatedUser
    ? `${impersonatedUser.cognome ?? ''} ${impersonatedUser.nome ?? ''}`.trim()
    : null

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      {/* Impersonation banner */}
      {isImpersonating && displayName && (
        <div className="flex items-center justify-between bg-orange-500 text-white rounded-xl px-3 py-2 mb-4 text-sm font-medium">
          <span>👁 Stai vedendo come <strong>{displayName}</strong></span>
          <button
            onClick={() => router.push('/dashboard')}
            className="ml-2 hover:opacity-70 transition-opacity"
            aria-label="Esci dalla modalità impersonazione"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold">Turni Sala C.C.C.</h1>
        {profile && (
          <div className="flex items-center gap-2">
            {/* Category toggle — hidden when impersonating (category is from impersonated user) */}
            {adminUser && !isImpersonating ? (
              <button
                onClick={() => setViewSecondary(v => !v)}
                className="text-xs font-medium px-2 py-0.5 rounded-full border border-current text-primary hover:bg-primary/10 transition-colors"
              >
                {viewSecondary ? 'Noni' : 'DCO'}
              </button>
            ) : !isImpersonating ? (
              <span className="text-xs text-muted-foreground">
                {profile.is_secondary ? 'Noni' : 'DCO'}
              </span>
            ) : null}

            {/* User switcher — admin only */}
            {adminUser && allUsers.length > 0 && (
              <select
                value={asUserId ?? ''}
                onChange={e => {
                  const val = e.target.value
                  if (val === '') router.push('/dashboard')
                  else router.push(`/dashboard?as=${val}`)
                }}
                className="text-xs border rounded-lg px-2 py-1 bg-background text-foreground cursor-pointer"
              >
                <option value="">Io (admin)</option>
                {allUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.cognome} {u.nome}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <ShiftList
        isSecondary={effectiveIsSecondary}
        effectiveUserId={effectiveUserId}
        loggedInUserId={loggedInUserId}
      />

      <ShiftDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        isSecondary={effectiveIsSecondary}
        impersonatingUserId={isImpersonating ? effectiveUserId : undefined}
      />
    </main>
  )
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  )
}
