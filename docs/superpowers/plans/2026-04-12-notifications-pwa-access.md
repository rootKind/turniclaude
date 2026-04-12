# Notifications, PWA Access Control, Feedback Swipe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix notifiche dinamiche, aggiungere guida per stato denied, migliorare swipe feedback admin, bloccare accesso al sito da browser normale reindirizzando a `/installa`.

**Architecture:** Client-side PWA detection via `matchMedia('(display-mode: standalone)')` in un `PwaGuard` nel root layout. Le notifiche usano un listener `visibilitychange` per sincronizzare lo stato quando l'utente torna dalle impostazioni di sistema. Il feedback list usa `useMotionValue` + `useTransform` per colori reattivi durante lo swipe.

**Tech Stack:** Next.js 16 App Router, TypeScript, Framer Motion (`useMotionValue`, `useTransform`, `animate`), shadcn/ui (`Dialog`, `Tabs`), TanStack Query v5

---

## File Map

| File | Azione | Responsabilità |
|------|--------|----------------|
| `hooks/use-push.ts` | Modifica | Aggiunge listener `visibilitychange` per sync stato notifiche |
| `components/settings/notification-help-dialog.tsx` | Crea | Dialog con istruzioni Android/iOS per stato denied |
| `components/settings/settings-page.tsx` | Modifica | Sostituisce banner denied con bottone che apre help dialog |
| `components/admin/feedback-list.tsx` | Modifica | Swipe reattivo con MotionValue, animazione uscita, spring snap-back |
| `components/providers/pwa-guard.tsx` | Crea | Guard client-side: browser → /installa, PWA + /installa → /login |
| `app/layout.tsx` | Modifica | Wrappa children con PwaGuard |
| `app/installa/page.tsx` | Crea | Pagina guida installazione per utenti browser |

---

## Task 1: Fix `use-push.ts` — sincronizzazione dinamica stato notifiche

**Files:**
- Modify: `hooks/use-push.ts`

- [ ] **Step 1: Aggiungere listener `visibilitychange` nel `useEffect` di `use-push.ts`**

Sostituire l'intero `useEffect` esistente con questo (aggiunge il listener e lo rimuove nel cleanup):

```ts
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }

  if (typeof Notification === 'undefined') return

  setPermission(Notification.permission)
  checkSubscription()

  // Resync quando l'utente torna nell'app dopo aver cambiato impostazioni OS
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      setPermission(Notification.permission)
      checkSubscription()
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // Listen for permission changes dynamically
  let status: PermissionStatus | null = null
  if ('permissions' in navigator) {
    navigator.permissions.query({ name: 'notifications' }).then(s => {
      status = s
      s.onchange = () => {
        setPermission(s.state as NotificationPermission)
        if (s.state === 'granted') checkSubscription()
      }
    }).catch(() => {})
  }

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    if (status) status.onchange = null
  }
}, [])
```

- [ ] **Step 2: In `requestAndSubscribe`, aggiungere `checkSubscription()` dopo `setPermission`**

Trovare la funzione `requestAndSubscribe` e aggiornare il blocco `if (result === 'granted')`:

```ts
async function requestAndSubscribe() {
  if (typeof Notification === 'undefined') {
    toast.error('Le notifiche non sono supportate su questo dispositivo')
    return
  }
  try {
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') {
      await subscribe()
      await checkSubscription()
    } else if (result === 'denied') {
      toast.error('Permesso negato — abilitalo nelle impostazioni del dispositivo')
    }
  } catch {
    toast.error('Impossibile richiedere il permesso notifiche')
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add hooks/use-push.ts
git commit -m "fix: sync notification permission state on visibility change and after request"
```

---

## Task 2: Creare `notification-help-dialog.tsx`

**Files:**
- Create: `components/settings/notification-help-dialog.tsx`

- [ ] **Step 1: Creare il file con il componente**

