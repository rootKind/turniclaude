import { test, expect } from './fixtures'
import { E2E_BASE_URL, type Employee } from './employee-session'
import type { Page } from '@playwright/test'
import { adminClient } from './supabase-admin'
import { boardCards, openBoard } from './sala-board'
import { decodeSalaMonth, isSalaMonthData } from '../lib/sala-month'
import { boardPlacementOf } from '../lib/shift-tokens'

/**
 * DALLA CARD DI UN CAMBIO AL SUO POSTO IN SALA (feature 18/09/2026, revisione 19/09).
 *
 * In dashboard la colonna della DATA di una card di cambio (o l'ordinale, per i
 * cambi successivi dello stesso giorno) porta a /turnisala sul GIORNO e sul TURNO
 * M/P/N del turno OFFERTO, facendo «respirare» per 3s la card della persona che
 * cede il cambio.
 *
 * SE LA PERSONA QUEL TURNO NON CE L'HA, LA DASHBOARD NON SI MUOVE: lo dice e
 * basta («Dai turni non risulta che … abbia Notte il giorno 22»). Mandare
 * l'utente su una board che non illumina niente era peggio che non muoversi.
 *
 * E SE IL TURNO C'È, LA BOARD DEVE AVERE QUALCOSA DA ACCENDERE: la card della
 * sezione OPPURE la PILLOLA della riga «Altre attività» (revisione 19/09/2026).
 * Chi è «presente senza sezione» — turno «nudo» M/N/P (SPAGNULO), trasferta
 * `NDis*`, `MTUTOR`, corso `Sp*` — su nessuna card c'è, ma nella riga «Altre
 * attività» sì: da qui il salto parte e la pillola respira, invece del vecchio
 * avviso giallo «la persona non compare in questa sezione».
 *
 * DOVE SI RESTA: quando la board non mostrerebbe la persona in NESSUN posto
 * (sezione non collegata a una card della piantina, oppure codice invisibile per
 * decisione utente: `G`, `MSb`, `12.14`). Le due domande («che turno ha?» e «dove
 * la board la mostra?») devono avere UNA risposta: `boardPlacementOf` in
 * lib/shift-tokens è presa dallo stesso ramo di `applyTokenToDay` con cui la
 * board decide dove scrive un nome, e qui si pretende che la decisione della
 * dashboard concordi con la lettura della board.
 *
 * Qui si difendono, con dati veri (le richieste di cambio nel DB, la board del
 * mese):
 *   1. il click sulla data naviga SOLO se la persona è in sala in quel turno — e
 *      la decisione si confronta con una lettura INDIPENDENTE della board, presa
 *      aprendola direttamente sulla stessa URL;
 *   2. quando naviga, la board apre quel giorno e quel turno e la card si accende;
 *   3. l'animazione è un «respiro» di 3s (3 cicli da 1s), non un contorno fisso, e
 *      l'ULTIMA scomparsa porta via anche il contorno (niente bordo che sopravvive);
 *   4. un blocco con l'ORDINALE (2°, 3°…) porta allo stesso giorno di quel cambio;
 *   5. il salto è ISTANTANEO: la verifica del turno parte già al pointerdown e
 *      l'esito resta in memoria per persona+giorno, quindi il click non riapre la
 *      domanda (nessuna seconda richiesta) e non mostra attesa.
 */

const DEV = 'dev=rootkind-dev-2026'
const MESI_BREVI = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC']
const NOME_TURNO: Record<string, 'M' | 'P' | 'N'> = { Mattina: 'M', Pomeriggio: 'P', Notte: 'N' }

interface Richiesta {
  cognome: string
  nome: string
  shiftDate: string   // YYYY-MM-DD
  shift: 'M' | 'P' | 'N'
}

/** Le richieste di cambio del DB, con la persona che cede il turno. Servono a
 *  SCEGLIERE cosa guardare e a costruire la URL della board: l'esito no. */
async function richiesteDalDb(): Promise<Richiesta[]> {
  const sb = adminClient()
  if (!sb) return []
  // Stesso embed della query dell'app: la FK è nominata (senza, PostgREST non sa
  // quale relazione seguire e la select fallisce).
  const { data, error } = await sb
    .from('shifts')
    .select('shift_date, offered_shift, user:users!shifts_user_id_fkey(cognome, nome)')
    .order('shift_date', { ascending: true })
    .limit(200)
  if (error || !data) return []
  return data.flatMap(row => {
    const user = row.user as unknown as { cognome: string | null; nome: string | null } | null
    const shift = NOME_TURNO[row.offered_shift as string]
    if (!user?.cognome || !row.shift_date || !shift) return []
    return [{ cognome: user.cognome, nome: (user.nome ?? '').trim(), shiftDate: row.shift_date, shift }]
  })
}

