import { existsSync, readFileSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * CLIENT DI SOLA LETTURA per i test che verificano i DATI (non la UI).
 *
 * Servono le chiavi Supabase, che stanno in `.env.local` (git-ignored): Playwright
 * da solo non legge quel file (carica `.env.e2e`, credenziali di login), quindi lo
 * leggo qui — stessa ricetta di `tests/employee-session.ts`, senza sovrascrivere
 * variabili già presenti nell'ambiente.
 *
 * Senza chiavi `adminClient()` ritorna `null` e i test che ne hanno bisogno si
 * SALTANO (come i test «come dipendente»), invece di fallire su una macchina
 * senza accesso al progetto.
 */
for (const file of ['.env.e2e', '.env.local']) {
  if (!existsSync(file)) continue
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

export function adminEnabled(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