```tsx
'use client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

function detectOS(): 'ios' | 'android' {
  if (typeof navigator === 'undefined') return 'android'
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android'
}

interface NotificationHelpDialogProps {
  open: boolean
  onClose: () => void
}

export function NotificationHelpDialog({ open, onClose }: NotificationHelpDialogProps) {
  const defaultTab = detectOS()

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Come abilitare le notifiche</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full">
            <TabsTrigger value="android" className="flex-1">Android</TabsTrigger>
            <TabsTrigger value="ios" className="flex-1">iOS</TabsTrigger>
          </TabsList>
          <TabsContent value="android" className="mt-4">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2"><span className="font-bold text-muted-foreground">1.</span><span>Tieni premuta l&apos;icona dell&apos;app <strong>Turni</strong> sulla schermata home</span></li>
              <li className="flex gap-2"><span className="font-bold text-muted-foreground">2.</span><span>Tocca <strong>Info app</strong></span></li>
              <li className="flex gap-2"><span className="font-bold text-muted-foreground">3.</span><span>Tocca <strong>Notifiche</strong></span></li>
              <li className="flex gap-2"><span className="font-bold text-muted-foreground">4.</span><span>Attiva <strong>Tutte le notifiche</strong></span></li>
              <li className="flex gap-2"><span className="font-bold text-muted-foreground">5.</span><span>Torna nell&apos;app e riprova</span></li>
            </ol>
          </TabsContent>
          <TabsContent value="ios" className="mt-4">
            <ol className="space-y-3 text-sm">
              <li className="flex gap-2"><span className="font-bold text-muted-foreground">1.</span><span>Apri l&apos;app <strong>Impostazioni</strong> di iOS</span></li>
              <li className="flex gap-2"><span className="font-bold text-muted-foreground">2.</span><span>Scorri verso il basso e cerca <strong>Turni</strong></span></li>
              <li className="flex gap-2"><span className="font-bold text-muted-foreground">3.</span><span>Tocca <strong>Notifiche</strong></span></li>
              <li className="flex gap-2"><span className="font-bold text-muted-foreground">4.</span><span>Attiva <strong>Consenti Notifiche</strong></span></li>
              <li className="flex gap-2"><span className="font-bold text-muted-foreground">5.</span><span>Torna nell&apos;app e riprova</span></li>
            </ol>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/settings/notification-help-dialog.tsx
git commit -m "feat: add notification help dialog with Android/iOS instructions"
```

---

## Task 3: Aggiornare `settings-page.tsx` — sezione notifiche denied

**Files:**
- Modify: `components/settings/settings-page.tsx`

- [ ] **Step 1: Aggiungere import e stato per il dialog**

In cima al file, aggiungere l'import:
```ts
import { NotificationHelpDialog } from './notification-help-dialog'
```

All'interno del componente `SettingsPage`, aggiungere lo stato:
```ts
const [helpOpen, setHelpOpen] = useState(false)
```

- [ ] **Step 2: Sostituire il blocco `permission === 'denied'`**

Rimpiazzare il blocco:
```tsx
{permission === 'denied' && (
  <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-1">
    <p className="text-sm font-medium text-destructive">Notifiche bloccate</p>
    <p className="text-xs text-muted-foreground">
      Hai negato il permesso. Per abilitarle vai nelle impostazioni del browser e consenti le notifiche per questo sito.
    </p>
  </div>
)}
```

Con:
```tsx
{permission === 'denied' && (
  <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-2">
    <p className="text-sm font-medium text-destructive">Notifiche bloccate</p>
    <p className="text-xs text-muted-foreground">
      Hai negato il permesso. Devi abilitarle manualmente dalle impostazioni del dispositivo.
    </p>
    <Button variant="outline" size="sm" className="w-full" onClick={() => setHelpOpen(true)}>
      Come abilitare le notifiche
    </Button>
  </div>
)}
```

- [ ] **Step 3: Aggiungere il dialog in fondo al return, prima di `<FeedbackDialog>`**

```tsx
<NotificationHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
```

- [ ] **Step 4: Commit**

```bash
git add components/settings/settings-page.tsx
git commit -m "feat: add help dialog for denied notification permission in settings"
```

---

## Task 4: Migliorare swipe in `feedback-list.tsx`

**Files:**
- Modify: `components/admin/feedback-list.tsx`

- [ ] **Step 1: Aggiornare gli import**

Rimpiazzare la riga degli import framer-motion da:
```ts
import { motion, type PanInfo } from 'framer-motion'
```
a:
```ts
import { motion, useMotionValue, useTransform, animate, type PanInfo } from 'framer-motion'
```