/**
 * L'avvertimento «Dai turni non risulta…» è un popup ROSSO, in tema CHIARO e in
 * tema SCURO (richiesta 19/09/2026): è un avviso, non un'informazione.
 * Il tono arriva da sonner con `richColors` acceso su <Toaster> (il tipo della
 * push è `error`, che è l'unico tono rosso), quindi qui si controlla il colore
 * RISOLTO — fondo E testo — nei due temi, perché il difetto da scongiurare è
 * «in uno si vede e nell'altro no».
 * Le due tavolozze di sonner sono hsl(359 100% 97%) / hsl(358 76% 10%) per il
 * fondo e hsl(360 100% 45%) / hsl(358 100% 81%) per il testo: in tutte e quattro
 * la componente R supera G e B. Non si pretende un rosso acceso (il chiaro è un
 * rosa tenue, è la scelta della libreria): si pretende che sia ROSSO e non
 * neutro, cioè R sopra le altre due di almeno 8 punti.
 */
async function avvisoRossoInEntrambiITemi(page: Page, avviso: import('@playwright/test').Locator) {
  for (const schema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: schema })
    const letto = await avviso.evaluate(el => {
      const rgb = (v: string) => (v.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
      const s = getComputedStyle(el)
      const [bgR, bgG, bgB] = rgb(s.backgroundColor)
      const [txR, txG, txB] = rgb(s.color)
      return { fondo: [bgR, bgG, bgB], testo: [txR, txG, txB], html: document.documentElement.className }
    })
    const dove = `tema ${schema} (classi html: «${letto.html}»)`
    const fondo = letto.fondo.join(',')
    const testo = letto.testo.join(',')
    expect(letto.fondo[0] - letto.fondo[1], `il FONDO del popup non è rosso in ${dove}: rgb(${fondo})`).toBeGreaterThanOrEqual(8)
    expect(letto.fondo[0] - letto.fondo[2], `il FONDO del popup non è rosso in ${dove}: rgb(${fondo})`).toBeGreaterThanOrEqual(8)
    expect(letto.testo[0] - letto.testo[1], `il TESTO del popup non è rosso in ${dove}: rgb(${testo})`).toBeGreaterThanOrEqual(8)
    expect(letto.testo[0] - letto.testo[2], `il TESTO del popup non è rosso in ${dove}: rgb(${testo})`).toBeGreaterThanOrEqual(8)
  }
}

/**
 * Apre la dashboard di un dipendente che ha DAVVERO una card di cambio visibile
 * (la lista dipende dal limite cambi dell'admin e da chi guarda: un test non deve
 * dirsi rotto quando è solo vuota) e restituisce le sue richieste dal DB.
 */
