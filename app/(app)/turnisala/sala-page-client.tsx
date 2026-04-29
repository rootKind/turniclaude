'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { upsertSalaLayout } from '@/lib/queries/sala-layout'
import { getSalaSchedule } from '@/lib/queries/sala-schedule'
import { DeskBoard } from '@/components/sala/desk-board'
import type { SalaLayout, SalaSchedule } from '@/types/database'

function useLandscapeLock() {
  useEffect(() => {
    const lock = async () => {
      try { await (screen.orientation as any).lock('landscape') } catch {}
    }
    lock()
    return () => { try { (screen.orientation as any).unlock() } catch {} }
  }, [])
}

interface Props {
  layout: SalaLayout
  isAdmin: boolean
  isManager?: boolean
  userId: string
  userCognome?: string
  userNome?: string
  initialSchedule: SalaSchedule | null
  initialMonth: string
  scheduleMonths: string[]
}

export function SalaPageClient({
  layout,
  isAdmin,
  isManager = false,
  userId,
  userCognome,
  userNome,
  initialSchedule,
  initialMonth,
  scheduleMonths: initialMonths,
}: Props) {
  useLandscapeLock()

  useEffect(() => {
    localStorage.setItem('turni-last-page', '/turnisala')
  }, [])

  const [schedule, setSchedule] = useState<SalaSchedule | null>(initialSchedule)
  const [currentMonth, setCurrentMonth] = useState(initialMonth)
  const [availableMonths, setAvailableMonths] = useState(initialMonths)

  const handleSaveLayout = async (updated: SalaLayout) => {
    const supabase = createClient()
    await upsertSalaLayout(supabase, updated, userId)
  }

  const handleMonthChange = async (month: string) => {
    setCurrentMonth(month)
    setSchedule(null)
    const supabase = createClient()
    const data = await getSalaSchedule(supabase, month)
    setSchedule(data)
  }

  const handleUpload = async (file: File, month: string) => {
    const fd = new FormData()
    fd.append('pdf', file)
    fd.append('month', month)
    const res = await fetch('/api/admin/parse-pdf', { method: 'POST', body: fd })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(body)
    }
    const supabase = createClient()
    const data = await getSalaSchedule(supabase, month)
    setSchedule(data)
    setCurrentMonth(month)
    setAvailableMonths(prev =>
      prev.includes(month) ? prev : [month, ...prev].sort((a, b) => b.localeCompare(a)),
    )
  }

  const handleDeleteMonth = async (month: string) => {
    const res = await fetch(`/api/admin/sala-schedule?month=${month}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(body)
    }
    setAvailableMonths(prev => {
      const next = prev.filter(m => m !== month)
      if (currentMonth === month) {
        const fallback = next[0] ?? null
        if (fallback) {
          handleMonthChange(fallback)
        } else {
          setSchedule(null)
          setCurrentMonth(
            (() => {
              const now = new Date()
              return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
            })()
          )
        }
      }
      return next
    })
  }

  return (
    <main className="flex flex-col min-h-[60vh]">
      <DeskBoard
        layout={layout}
        isAdmin={isAdmin}
        isManager={isManager}
        userId={userId}
        userCognome={userCognome}
        userNome={userNome}
        onSave={handleSaveLayout}
        schedule={schedule}
        currentMonth={currentMonth}
        availableMonths={availableMonths}
        onMonthChange={handleMonthChange}
        onUpload={handleUpload}
        onDeleteMonth={handleDeleteMonth}
      />
    </main>
  )
}