- [ ] **Step 2: Estrarre `FeedbackCard` come componente separato sopra `FeedbackList`**

Aggiungere questo componente prima della funzione `FeedbackList` (rimuovere la logica di swipe dalle card inline):

```tsx
function FeedbackCard({
  f,
  onMarkRead,
  onDelete,
  onClick,
}: {
  f: FeedbackItem
  onMarkRead: (id: string) => void
  onDelete: (id: string) => void
  onClick: () => void
}) {
  const x = useMotionValue(0)
  const bg = useTransform(
    x,
    [-60, -1, 0, 1, 60],
    [
      'rgba(239,68,68,0.18)',
      'rgba(239,68,68,0.04)',
      'transparent',
      'rgba(34,197,94,0.04)',
      'rgba(34,197,94,0.18)',
    ]
  )
  const checkOpacity = useTransform(x, [0, 60], [0, 1])
  const trashOpacity = useTransform(x, [-60, 0], [1, 0])

  async function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > 40) {
      await animate(x, 320, { duration: 0.18 })
      onMarkRead(f.id)
    } else if (info.offset.x < -40) {
      await animate(x, -320, { duration: 0.18 })
      onDelete(f.id)
    } else {
      animate(x, 0, { type: 'spring', stiffness: 500, damping: 30 })
    }
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center justify-center w-14 text-destructive z-0"
        style={{ opacity: trashOpacity }}
      >
        <Trash size={16} />
      </motion.div>
      <motion.div
        className="absolute inset-y-0 left-0 flex items-center justify-center w-14 text-green-500 z-0"
        style={{ opacity: checkOpacity }}
      >
        <Check size={16} />
      </motion.div>
      <motion.div
        drag="x"
        dragConstraints={{ left: -60, right: 60 }}
        dragElastic={0.08}
        dragMomentum={false}
        style={{ x, background: bg }}
        onDragEnd={handleDragEnd}
        className={cn(
          'relative z-10 p-3 border rounded-lg cursor-pointer',
          !f.read && 'border-primary'
        )}
        onClick={onClick}
      >
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm font-medium">{f.user?.cognome ?? ''} {f.user?.nome ?? ''}</p>
            <p className="text-xs text-muted-foreground">{f.categories}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(f.created_at).toLocaleDateString('it-IT')}
          </p>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{f.message}</p>
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 3: Rimuovere la funzione `handleSwipe` da `FeedbackList` e sostituire le card inline**

Rimuovere la funzione:
```ts
function handleSwipe(id: string, info: PanInfo) {
  if (info.offset.x > 50) markRead(id)
  else if (info.offset.x < -50) deleteFeedback(id)
}
```

Nel render, sostituire il blocco `{filtered.map(f => (...))}` con:
```tsx
{filtered.map(f => (
  <FeedbackCard
    key={f.id}
    f={f}
    onMarkRead={markRead}
    onDelete={deleteFeedback}
    onClick={() => setSelected(f)}
  />
))}
```

- [ ] **Step 4: Rimuovere `type PanInfo` dagli import se non più usato direttamente in `FeedbackList`**

Verificare che la riga import framer-motion nel file non contenga `PanInfo` come import diretto a livello di `FeedbackList` (è ora usato solo in `FeedbackCard`, dove viene importato dallo stesso import in cima al file — ok, l'import rimane).

- [ ] **Step 5: Commit**

```bash
git add components/admin/feedback-list.tsx
git commit -m "fix: reactive swipe animation in feedback list with MotionValue and exit animation"
```

---

## Task 5: Creare `pwa-guard.tsx`

**Files:**
- Create: `components/providers/pwa-guard.tsx`

- [ ] **Step 1: Creare il file**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export function PwaGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const isPWA =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    if (!isPWA && pathname !== '/installa') {
      router.replace('/installa')
      return
    }
    if (isPWA && pathname === '/installa') {
      router.replace('/login')
      return
    }
    setReady(true)
  }, [pathname, router])

  if (!ready) return null
  return <>{children}</>
}
```

- [ ] **Step 2: Commit**

```bash
git add components/providers/pwa-guard.tsx
git commit -m "feat: add PwaGuard client component for browser vs PWA access control"
```

---

## Task 6: Creare la pagina `/installa`

**Files:**
- Create: `app/installa/page.tsx`