async function dashboardConCambio(
  asEmployee: (who: Employee | string) => Promise<Page>,
  richieste: Richiesta[],
) {
  for (const cognome of [...new Set(richieste.map(r => r.cognome))].slice(0, 8)) {
    const page = await asEmployee({ cognome, nome: richieste.find(r => r.cognome === cognome)?.nome ?? '' })
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}`, { waitUntil: 'domcontentloaded' })
    // Si ASPETTA la prima card (la lista arriva da react-query): contarli subito
    // darebbe sempre zero.
    const cecard = await page
      .locator('button[aria-label^="Vedi in sala"]')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false)
    if (cecard) return { page, richieste: richieste.filter(r => r.cognome === cognome), cognome }
  }
  return null
}

/**
 * L'avviso ROSSO che tiene la dashboard ferma: «Dai turni non risulta…»,
 * «… è in sala senza sezione…» o «… è in sezione «IAP», che non ha una card…».
 * Tutti `toast.error` (unico tono rosso con `richColors`): qui si prende il
 * popup per TONO, non per testo, così una frase nuova non fa fallire il test —
 * ciò che conta è che si resti in dashboard e che il messaggio sia un avviso.
 */
function avvisoDashboard(page: Page) {
  return page.locator('[data-sonner-toast][data-type="error"]')
    .filter({ hasText: /Dai turni non risulta|senza sezione|non ha una card|nessuna sezione della board/ })
}

/** La persona compare nella board (equipaggio, tirocinanti o chip gialle)? */
function personaInBoard(cards: Awaited<ReturnType<typeof boardCards>>, cognome: string): boolean {
  const ago = cognome.toLowerCase()
  return cards.some(c => c.text.toLowerCase().includes(ago))
}

/** Giorno, mese, anno e turno che la board sta mostrando ADESSO. */
async function giornoTurnoBoard(page: import('@playwright/test').Page) {
  const testo = (await page.locator('button:has(svg.lucide-chevron-down)').first().innerText()).replace(/\s+/g, ' ').toUpperCase()
  const giorno = Number(testo.match(/\b(\d{1,2})\b/)?.[1])
  const anno = Number(testo.match(/\b(20\d{2})\b/)?.[1])
  const mese = MESI_BREVI.findIndex(m => testo.includes(m)) + 1
  const turno = (await page.locator('button.sala-toolbar-chip').first().innerText()).trim() as 'M' | 'P' | 'N'
  return { mese, giorno, anno, turno }
}

test('il click sulla data naviga solo se la persona è in sala: la decisione combacia con la board', async ({ asEmployee }) => {
  test.setTimeout(180_000)
  const richieste = await richiesteDalDb()
  test.skip(richieste.length === 0, 'nessuna richiesta di cambio nel DB (o service-role assente in .env.local)')

  // Si cerca una persona con ALMENO una card di cambio visibile nella propria
  // dashboard (vedi `dashboardConCambio`).
  const trovato = await dashboardConCambio(asEmployee, richieste)
  test.skip(!trovato, 'nessuna card di cambio visibile per le prime persone con un cambio (limite cambi?)')
  const { page, richieste: mie, cognome } = trovato!

  let verificati = 0
  for (const r of mie.slice(0, 3)) {
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}`, { waitUntil: 'domcontentloaded' })
    const blocchi = page.locator('button[aria-label^="Vedi in sala"]')
    await blocchi.first().waitFor({ state: 'visible', timeout: 20_000 })
    const quanti = await blocchi.count()
    // La card di QUESTA richiesta: l'aria-label porta la data vera e la persona.
    let indice = -1
    for (let i = 0; i < quanti; i++) {
      const label = (await blocchi.nth(i).getAttribute('aria-label')) ?? ''
      const letto = label.match(/turno\s+(\w+)\s+del\s+(\d{1,2})\s+([A-Za-z]+)\s+di\s+(.+)$/)
      if (!letto) continue
      if (NOME_TURNO[letto[1]] === r.shift && Number(letto[2]) === Number(r.shiftDate.slice(8, 10)) &&
          letto[4].includes(r.cognome)) { indice = i; break }
    }
    if (indice < 0) continue
    verificati++

    // (1) LETTURA INDIPENDENTE: la board aperta da zero sulla stessa URL dice se
    // la persona c'è (è la stessa domanda a cui risponde la dashboard, ma per
    // un'altra strada).
    const sulPosto = await openBoard(page, {
      month: Number(r.shiftDate.slice(5, 7)), day: Number(r.shiftDate.slice(8, 10)), shift: r.shift,
      year: Number(r.shiftDate.slice(0, 4)),
    })
    test.skip(!sulPosto, 'board non autenticata')
    const attesa = page.locator('.desk-card-flash')
    const cee = await attesa.waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false)
    const presente = cee || personaInBoard(await boardCards(page), r.cognome)
    if (cee) await attesa.waitFor({ state: 'detached', timeout: 8000 }).catch(() => {})

    // (2) Dalla dashboard: si tappa la colonna della DATA.
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}`, { waitUntil: 'domcontentloaded' })
    await blocchi.first().waitFor({ state: 'visible', timeout: 20_000 })
    expect(await page.locator('.shift-expand-panel').count(), 'la card era già aperta').toBe(0)
    await blocchi.nth(indice).click()

    if (presente) {
      // Deve NAVIGARE, e portare esattamente su quel giorno/turno.
      await expect
        .poll(() => page.url(), { timeout: 20_000, message: `${cognome} è in sala: il click doveva portare a /turnisala` })
        .toContain('/turnisala?')
      const url = new URL(page.url())
      expect(url.searchParams.get('m')).toBe(r.shiftDate.slice(0, 7))
      expect(url.searchParams.get('d')).toBe(String(Number(r.shiftDate.slice(8, 10))))
      expect(url.searchParams.get('t')).toBe(r.shift)
      expect(url.searchParams.get('c')).toBe(r.cognome)
      await expect(page.locator('.desk-card-flash'), 'la card della persona doveva accendersi').toBeVisible({ timeout: 15_000 })
      await expect(page.locator('.desk-card-flash')).toContainText(r.cognome)
    } else {
      // Deve RESTARE in dashboard, con un messaggio che dice perché.
      const avviso = avvisoDashboard(page)
      await expect(
        avviso,
        `${cognome} non è illuminabile in quel turno: la dashboard doveva dirlo invece di navigare`,
      ).toBeVisible({ timeout: 20_000 })
      await expect(avviso).toContainText(r.cognome)
      // L'avvertimento è ROSSO in chiaro e in scuro, nomina il giorno e chiude
      // col punto (l'utente lo ha chiesto così).
      const testo = (await avviso.innerText()).trim()
      expect(testo, `l'avviso non nomina il giorno: «${testo}»`)
        .toContain('il giorno ' + Number(r.shiftDate.slice(8, 10)))
      expect(testo, `l'avviso non chiude col punto: «${testo}»`).toMatch(/\.$/)
      await avvisoRossoInEntrambiITemi(page, avviso)
      await expect(page.locator('.desk-card-flash')).toHaveCount(0)
      expect(new URL(page.url()).pathname, 'la dashboard non doveva cambiare pagina').toBe('/dashboard')
    }
  }
  expect(verificati, `nessuna card utile trovata per ${cognome}`).toBeGreaterThan(0)
})

