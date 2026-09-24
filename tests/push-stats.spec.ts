import { test, expect, employeeLoginEnabled, E2E_BASE_URL } from './fixtures'
import type { Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type SB = SupabaseClient<any, 'public', any>

/**
 * TRACCIAMENTO DELLE ATTIVAZIONI NOTIFICHE (richiesta 25/09/2026).
 *
 * L'attivazione push scrive un evento 'push_enabled' in app_events (con
 * metadata.source: 'prompt' = schermata invasiva, 'settings' = impostazioni) e
 * le statistiche admin mostrano sia gli eventi sia la DATA VERA della prima
 * iscrizione (push_subscriptions.created_at). Qui si prova:
 *
 *   1. POST /api/events con push_enabled → evento nel DB con la sorgente giusta
 *      (e i tipi sconosciuti restano rifiutati dal CHECK);
 *   2. GET /api/admin/stats (l'admin è Minino) espone il blocco push: conteggi
 *      e push_first_subscribed_at reali (su dev ci sono dispositivi storici).
 *
 * Gli eventi creati dal test vengono RIMOSSI alla fine: il DB torna com'era.
 * Serve la service-role in `.env.local`; senza, i test si saltano.
 */
test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local')

test.describe.configure({ mode: 'default' })

const admin = (): SB => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const idDi = async (sb: SB, cognome: string): Promise<string> => {
  const { data } = await sb.from('users').select('id').ilike('cognome', cognome).maybeSingle()
  if (!data) throw new Error(`utente non trovato: ${cognome}`)
  return (data as { id: string }).id
}

/** Pulizia: rimuove gli eventi push_enabled creati dal test per l'utente. */
async function pulisciEventi(sb: SB, userId: string) {
  await sb.from('app_events').delete().eq('user_id', userId).eq('event_type', 'push_enabled')
}

test('l’attivazione dalla schermata scrive push_enabled con la sua sorgente', async ({ asEmployee }) => {
  const sb = admin()
  const piscopo = await idDi(sb, 'Piscopo')
  await pulisciEventi(sb, piscopo) // partenza pulita (e ripetibile)

  const page = await asEmployee('Piscopo')
  await page.goto(`${E2E_BASE_URL}/?dev=rootkind-dev-2026`)
  await page.waitForFunction(() => !!localStorage.getItem('cache:last-user-id'))

  // Come fa la schermata invasiva: sorgente 'prompt'
  const res = await page.evaluate(async () => {
    const r = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'push_enabled', metadata: { source: 'prompt' } }),
    })
    return { status: r.status, body: await r.json() }
  })
  expect(res.status, 'POST /api/events push_enabled').toBe(200)

  // L'evento sta nel DB con la sorgente giusta
  const { data: eventi } = await sb
    .from('app_events')
    .select('user_id, event_type, metadata')
    .eq('user_id', piscopo)
    .eq('event_type', 'push_enabled')
  expect(eventi ?? []).toHaveLength(1)
  expect((eventi?.[0]?.metadata as { source?: string })?.source).toBe('prompt')

  // Un tipo sconosciuto resta rifiutato (CHECK intatto)
  const bad = await page.evaluate(async () => {
    const r = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: 'push_enabled_falso' }),
    })
    return r.status
  })
  expect(bad).toBe(400)

  await pulisciEventi(sb, piscopo)
})

test('le statistiche admin mostrano attivazioni e data della prima iscrizione', async ({ asEmployee }) => {
  const sb = admin()
  const minino = await idDi(sb, 'Minino')

  // Un'attivazione «settings» per avere un conteggio da leggere
  const { data: profilo } = await sb.from('users').select('id').eq('cognome', 'Piscopo').maybeSingle()
  const piscopo = (profilo as { id: string }).id
  await pulisciEventi(sb, piscopo)
  await sb.from('app_events').insert({
    user_id: piscopo, event_type: 'push_enabled', metadata: { source: 'settings' },
  })

  const page = await asEmployee('Minino') // l'admin delle stats
  await page.goto(`${E2E_BASE_URL}/admin/statistiche?dev=rootkind-dev-2026`)
  await page.waitForLoadState('domcontentloaded')

  // La pagina statistica mostra la card «Notifiche attivate» con il conteggio
  const card = page.getByText('Notifiche attivate')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/^1$/).first()).toBeVisible() // il conteggio 2xl

  // L'API espone anche le date vere di prima iscrizione (dispositivi storici su dev)
  const stats = await page.evaluate(async () => {
    const r = await fetch('/api/admin/stats?days=0')
    return r.json() as Promise<{
      overview: { push_enabled: number; push_enabled_prompt: number; push_enabled_settings: number }
      users: Array<{ id: string; push_first_subscribed_at: string | null; push_devices: number }>
    }>
  })
  expect(stats.overview.push_enabled).toBeGreaterThanOrEqual(1)
  expect(stats.overview.push_enabled_settings).toBeGreaterThanOrEqual(1)
  const conDispositivi = stats.users.filter(u => u.push_devices > 0)
  expect(conDispositivi.length, 'su dev ci sono iscritti storici').toBeGreaterThan(0)
  expect(conDispositivi.every(u => !!u.push_first_subscribed_at)).toBe(true)
  expect(stats.users.find(u => u.id === minino)?.push_devices).toBeDefined()

  // Pulizia: l'evento di prova sparisce
  await pulisciEventi(sb, piscopo)
})