- [ ] **Step 1: Creare il file**

```tsx
'use client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

function detectOS(): 'ios' | 'android' {
  if (typeof navigator === 'undefined') return 'android'
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : 'android'
}

export default function InstallaPage() {
  const [defaultTab, setDefaultTab] = useState<'ios' | 'android'>('android')
  const [host, setHost] = useState('')

  useEffect(() => {
    setDefaultTab(detectOS())
    setHost(window.location.host)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <Smartphone size={40} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Installa l&apos;app</h1>
          <p className="text-sm text-muted-foreground">
            Per usare Turni Sala C.C.C. devi installare l&apos;app sul tuo dispositivo.
          </p>
        </div>

        <Tabs defaultValue={defaultTab} key={defaultTab}>
          <TabsList className="w-full">
            <TabsTrigger value="android" className="flex-1">Android</TabsTrigger>
            <TabsTrigger value="ios" className="flex-1">iOS</TabsTrigger>
          </TabsList>

          <TabsContent value="android" className="mt-4">
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">Chrome su Android</p>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">1.</span><span>Apri <strong>Chrome</strong> e vai su <strong>{host || 'questo sito'}</strong></span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">2.</span><span>Tocca il menu <strong>⋮</strong> in alto a destra</span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">3.</span><span>Tocca <strong>Aggiungi a schermata Home</strong> o <strong>Installa app</strong></span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">4.</span><span>Tocca <strong>Installa</strong> per confermare</span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">5.</span><span>Apri l&apos;app dalla schermata home</span></li>
              </ol>
            </div>
          </TabsContent>

          <TabsContent value="ios" className="mt-4">
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-3">Safari su iPhone/iPad</p>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">1.</span><span>Apri <strong>Safari</strong> e vai su <strong>{host || 'questo sito'}</strong></span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">2.</span><span>Tocca il pulsante di condivisione <strong>□↑</strong> in basso</span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">3.</span><span>Scorri e tocca <strong>Aggiungi a schermata Home</strong></span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">4.</span><span>Tocca <strong>Aggiungi</strong> in alto a destra</span></li>
                <li className="flex gap-2"><span className="font-bold text-muted-foreground shrink-0">5.</span><span>Apri l&apos;app dalla schermata home</span></li>
              </ol>
            </div>
          </TabsContent>
        </Tabs>

        <p className="text-center text-xs text-muted-foreground">
          Questo sito è privato. Solo gli utenti autorizzati possono accedere.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/installa/page.tsx
git commit -m "feat: add /installa page with Android/iOS PWA installation guide"
```

---

## Task 7: Aggiornare `app/layout.tsx` — aggiungere `PwaGuard`

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Aggiungere l'import di `PwaGuard`**

In cima al file aggiungere:
```ts
import { PwaGuard } from '@/components/providers/pwa-guard'
```

- [ ] **Step 2: Wrappare `{children}` con `<PwaGuard>`**

Nel `return` del layout, trovare `{children}` dentro `<QueryProvider>` e wrapparlo:

```tsx
<QueryProvider>
  <PwaGuard>
    {children}
  </PwaGuard>
  <Toaster richColors position="top-center" />
</QueryProvider>
```

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wrap app with PwaGuard to restrict browser access to /installa"
```

---

## Self-Review

**Spec coverage:**
- ✅ Fix notifiche dinamiche → Task 1 (visibilitychange + checkSubscription post-request)
- ✅ Pulsante per stato default → già esistente, invariato
- ✅ Dialog per stato denied → Task 2 + Task 3
- ✅ Swipe reattivo feedback → Task 4
- ✅ PwaGuard: browser → /installa → Task 5 + Task 7
- ✅ PWA + /installa → /login → Task 5
- ✅ Pagina /installa → Task 6

**Placeholder scan:** nessun TBD, nessun "implement later". Tutti gli step hanno codice completo.

**Type consistency:**
- `FeedbackCard` props: `f`, `onMarkRead`, `onDelete`, `onClick` — usati coerentemente in Task 4
- `PwaGuard` — usato in Task 7 come importato in Task 5
- `NotificationHelpDialog` — usato in Task 3 come creato in Task 2
- `detectOS()` definita sia in Task 2 che Task 6 — è locale a ciascun file, nessun conflitto