test('la persona che è in sala si accende: «respiro» di 3s, anche con «riduci animazioni»', async ({ asEmployee }) => {
  test.setTimeout(90_000)
  // La persona viene dalla BOARD stessa (il primo cognome dell'equipaggio del
  // giorno a schermo): il caso «c'è» è così sempre provato, senza dipendere da
  // quali richieste esistono nel DB.
  const page = await asEmployee('Di Monda')
  // IL CASO VERO DEL 19/09/2026: la macchina dell'utente ha «riduci animazioni»
  // attivo (il browser lo dichiara con `prefers-reduced-motion: reduce`) e la
  // PRIMA versione di questo CSS spegneva l'animazione proprio lì: si vedeva un
  // contorno fisso per 3s e sembrava un difetto. Qui si emula quella condizione,
  // così l'animazione è garantita anche nel suo caso.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.sala-card-bg').first()).toBeVisible({ timeout: 25_000 })
  const { mese, giorno, anno, turno } = await giornoTurnoBoard(page)
  expect(mese, 'mese non riconosciuto nella toolbar della board').toBeGreaterThan(0)
  test.skip(!giorno || !anno, 'toolbar della board senza giorno/anno leggibili')

  const cognome = (await boardCards(page))
    .flatMap(c => c.names.split(/[\s,/]+/))
    .map(n => n.trim())
    .find(n => /^[A-Z][a-zà-ù]{3,}$/.test(n))
  test.skip(!cognome, 'nessun nome estraibile dalle card del giorno a schermo')

  await page.goto(
    `${E2E_BASE_URL}/turnisala?${DEV}&m=${anno}-${String(mese).padStart(2, '0')}&d=${giorno}&t=${turno}&c=${cognome}`,
    { waitUntil: 'domcontentloaded' },
  )
  const flash = page.locator('.desk-card-flash')
  await expect(flash, `${cognome} era nella board: la sua card doveva accendersi`).toBeVisible({ timeout: 15_000 })
  await expect(flash).toContainText(cognome!)

  // Il segno è quello di casa (contorno di 2px nel colore dell'evidenzia) e attorno
  // pulsa un alone: 3 respiri da 1s = 3s, la durata di SALA_FLASH_MS lato JS.
  const stile = await flash.first().evaluate(el => {
    const s = getComputedStyle(el)
    return {
      bordo: s.borderTopColor,
      ombre: s.boxShadow,
      respiro: [s.animationName, s.animationDuration, s.animationIterationCount].join('|'),
    }
  })
  expect(stile.respiro, 'con «riduci animazioni» il respiro deve restare attivo').toBe('desk-card-flash|3s|1')

  // I FOTOGRAMMI dell'animazione, letti dal foglio di stile: il respiro è di TRE
  // aloni che si allargano (blur 14px) e l'ULTIMO fotogramma porta a zero l'alone
  // E il contorno nello stesso istante (richiesta 19/09/2026: prima il bordo
  // sopravviveva alla fine del respiro). Senza questo controllo il difetto si
  // sarebbe potuto ripresentare senza che nessuno se ne accorgesse.
  const fotogrammi = await page.evaluate(() => {
    // Ricerca RICORSIVA: in Tailwind 4 le regole di globals.css possono vivere
    // dentro un @layer, quindi i keyframes non sono per forza fra le regole di
    // primo livello del foglio.
    const cerca = (regole: CSSRuleList | undefined): CSSKeyframesRule | null => {
      for (const r of Array.from(regole ?? [])) {
        if (r instanceof CSSKeyframesRule && r.name === 'desk-card-flash') return r
        const dentro = (r as CSSGroupingRule).cssRules
        if (dentro) {
          const trovato = cerca(dentro)
          if (trovato) return trovato
        }
      }
      return null
    }
    for (const foglio of Array.from(document.styleSheets)) {
      let regole: CSSRuleList
      try { regole = foglio.cssRules } catch { continue }
      const kf = cerca(regole)
      if (kf) {
        // Ogni ombra dichiarata è «X Y blur spread colore», ma il colore qui è
        // un var()/color-mix() — e col suo interno si porta dietro parentesi e
        // virgole che romperebbero la lettura. Si tolgono prima TUTTE le
        // parentesi (dall'interno verso l'esterno: color-mix(in srgb, var(--x)
        // 40%, transparent)), così ogni strato resta di soli numeri e il TERZO è
        // il blur (0 è serializzato senza unità: si legge col parseFloat).
        const strati = (v: string) => {
          let s = v
          let prima = ''
          while (s !== prima) { prima = s; s = s.replace(/\([^()]*\)/g, '') }
          return s.split(',').map(l => parseFloat((l.trim().split(/\s+/)[2] ?? '0')) || 0)
        }
        return Array.from(kf.cssRules as unknown as CSSKeyframeRule[]).map(f => ({
          chiave: f.keyText,
          bordo: f.style.borderColor,
          blur: strati(f.style.boxShadow),
        }))
      }
    }
    return null
  })
  expect(fotogrammi, 'keyframes desk-card-flash non trovati nel foglio di stile').not.toBeNull()
  const frames = fotogrammi!
  const aloni = frames.filter(f => f.blur.some(b => b >= 10))
  expect(aloni, 'i respiri devono essere TRE (aloni che si allargano)').toHaveLength(3)
  expect(frames.at(-1)!.chiave).toBe('100%')
  expect(frames.at(-1)!.bordo.toLowerCase(), 'l\'ultimo fotogramma deve spegnere il contorno').toMatch(/transparent|rgba\(0, 0, 0, 0\)/)
  expect(frames.at(-1)!.blur.every(b => b === 0), 'l\'ultimo fotogramma deve spegnere anche l\'alone').toBe(true)
  // Due ombre: il contorno di 1px SUL bordo (fisso) e l'alone che si allarga.
  const ombre = stile.ombre.split(/,(?![^(]*\))/)
  expect(ombre).toHaveLength(2)
  expect(ombre[0]).toContain('0px 0px 0px 1px')
  // Il contorno è nel colore dell'evidenzia: se il tema lo cambia, la card segue.
  const rgb = await flash.first().evaluate(el => {
    const sonda = document.createElement('span')
    sonda.style.color = getComputedStyle(el).getPropertyValue('--sala-highlight-border').trim()
    el.appendChild(sonda)
    const colore = getComputedStyle(sonda).color
    sonda.remove()
    return colore
  })
  expect(stile.bordo).toBe(rgb)

  // Deve durare: dopo oltre un secondo è ancora acceso...
  await page.waitForTimeout(1200)
  expect(await flash.count(), 'il respiro è finito troppo presto (durata attesa 3s)').toBe(1)
  // ...e poi si spegne da solo, senza lasciare un contorno fisso.
  await expect(flash, 'la card è rimasta accesa (durata attesa 3s)').toHaveCount(0, { timeout: 5000 })
})

