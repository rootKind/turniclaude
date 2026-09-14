import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdmin } from '@/types/database'
import { detectMonthFromText } from '@/lib/pdf-month-detect'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/admin/detect-pdf-month
 * Upload multiplo (richiesta 19/09/2026): riceve N PDF come `files` e per
 * OGNI file estrae il testo con la STESSA istanza pdf-parse del parser,
 * poi deduce mese+anno con lib/pdf-month-detect. Ritorna il rilevamento
 * per file — il dialog di riepilogo mostra la proposta e permette la
 * correzione manuale PRIMA di qualsiasi scrittura (nessun parse completo:
 * veloce, niente effetti collaterali).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  if (!isAdmin(user.id)) {
    const { data: profile } = await supabase.from('users').select('is_manager').eq('id', user.id).single()
    if (!profile?.is_manager) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const formData = await req.formData()
  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: 'Nessun PDF ricevuto' }, { status: 400 })
  }

  /* eslint-disable @typescript-eslint/no-require-imports */
  const pdfParse = require('pdf-parse')
  /* eslint-enable @typescript-eslint/no-require-imports */

  const results = await Promise.all(files.map(async file => {
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const parsed = await pdfParse(buffer)
      const text: string = typeof parsed?.text === 'string' ? parsed.text : ''
      const detected = detectMonthFromText(text)
      return {
        fileName: file.name,
        size: file.size,
        month: detected.month,
        confidence: detected.confidence,
      }
    } catch (err) {
      return {
        fileName: file.name,
        size: file.size,
        month: null,
        confidence: 0,
        error: (err as Error)?.message ?? 'Lettura PDF fallita',
      }
    }
  }))

  return NextResponse.json({ results })
}
