'use client'
import { useMemo } from 'react'
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
  const defaultTab = useMemo(() => detectOS(), [])

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