test('chi è presente senza sezione si accende nella PILLOLA e l\'avviso giallo non esce', async ({ asEmployee }) => {
  test.setTimeout(120_000)
  const sb = adminClient()
  test.skip(!sb, 'service-role assente in .env.local')

  // Una persona VERA con un token che la board mostra nella riga «Altre attività»
  // (turno «nudo», trasferta, corso, TUTOR…): è il caso del collega. Si cerca nei
  // mesi caricati, sui dati veri, e si preferisce un cognome senza omonimi.
  const { data: mesi } = await sb!
    .from('sala_schedule').select('month, schedule').order('month', { ascending: false }).limit(8)
  // Cognomi che nel DB sono UNICI: il flash non deve dipendere dagli omonimi
  // (quello è un altro test).
  const { data: utenti } = await sb!.from('users').select('cognome')
  const quanti = new Map<string, number>()
  for (const u of utenti ?? []) {
    const k = (u.cognome ?? '').toUpperCase()
    quanti.set(k, (quanti.get(k) ?? 0) + 1)
  }
  let caso: { mese: string; giorno: number; cognome: string; nome: string; token: string } | null = null
  for (const row of (mesi ?? []).slice().reverse()) {
    if (!isSalaMonthData(row.schedule)) continue
    const people = decodeSalaMonth(row.schedule)
    for (const p of people) {
      const giorno = p.days.findIndex((token: string) => boardPlacementOf(token)?.kind === 'altri')
      if (giorno < 0) continue
      const [cognome, ...resto] = (p.name ?? '').trim().split(/\s+/)
      if (!cognome || quanti.get(cognome.toUpperCase()) !== 1) continue
      caso = { mese: String(row.month), giorno: giorno + 1, cognome, nome: resto.join(' '), token: p.days[giorno] }
      break
    }
    if (caso) break
  }
  test.skip(!caso, 'nessuna persona «presente senza sezione» nei mesi caricati')

  const page = await asEmployee('Di Monda')
  const iniziale = (caso!.token[0] ?? '').toUpperCase()
  const shift = (iniziale === 'M' || iniziale === 'P' || iniziale === 'N' ? iniziale : 'P') as 'M' | 'P' | 'N'
  // La stessa URL che costruisce la dashboard dalla card di un cambio. Si entra
  // DIRETTAMENTE qui (come fa chi arriva da un link condiviso): è il giro in cui
  // l'avviso, se c'è, esce insieme all'evidenzia e non dopo.
  await page.goto(
    `${E2E_BASE_URL}/turnisala?${DEV}&m=${caso!.mese}&d=${caso!.giorno}&t=${shift}&c=${caso!.cognome}&n=${caso!.nome}`,
    { waitUntil: 'domcontentloaded' },
  )
  const caricata = await page.waitForSelector('.sala-card-bg', { timeout: 25_000 }).then(() => true).catch(() => false)
  test.skip(!caricata, 'board non autenticata')

  const flash = page.locator('.desk-card-flash')
  const avviso = page.locator('[data-sonner-toast]').filter({ hasText: /non è in sala/i })
  await expect(
    flash,
    `${caso!.cognome} (token «${caso!.token}») è nel giorno a schermo: qualcosa doveva accendersi`,
  ).toBeVisible({ timeout: 20_000 })

  const pillola = await flash.first().evaluate(el => ({
    fuoriDalleCard: el.closest('.sala-card-bg') === null,
    classi: el.className,
    respiro: getComputedStyle(el).animationName,
  }))
  expect(pillola.fuoriDalleCard, 'l’evidenzia doveva essere la PILLOLA delle «Altre attività», non una card').toBe(true)
  expect(pillola.classi, 'la pillola del gruppo conserva la sua tinta').toMatch(/altri-pill-|desk-own-badge/)
  expect(pillola.respiro, 'la pillola respira come una card').toBe('desk-card-flash')
  expect(
    (await flash.first().innerText()).toLowerCase(),
    'la pillola accesa non è quella della persona cercata',
  ).toContain(caso!.cognome.toLowerCase())

  // IL DIFETTO: il vecchio avviso giallo «non è in sala…» non deve uscire — c'era
  // qualcosa da accendere, e si è acceso.
  // IL DIFETTO — due CAMPIONI, non due attese: l'avviso esce INSIEME all'evidenzia
  // (misurato: stessi ~600 ms), quindi in questi due istanti o c'è o non c'è mai
  // stato. `toHaveCount(0)` qui non servirebbe: aspettando la scomparsa di un
  // avviso già comparso passerebbe comunque (un falso verde).
  expect(
    await avviso.count(),
    'la board ha dichiarato «non è in sala» su una persona che era lì (avviso uscito con l’evidenzia)',
  ).toBe(0)
  // Secondo campione alla FINE del respiro: il respiro dura 3s dalla conferma del
  // mese (non dal primo disegno), quindi copre anche la riconvalida in background.
  await expect(flash, 'il respiro è durato più di 12s: il mese non è mai stato confermato').toHaveCount(0, { timeout: 20_000 })
  expect(
    await avviso.count(),
    'la board ha dichiarato «non è in sala» su una persona che era lì (avviso uscito alla riconvalida)',
  ).toBe(0)
})

