import { createClient } from '@supabase/supabase-js'
import type { SalaLayout } from '../types/database'
// Import con EFFETTO: carica `.env.local` (chiavi Supabase) come fa la fixture.
import './employee-session'

/**
 * PIANTINA per i test che devono SCRIVERE configurazione (i minimi per card).
 *
 * La piantina vive in una riga sola (`sala_layout`, id = 1) ed è un dato REALE
 * dell'utente: un test che la modifica deve poterla rimettere esattamente com'era.
 * Qui si legge il jsonb GREZZO (non interpretato) e lo si riscrive tale e quale,
 * così il ripristino non dipende dal formato del giorno.
 *
 * Richiede la service-role in `.env.local`: senza, `readSalaLayout` risponde
 * `null` e i test che ne hanno bisogno si SALTANO invece di fallire.
 */

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export interface LayoutSnapshot {
  /** Il jsonb `layout` così com'è nel database. */
  raw: unknown
  /** Vista interpretata, per le asserzioni. */
  layout: SalaLayout
}

export async function readSalaLayout(): Promise<LayoutSnapshot | null> {
  const sb = admin()
  if (!sb) return null
  const { data, error } = await sb.from('sala_layout').select('layout').eq('id', 1).maybeSingle()
  if (error || !data) return null
  const raw = data.layout
  const layout: SalaLayout = Array.isArray(raw) ? { cards: raw } : ((raw ?? { cards: [] }) as SalaLayout)
  return { raw, layout }
}

/** Riscrive il jsonb esattamente come letto (ripristino). */
export async function writeSalaLayout(snapshot: LayoutSnapshot): Promise<void> {
  await writeSalaLayoutValue(snapshot.raw)
}

/**
 * Scrive un layout ESPLICITO (stessa forma del jsonb della tabella). Serve a
 * mettere la piantina in uno stato noto prima di una prova — es. «senza minimi
 * configurati» — senza dipendere da quello che l'utente ha in archivio.
 */
export async function writeSalaLayoutValue(layout: unknown): Promise<void> {
  const sb = admin()
  if (!sb) throw new Error('manca SUPABASE_SERVICE_ROLE_KEY: impossibile scrivere la piantina')
  const { error } = await sb.from('sala_layout').upsert({ id: 1, layout })
  if (error) throw error
}
