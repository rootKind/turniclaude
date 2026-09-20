import { test, expect, E2E_BASE_URL } from './fixtures'
import { adminClient } from './supabase-admin'
import { decodeSalaMonth, findMonthPerson, isSalaMonthData, type MonthPersonShifts } from '../lib/sala-month'
import { sectionTurnOf } from '../lib/shift-tokens'
import type { SalaShiftType } from '../types/database'

/**
 * DALLA CARD DI UN GIORNO IN /tuoturno AL TURNO IN SALA (richiesta 26/09/2026).
 *
 * Tap su un giorno della propria griglia → /turnisala sul giorno e sul turno
 * P/M/N di quella card, con la persona evidenziata dal «respiro» di 3s. L'URL è
 * quello del salto già esistente (`buildSalaFocusUrl`), quindi la board fa la
 * solita verifica: se la persona non è in sala, l'avviso esce — ed è per questo
 * che il tap si accende SOLO sui giorni che la board disegna su una card di
 * sezione (`sectionTurnOf`): riposi, assenze e trasferte non portano da nessuna
 * parte. Questa spec prova le due cose insieme: il giorno giusto nell'URL e il
 * respiro sulla card della persona.
 *
 * Il giorno non si inventa: si legge dal PDF caricato del MESE CORRENTE (la v2,
 * l'unica che conserva ogni codice), e si entra come quella persona — /tuoturno
 * si apre sul turno di chi sei.
 */

const DEV = 'dev=rootkind-dev-2026'
const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

test('il tap su un giorno porta in /turnisala su quel giorno e quel turno', async ({ asEmployee }) => {
  test.setTimeout(120_000)
  const sb = adminClient()
  test.skip(!sb, 'service-role assente in .env.local')

  const oggi = new Date()
  const mese = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`

  // Il PDF del mese corrente: persone e codici per giorno (v2).
  const { data: row } = await sb!.from('sala_schedule').select('schedule, month').eq('month', mese).maybeSingle()
  test.skip(!row, `nessun PDF caricato per il mese corrente (${mese})`)
  const raw = row!.schedule as unknown
  test.skip(!isSalaMonthData(raw), `il PDF di ${mese} non è in formato v2: senza, i codici del giorno non ci sono`)
  const people: MonthPersonShifts[] = decodeSalaMonth(raw as Parameters<typeof decodeSalaMonth>[0])

  // Un utente dell'app che nel PDF ha almeno un giorno su una CARD (turno di
  // sezione): è la condizione perché la card sia tappabile.
  const { data: users } = await sb!.from('users').select('id, nome, cognome').order('cognome')
  let scelto: { cognome: string; nome: string; giorno: number; turno: SalaShiftType } | null = null
  for (const u of users ?? []) {
    if (!u.cognome) continue
    const person = findMonthPerson(people, { id: u.id, nome: u.nome, cognome: u.cognome }, undefined, undefined)
    if (!person) continue
    for (let d = 1; d <= 28; d++) {
      const sez = sectionTurnOf(person.days[d - 1] ?? '')
      if (sez) {
        scelto = { cognome: u.cognome, nome: u.nome ?? '', giorno: d, turno: sez.shift }
        break
      }
    }
    if (scelto) break
  }
  test.skip(!scelto, `nessuno nel PDF di ${mese} ha un giorno su una card di sezione`)
  const chi = scelto!

  const page = await asEmployee({ cognome: chi.cognome, nome: chi.nome })
  await page.goto(`${E2E_BASE_URL}/tuoturno?${DEV}`, { waitUntil: 'domcontentloaded' })
  // La griglia del mese corrente arriva dal PDF (cache IDB o rete): si aspetta
  // che le card dei giorni esistano davvero.
  const card = page.locator(`[data-sala-day="${chi.giorno}"]`)
  await card.waitFor({ state: 'visible', timeout: 30_000 })
  await expect(card, 'solo i giorni con un turno su una card sono tappabili').toHaveCount(1)

  await card.click()
  await page.waitForURL(/\/turnisala\?/, { timeout: 20_000 })
  const url = new URL(page.url())
  expect(url.searchParams.get('m'), 'il mese della card').toBe(mese)
  expect(url.searchParams.get('d'), 'il giorno della card').toBe(String(chi.giorno))
  expect(url.searchParams.get('t'), 'il turno della card').toBe(chi.turno)
  expect(url.searchParams.get('c'), 'la persona la porta nell’URL (per l’evidenzia)').toContain(chi.cognome.split(' ')[0])

  // E la board risponde come sempre: la card della persona respira.
  await expect(
    page.locator(`.desk-card-flash`).first(),
    `nessuna evidenzia in /turnisala per ${chi.cognome} il ${chi.giorno} (${MESI[Number(mese.slice(5, 7)) - 1]})`,
  ).toBeVisible({ timeout: 20_000 })
})

test('un giorno di riposo o assenza non è tappabile', async ({ asEmployee }) => {
  test.setTimeout(120_000)
  const sb = adminClient()
  test.skip(!sb, 'service-role assente in .env.local')
  const oggi = new Date()
  const mese = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}`
  const { data: row } = await sb!.from('sala_schedule').select('schedule').eq('month', mese).maybeSingle()
  test.skip(!row, `nessun PDF caricato per il mese corrente (${mese})`)
  const raw = row!.schedule as unknown
  test.skip(!isSalaMonthData(raw), 'formato non v2')
  const people = decodeSalaMonth(raw as Parameters<typeof decodeSalaMonth>[0])

  const { data: users } = await sb!.from('users').select('id, nome, cognome')
  let scelto: { cognome: string; nome: string; giorni: number[] } | null = null
  for (const u of users ?? []) {
    if (!u.cognome) continue
    const person = findMonthPerson(people, { id: u.id, nome: u.nome, cognome: u.cognome }, undefined, undefined)
    if (!person) continue
    // Giorni con codice ma SENZA card: riposo, assenza, trasferta, codice invisibile.
    const giorni = Array.from({ length: 28 }, (_, i) => i + 1)
      .filter(d => (person.days[d - 1] ?? '').trim() && !sectionTurnOf(person.days[d - 1]))
    if (giorni.length) { scelto = { cognome: u.cognome, nome: u.nome ?? '', giorni }; break }
  }
  test.skip(!scelto, `nessun giorno fuori sala nel PDF di ${mese}`)
  const chi = scelto!

  const page = await asEmployee({ cognome: chi.cognome, nome: chi.nome })
  await page.goto(`${E2E_BASE_URL}/tuoturno?${DEV}`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-sala-day]').first().waitFor({ state: 'visible', timeout: 30_000 })
  // Nessuno di quei giorni deve essere un bersaglio: niente salto per un riposo.
  const tappabili = await page.locator(`[data-sala-day="${chi.giorni[0]}"]`).count()
  expect(tappabili, `il giorno ${chi.giorni[0]} (fuori sala) non deve essere tappabile`).toBe(0)
})
