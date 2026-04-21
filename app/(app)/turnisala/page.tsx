'use client'
import { useEffect } from 'react'

export default function TurniSalaPage() {
  useEffect(() => {
    localStorage.setItem('turni-last-page', '/turnisala')
  }, [])

  return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground gap-2">
      <span className="text-lg font-medium">Turni Sala</span>
      <span className="text-sm">In costruzione</span>
    </main>
  )
}
