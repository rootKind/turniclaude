'use client'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { upsertSalaLayout } from '@/lib/queries/sala-layout'
import { DeskBoard } from '@/components/sala/desk-board'
import type { SalaLayout } from '@/types/database'

interface Props {
  layout: SalaLayout
  isAdmin: boolean
  userId: string
}

export function SalaPageClient({ layout, isAdmin, userId }: Props) {
  useEffect(() => {
    localStorage.setItem('turni-last-page', '/turnisala')
  }, [])

  const handleSave = async (updated: SalaLayout) => {
    const supabase = createClient()
    await upsertSalaLayout(supabase, updated, userId)
  }

  return (
    <main className="flex flex-col min-h-[60vh]">
      <DeskBoard layout={layout} isAdmin={isAdmin} userId={userId} onSave={handleSave} />
    </main>
  )
}