test('anche il blocco con l\'ordinale (2°, 3°…) porta al turno giusto', async ({ asEmployee }) => {
  test.setTimeout(60_000)
  // Dal secondo cambio in poi una data non mostra il giorno ma un ordinale: il
  // blocco deve restare una porta verso lo STESSO giorno, con la persona e il
  // turno resi dall'aria-label (l'ordinale da solo non direbbe la data).
  //
  // Si guarda la lista con gli occhi di un DCO+: vede TUTTI i cambi, quindi le
  // date con più richieste (quelle che producono l'ordinale) non gli sfuggono —
  // un DCO normale vede solo una parte della lista e può non avere nessun «2°».
  const sb = adminClient()
  const { data: dcoPlus } = sb
    ? await sb.from('users').select('cognome, nome').eq('is_dco_plus', true).limit(5)
    : { data: null }
  const chiVedeTutto = (dcoPlus ?? []).find(u => u.cognome)
  test.skip(!chiVedeTutto, 'nessun utente DCO+ nel DB: la lista completa non è visibile a chi esegue il test')
  const page = await asEmployee({ cognome: chiVedeTutto!.cognome as string, nome: (chiVedeTutto!.nome as string) ?? '' })
  await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}`, { waitUntil: 'domcontentloaded' })

  const blocco = page.locator('button[aria-label^="Vedi in sala"]', { hasText: '°' }).first()
  const presente = await blocco.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
  test.skip(!presente, 'nessuna data con più di un cambio in questo momento')

  const etichetta = (await blocco.getAttribute('aria-label')) ?? ''
  expect((await blocco.innerText()).trim(), 'il blocco doveva mostrare l’ordinale').toMatch(/^\d+°$/)
  const letto = etichetta.match(/turno\s+(\w+)\s+del\s+(\d{1,2})\s+([A-Za-z]+)\s+di\s+(.+)$/)
  expect(letto, `etichetta inattesa sull'ordinale: «${etichetta}»`).toBeTruthy()
  const[, turnoNome, giornoLetto, meseLetto, personaLetta] = letto!
  const meseNum = MESI_BREVI.indexOf(meseLetto.slice(0, 3).toUpperCase()) + 1

  await blocco.click()
  // Due esiti possibili, entrambi corretti: se la persona è in sala (e lo dice la
  // board) si naviga; altrimenti il messaggio resta qui. Quello che NON deve mai
  // succedere è il silenzio.
  const navigato = await page
    .waitForURL(/\/turnisala\?/, { timeout: 8_000 })
    .then(() => true)
    .catch(() => false)
  if (navigato) {
    const url = new URL(page.url())
    expect(url.searchParams.get('d')).toBe(String(Number(giornoLetto)))
    expect(url.searchParams.get('t')).toBe(NOME_TURNO[turnoNome])
    expect(url.searchParams.get('c')).toBe(personaLetta.trim())
    expect(url.searchParams.get('m')).toBe(`2026-${String(meseNum).padStart(2, '0')}`)
  } else {
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: 'Dai turni non risulta' }),
      'dal blocco con l’ordinale: né navigazione né messaggio',
    ).toBeVisible({ timeout: 20_000 })
  }
})

