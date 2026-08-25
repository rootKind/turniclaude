'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ShiftList } from '@/components/shifts/shift-list'
import { ShiftDialog } from '@/components/shifts/shift-dialog'
import { useCurrentUser } from '@/hooks/use-current-user'
import { usePush } from '@/hooks/use-push'
import { isAdmin, isManager } from '@/types/database'
import { X, Palmtree } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const CONGEDO_FORM_URL = 'https://forms.office.com/e/aQWL0B86kC'

type UserOption = { id: string; nome: string | null; cognome: string | null; is_secondary: boolean; is_manager?: boolean; is_dco_plus?: boolean }

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const asUserId = searchParams.get('as')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [congedoOpen, setCongedoOpen] = useState(false)
  const [viewSecondary, setViewSecondary] = useState(false)
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [impersonatedUser, setImpersonatedUser] = useState<UserOption | null>(null)
  const [highlightShiftId, setHighlightShiftId] = useState<number | undefined>(() => {
    const p = searchParams.get('shift')
    return p ? Number(p) : undefined
  })

  const { profile } = useCurrentUser()
  const { registerServiceWorker } = usePush()

  const adminUser = profile ? isAdmin(profile.id) : false
  const managerUser = profile ? isManager(profile) : false
  const canToggleCategory = adminUser || managerUser
  const loggedInUserId = profile?.id ?? ''
  const isImpersonating = adminUser && !!asUserId && asUserId !== loggedInUserId

  // Load all users list for dropdown (admin only)
  useEffect(() => {
    if (!adminUser) return
    fetch('/api/admin/users')
      .then(r => r.json())
      // Exclude managers from impersonation: they have no DCO/Noni category
      .then(({ users }: { users: UserOption[] }) => setAllUsers((users ?? []).filter(u => !u.is_manager)))
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
    if (searchParams.get('new') === '1' && !managerUser) {
      setDialogOpen(true)
      router.replace('/dashboard')
    }
  }, [searchParams, router, managerUser])

  // Clear highlight after 4s and clean URL
  useEffect(() => {
    if (!highlightShiftId) return
    const t = setTimeout(() => {
      setHighlightShiftId(undefined)
      const params = new URLSearchParams(searchParams.toString())
      params.delete('shift')
      router.replace(params.size > 0 ? `/dashboard?${params.toString()}` : '/dashboard')
    }, 4000)
    return () => clearTimeout(t)
  }, [highlightShiftId, router, searchParams])

  // Track app access once per session (skip when admin is impersonating)
  useEffect(() => {
    if (!profile?.id || isImpersonating) return
    if (sessionStorage.getItem('access-tracked')) return
    sessionStorage.setItem('access-tracked', '1')
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'access' }),
    }).catch(() => {})
  }, [profile?.id, isImpersonating])

  // Effective values
  const effectiveUserId = isImpersonating && impersonatedUser
    ? impersonatedUser.id
    : loggedInUserId
  const effectiveIsSecondary = isImpersonating && impersonatedUser
    ? impersonatedUser.is_secondary
    : (canToggleCategory ? viewSecondary : (profile?.is_secondary ?? false))
  // DCO+: la vista mista dipende dall'utente effettivo (profilo o impersonato)
  const viewerIsDcoPlus = isImpersonating && impersonatedUser
    ? (impersonatedUser.is_dco_plus ?? false)
    : (profile?.is_dco_plus ?? false)

  const displayName = impersonatedUser
    ? `${impersonatedUser.cognome ?? ''} ${impersonatedUser.nome ?? ''}`.trim()
    : null

  return (
    <main className="max-w-lg mx-auto px-4 pt-6 pb-4">
      {/* Impersonation banner */}
      {isImpersonating && displayName && (
        <div className="flex items-center justify-between banner-impersonate rounded-xl px-3 py-2 mb-4 text-sm font-medium">
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

      <div className="flex items-center justify-between mb-4 pr-12 gap-y-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h1 className="text-lg font-bold leading-snug">Turni Sala C.C.C.</h1>
          {/* Richiesta congedo (modulo esterno) — stesso stile del tasto Esci (destructive + bordo).
              La scritta "Chiedi congedo" è SEMPRE visibile (non interrotta da breakpoint):
              se manca spazio la riga dell'header va a capo (flex-wrap sul contenitore), senza
              mai nascondere la scritta — c'è spazio ben oltre le viewport strette del telefono. */}
          <Button
            variant="destructive"
            onClick={() => setCongedoOpen(true)}
            aria-label="Chiedi congedo"
            className="flex-shrink-0 gap-1.5 px-3 rounded-full border-destructive/40"
          >
            <Palmtree size={16} strokeWidth={1.8} />
            <span className="whitespace-nowrap">Chiedi congedo</span>
          </Button>
          {/* Category toggle — hidden when impersonating (category is from impersonated user) */}
          {profile && canToggleCategory && !isImpersonating && (
            <button
              onClick={() => setViewSecondary(v => !v)}
              className="text-xs font-medium px-2 py-0.5 rounded-full border border-current text-primary hover:bg-primary/10 transition-colors"
            >
              {viewSecondary ? 'DCO' : 'Noni'}
            </button>
          )}
        </div>

        {/* User switcher — admin only */}
        {profile && adminUser && !managerUser && allUsers.length > 0 && (
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
                {u.cognome} {u.nome}{u.is_dco_plus ? ' (DCO+)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <ShiftList
        isSecondary={effectiveIsSecondary}
        isDcoPlus={viewerIsDcoPlus}
        effectiveUserId={effectiveUserId}
        loggedInUserId={loggedInUserId}
        highlightShiftId={highlightShiftId}
      />

      <ShiftDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        isSecondary={effectiveIsSecondary}
        isDcoPlus={viewerIsDcoPlus}
        impersonatingUserId={isImpersonating ? effectiveUserId : undefined}
      />

      <Dialog open={congedoOpen} onOpenChange={v => !v && setCongedoOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Congedo</DialogTitle>
            <DialogDescription>
              Non hai trovato il cambio di cui hai bisogno? Chiedi congedo{' '}
              <a
                href={CONGEDO_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary underline underline-offset-2 hover:opacity-70 transition-opacity"
              >
                qui
              </a>
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => setCongedoOpen(false)}>
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