test('una persona che non c\'è: la board aperta a mano lo dice e non accende niente', async ({ asEmployee }) => {
  test.setTimeout(60_000)
  const page = await asEmployee('Di Monda')
  const sb = adminClient()
  const { data: mesi } = sb ? await sb.from('sala_schedule').select('month') : { data: null }
  const mese = (mesi ?? []).map(r => String(r.month)).sort().at(-1)
  test.skip(!mese, 'nessun mese caricato nel DB')

  // Rete di sicurezza per chi arriva sull'URL senza passare dalla dashboard
  // (link condiviso, push): la board deve spiegarsi, non restare muta.
  await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}&m=${mese}&d=15&t=P&c=Zzznonesistemai`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.locator('.sala-card-bg').first()).toBeVisible({ timeout: 20_000 })

  await expect(page.locator('[data-sonner-toast]').filter({ hasText: /non è in sala/i })).toBeVisible({ timeout: 20_000 })
  expect(await page.locator('.desk-card-flash').count(), 'nessuna card per una persona sconosciuta').toBe(0)
  await expect
    .poll(() => page.url(), { timeout: 15_000, message: 'i parametri della card restano nella URL' })
    .not.toMatch(/[?&](m|d|t|c)=/)
})

test('salto istantaneo: la verifica parte al pointerdown e il click non la rifà', async ({ asEmployee }) => {
  test.setTimeout(180_000)
  const richieste = await richiesteDalDb()
  test.skip(richieste.length === 0, 'nessuna richiesta di cambio nel DB (o service-role assente in .env.local)')
  const trovato = await dashboardConCambio(asEmployee, richieste)
  test.skip(!trovato, 'nessuna card di cambio visibile per le prime persone con un cambio (limite cambi?)')
  const { page } = trovato!

  // Si contano SOLO le richieste della verifica della card: è la PRIMA query di
  // `getUserShiftOnDate` (`sala_schedule?select=schedule&month=eq.…`) e nessun
  // altro punto dell'app la fa con quella forma (la board e «il tuo turno»
  // chiedono `month, schedule, …`, cioè una URL diversa).
  const verifiche: string[] = []
  page.on('request', r => {
    if (/rest\/v1\/sala_schedule\?select=schedule/.test(r.url())) verifiche.push(r.url())
  })

  const blocco = page.locator('button[aria-label^="Vedi in sala"]').first()
  await blocco.waitFor({ state: 'visible', timeout: 20_000 })
  const etichetta = (await blocco.getAttribute('aria-label')) ?? ''
  const richiestePrima = verifiche.length

  // (1) IL DITO AVVIA LA VERIFICA: nessuna domanda prima del tocco, una dopo.
  await blocco.dispatchEvent('pointerdown')
  await expect
    .poll(() => verifiche.length, {
      timeout: 6000,
      message: `il pointerdown doveva già chiedere ai turni il turno della card («${etichetta}»)`,
    })
    .toBeGreaterThan(richiestePrima)
  const dopoIlDito = verifiche.length

  // Si lascia arrivare la risposta: da qui l'esito è in memoria per quella
  // persona in quel giorno.
  await page.waitForTimeout(1200)

  // (2) IL CLICK NON RIFÀ LA DOMANDA e non mostra attesa: l'esito è già lì.
  // I due esiti possibili (si naviga / resta il messaggio) si aspettano IN
  // PARALLELO: misurare l'uno e poi l'altro falserebbe il tempo (il timeout del
  // primo lo farebbe sembrare lento).
  const avviso = avvisoDashboard(page)
  const esitoP = Promise.race([
    page.waitForURL(/\/turnisala\?/, { timeout: 6000 }).then(() => 'navigato' as const),
    avviso.waitFor({ state: 'visible', timeout: 6000 }).then(() => 'messaggio' as const),
  ]).catch(() => 'niente' as const)
  const t0 = Date.now()
  await blocco.click()
  const esito = await esitoP
  const avvio = Date.now() - t0
  const navigato = esito === 'navigato'
  expect(esito, `né navigazione né messaggio dopo il click («${etichetta}»): non si capisce cosa sia successo`)
    .not.toBe('niente')
  if (!navigato) await avvisoRossoInEntrambiITemi(page, avviso)
  expect(
    verifiche.length,
    `il click ha rifatto la domanda invece di ricordare l'esito che il dito aveva già chiesto («${etichetta}»)`,
  ).toBe(dopoIlDito)
  expect(
    avvio,
    `l'esito era già in memoria: il click doveva avere effetto subito, non dopo ${avvio}ms`,
  ).toBeLessThan(600)

  // (3) LA MEMORIA È PER PERSONA **E** GIORNO: tornando in dashboard (navigazione
  // client, il modulo resta vivo) e toccando di nuovo la STESSA card non si
  // richiede niente. Se invece la si tocca restando in dashboard, il secondo tap
  // nemmeno naviga: in nessuno dei due casi deve ripartire una richiesta.
  if (navigato) {
    await page.goBack({ waitUntil: 'domcontentloaded' })
    const ancora = page.locator('button[aria-label^="Vedi in sala"]').filter({ hasText: /./ }).first()
    const ritorno = await ancora.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false)
    if (ritorno && (await ancora.getAttribute('aria-label')) === etichetta) {
      const primaDelRitorno = verifiche.length
      await ancora.click()
      await page.waitForTimeout(1500)
      expect(
        verifiche.length,
        `il secondo tap sulla stessa card (${etichetta}) ha richiesto di nuovo i turni: la memoria non ha retto`,
      ).toBe(primaDelRitorno)
    }
  }
})
