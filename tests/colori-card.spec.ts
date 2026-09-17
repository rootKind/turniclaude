import { test, expect, findEmployee } from './fixtures'
import { E2E_BASE_URL } from './employee-session'
import { apriVoceFabConRitentativo } from './tuoturno'

/**
 * IL PANNELLO DEI COLORI DI /TUOTURNO (richiesta 17/09/2026).
 *
 * Prima ogni pallino era un `<input type="color">`: si apriva il selettore del
 * SISTEMA — finestra di Windows, cerchio di Android, sheet di iOS — diverso su
 * ogni dispositivo, senza tinte pronte e senza palette. Ora c'è un selettore
 * nostro (`components/ui/color-picker.tsx`) con le palette pronte sopra
 * (`lib/card-palettes.ts`): questo test guarda quello che il contratto di logica
 * (`palette-colori.spec.ts`) non può vedere, cioè che il pannello APPLICHI i
 * colori alle card e li salvi.
 *
 * La logica dei colori (conversioni, contrasto, palette) si prova senza browser
 * in `tests/palette-colori.spec.ts`.
 */
test.setTimeout(90_000)

/**
 * Apre il pannello «Personalizza le card» passando dai bottoni veri (FAB →
 * Personalizza). Il click sul FAB e l'apertura del pannello passano da due
 * componenti diversi, quindi si passa dall'aiuto che RIPROVA la voce se il
 * pannello non compare (tests/tuoturno.ts): la corsa con l'idratazione è già
 * costata due falsi rossi a dev server freddo.
 */
async function apriPersonalizza(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog')
  await apriVoceFabConRitentativo(
    page,
    'Personalizza colori e stile delle card',
    dialog.getByText('Personalizza le card'),
  )
  return dialog
}

/**
 * La palette salvata su questo dispositivo (localStorage), PER TEMA (richiesta
 * 18/09/2026): il file è una busta `{ light: …, dark: … }` e un tema senza voce
 * vuol dire «non ho scelto niente, valgono i colori del tema». Senza scelte la
 * chiave non esiste affatto — e per questo la lettura deve reggere anche il caso
 * «non c'è niente».
 */
function paletteSalvata(page: import('@playwright/test').Page, modo: 'light' | 'dark' = 'light') {
  return page.evaluate(m => {
    const busta = JSON.parse(localStorage.getItem('tuoturno-colori') ?? '{}')
    return busta[m] ?? {}
  }, modo)
}

/** La busta intera come sta su disco (`{}` = nessuna personalizzazione). */
function bustaSalvata(page: import('@playwright/test').Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('tuoturno-colori') ?? '{}'))
}

test('colori delle card: palette pronte e colore singolo, senza selettore di sistema', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
  const page = await asEmployee('Di Monda')
  await page.goto(`${E2E_BASE_URL}/tuoturno?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })

  // Prima di toccare il pannello: niente colori personalizzati in giro.
  expect(await paletteSalvata(page)).toEqual({})

  const dialog = await apriPersonalizza(page)

  // ── 1. Il selettore di sistema non c'è più, le palette pronte sì ───────────
  await expect(dialog.locator('input[type="color"]'), 'il selettore del sistema è stato sostituito').toHaveCount(0)
  await expect(dialog.getByText('Palette pronte')).toBeVisible()
  for (const label of ['Tema', 'Pastello', 'Fluo', 'Carta', 'Notte', 'Contrasto']) {
    await expect(dialog.getByRole('button', { name: new RegExp(`^Palette ${label}:`) }), label).toBeVisible()
  }

  // ── 2. Un template riempie TUTTE le tipologie, e le card lo seguono ────────
  await dialog.getByRole('button', { name: /^Palette Contrasto:/ }).click()
  await expect(dialog.getByRole('button', { name: /^Palette Contrasto:/ })).toHaveAttribute('aria-pressed', 'true')
  const salvata = await paletteSalvata(page)
  expect(Object.keys(salvata), 'sette tipologie riempite in un colpo').toHaveLength(7)
  expect(salvata.mattina).toEqual({ bg: '#000000', text: '#ffffff' })
  expect(salvata.absence).toEqual({ bg: '#ffffff', text: '#000000' })
  // Le celle della griglia portano l'override inline (--c-bg/--c-text): se il
  // mese della persona è vuoto il test lo dice invece di passare a vuoto.
  const celle = await page.locator('.cell-day[style*="--c-bg"]').count()
  expect(celle, 'nessuna cella con il colore applicato: il mese della persona è vuoto?').toBeGreaterThan(0)

  // ── 3. Colore singolo: tinta rapida, poi scritto a mano ────────────────────
  await dialog.getByRole('button', { name: 'Pomeriggio (P): colore sfondo' }).click()
  const picker = page.getByTestId('color-picker')
  await expect(picker).toBeVisible()
  await expect(picker).toHaveAttribute('data-hex', '#000000')       // parte dal colore in vigore
  await picker.getByRole('button', { name: 'Pomeriggio (P): sfondo: tinta rapida #a855f7' }).click()
  await expect(picker).toHaveAttribute('data-hex', '#a855f7')

  const hexInput = picker.getByLabel('Pomeriggio (P): sfondo: codice esadecimale')
  await hexInput.fill('12AB34')
  await hexInput.press('Enter')
  await expect(picker).toHaveAttribute('data-hex', '#12ab34')
  const dopoHex = (await paletteSalvata(page)).pomeriggio
  expect(dopoHex.bg, 'il campo esadecimale scrive davvero il colore').toBe('#12ab34')
  // Sul fondo nuovo il testo si prende da sé un colore leggibile (scuro, qui).
  expect(dopoHex.text).toBe('#111111')

  // Robustezza del campo: quello che non è un colore non passa.
  await hexInput.fill('zzz')
  await hexInput.press('Enter')
  await expect(picker).toHaveAttribute('data-hex', '#12ab34')

  // ── 4. Il testo: avviso di contrasto e «Testo leggibile» ───────────────────
  await dialog.getByRole('button', { name: 'Pomeriggio (P): colore testo' }).click()
  const testoInput = picker.getByLabel('Pomeriggio (P): testo: codice esadecimale')
  await testoInput.fill('12AB33')   // quasi identico al fondo: illeggibile
  await testoInput.press('Enter')
  await expect(picker.getByText(/Contrasto basso/)).toBeVisible()
  await picker.getByRole('button', { name: 'Testo leggibile' }).click()
  await expect(picker.getByText(/Contrasto basso/)).toHaveCount(0)
  expect((await paletteSalvata(page)).pomeriggio.text).toBe('#111111')

  // ── 5. Ripristino: tutto torna al tema ─────────────────────────────────────
  await dialog.getByRole('button', { name: 'Ripristina i colori di questo tema' }).click()
  expect(await bustaSalvata(page), 'senza scelte la chiave non resta appesa al dispositivo').toEqual({})
  await expect(dialog.getByRole('button', { name: /^Palette Contrasto:/ })).toHaveAttribute('aria-pressed', 'false')
  expect(await page.locator('.cell-day[style*="--c-bg"]').count(), 'niente override rimasti').toBe(0)
})

test('colori delle card: la scelta resta su questo dispositivo (localStorage)', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
  const page = await asEmployee('Di Monda')
  const tuoTurno = `${E2E_BASE_URL}/tuoturno?dev=rootkind-dev-2026`
  await page.goto(tuoTurno, { waitUntil: 'domcontentloaded' })

  const dialog = await apriPersonalizza(page)
  await dialog.getByRole('button', { name: /^Palette Pastello:/ }).click()
  await page.keyboard.press('Escape')   // chiude il dialog (la X dell'involucro)

  // Riaprendo la pagina la palette è ancora lì: è una preferenza LOCALE
  // (per dispositivo), non un'impostazione dell'account.
  await page.goto(tuoTurno, { waitUntil: 'domcontentloaded' })
  const salvata = await paletteSalvata(page)
  expect(salvata.pomeriggio).toEqual({ bg: '#ffe9cd', text: '#7a4a12' })
  await expect(page.locator('.cell-day[style*="--c-bg: #ffe9cd"]').first()).toBeVisible()

  // Fine del test: si ripristina, così il dispositivo non resta personalizzato.
  const dialog2 = await apriPersonalizza(page)
  await dialog2.getByRole('button', { name: 'Ripristina i colori di questo tema' }).click()
  expect(await bustaSalvata(page)).toEqual({})
})

/**
 * UNA CONFIGURAZIONE PER TEMA (richiesta 18/09/2026).
 *
 * Il motivo è la leggibilità: una tinta che si legge bene sul fondo chiaro può
 * sparire sul fondo scuro, e con una configurazione sola l'utente doveva
 * scegliere a quale dei due temi rovinare l'aspetto. Qui le due scelte convivono,
 * e il default di ciascun tema resta quello dell'app (chiaro → Tema, scuro →
 * Notte): il test lo pretende guardando anche le card, non solo il pannello.
 */
test('colori delle card: la configurazione è una per tema, e non si pestano', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
  const page = await asEmployee('Di Monda')
  await page.setViewportSize({ width: 390, height: 844 })
  const tuoTurno = `${E2E_BASE_URL}/tuoturno?dev=rootkind-dev-2026`

  // ── In CHIARO: si sceglie il Contrasto (bianco e nero) ─────────────────────
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(tuoTurno, { waitUntil: 'domcontentloaded' })
  const dialog = await apriPersonalizza(page)
  await expect(dialog.getByText(/tema chiaro · predefinita Tema/)).toBeVisible()
  await dialog.getByRole('button', { name: /^Palette Contrasto:/ }).click()
  expect(await paletteSalvata(page, 'light')).toMatchObject({ rest: { bg: '#000000', text: '#ffffff' } })
  expect(await paletteSalvata(page, 'dark'), 'scrivendo in chiaro lo scuro resta vuoto').toEqual({})

  // ── In SCURO: nessuna scelta, quindi le card sono quelle del tema scuro ────
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(tuoTurno, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html.dark')).toHaveCount(1)
  const dialogScuro = await apriPersonalizza(page)
  await expect(dialogScuro.getByText(/tema scuro · predefinita Notte/)).toBeVisible()
  await expect(
    dialogScuro.getByRole('button', { name: /^Palette Notte:/ }),
    'in scuro vale ancora il default: la scelta fatta in chiaro non si trasferisce',
  ).toHaveAttribute('aria-pressed', 'true')
  // Nessun override inline: le card sono quelle del tema scuro.
  expect(await page.locator('.cell-day[style*="--c-bg"]').count()).toBe(0)
  const riposoScuro = await page.evaluate(() => {
    const cella = document.querySelector('.cell-day.cell-tint-rest')
    return cella ? getComputedStyle(cella).backgroundColor.replace(/\s/g, '') : null
  })
  if (riposoScuro) expect(riposoScuro, 'riposo del tema scuro (= preset Notte)').toBe('rgb(36,40,46)')

  // ── In scuro si sceglie un'ALTRA cosa (il giallo del tema chiaro sarebbe
  //    illeggibile su fondo scuro: è il caso che ha motivato la richiesta) ────
  await dialogScuro.getByRole('button', { name: /^Palette Fluo:/ }).click()
  expect(await paletteSalvata(page, 'dark')).toMatchObject({ rest: { bg: '#d4ff00' } })
  expect(await paletteSalvata(page, 'light'), 'e la scelta del chiaro resta quella di prima').toMatchObject({
    rest: { bg: '#000000', text: '#ffffff' },
  })
  await expect(dialogScuro.getByRole('button', { name: /^Palette Fluo:/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.cell-day[style*="--c-bg: #d4ff00"]').first()).toBeVisible()

  // ── Tornando in chiaro, la sua configurazione è ancora lì ──────────────────
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(tuoTurno, { waitUntil: 'domcontentloaded' })
  const dialogChiaro = await apriPersonalizza(page)
  await expect(dialogChiaro.getByRole('button', { name: /^Palette Contrasto:/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.cell-day[style*="--c-bg: #000000"]').first()).toBeVisible()
  // La busta su disco ha le due voci, una per tema.
  expect(Object.keys(await bustaSalvata(page)).sort()).toEqual(['dark', 'light'])

  // ── Il ripristino è PER TEMA: toglie solo quello che si sta guardando ──────
  await dialogChiaro.getByRole('button', { name: 'Ripristina i colori di questo tema' }).click()
  expect(await paletteSalvata(page, 'light')).toEqual({})
  expect(await paletteSalvata(page, 'dark'), 'il ripristino in chiaro non tocca lo scuro').toMatchObject({
    rest: { bg: '#d4ff00' },
  })
  // E si lascia il dispositivo pulito: via anche la voce dello scuro.
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(tuoTurno, { waitUntil: 'domcontentloaded' })
  const finale = await apriPersonalizza(page)
  await finale.getByRole('button', { name: 'Ripristina i colori di questo tema' }).click()
  expect(await bustaSalvata(page)).toEqual({})
})

/**
 * LA MIGRAZIONE DAL FORMATO VECCHIO (richiesta 18/09/2026).
 *
 * Prima della divisione per tema, su disco c'era UNA preferenza sola: la palette
 * come mappa piatta (`{rest: {bg, text}}`) e le due scelte a stringa scritta
 * NUDO (`localStorage.setItem(k, 'strike')`, non `JSON.stringify`). Chi aveva già
 * personalizzato non deve perdere niente dopo l'aggiornamento: la preferenza
 * vecchia si legge e si applica a ENTRAMBI i temi — era quello che faceva —
 * mentre le due nuove restano libere di divergere da lì in poi.
 */
test('le preferenze salvate col formato vecchio si leggono ancora (una sola per i due temi)', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
  const page = await asEmployee('Di Monda')
  const tuoTurno = `${E2E_BASE_URL}/tuoturno?dev=rootkind-dev-2026`
  await page.addInitScript(() => {
    localStorage.setItem('tuoturno-colori', JSON.stringify({ rest: { bg: '#ff00ff', text: '#111111' } }))
    localStorage.setItem('tuoturno-mismatch', 'strike')      // valore nudo, non JSON
    localStorage.setItem('tuoturno-pending-ring', 'yellow-dashed')
  })

  for (const schema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: schema })
    await page.goto(tuoTurno, { waitUntil: 'domcontentloaded' })
    // La tinta vecchia vale in entrambi i temi: era una preferenza sola.
    await expect(
      page.locator('.cell-day[style*="--c-bg: #ff00ff"]').first(),
      `la palette vecchia non è applicata in tema ${schema}`,
    ).toBeVisible()
    // E le due scelte a stringa nuda si riconoscono (prima si perdevano: non erano JSON).
    const dialog = await apriPersonalizza(page)
    await expect(dialog.getByRole('button', { name: 'Tratteggio' })).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog.getByRole('button', { name: 'Teorico barrato' })).toHaveAttribute('aria-pressed', 'true')
    await expect(dialog.getByRole('button', { name: 'Giallo', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('Escape')
    // La lettura del formato vecchio è una MIGRAZIONE IN MEMORIA: non riscrive
    // niente su disco, quindi il pannello di quel tema resta «non
    // personalizzato» (e la scelta, da lì in poi, è libera di divergere).
    expect(await bustaSalvata(page), `in tema ${schema} la lettura non deve riscrivere`).toEqual({
      rest: { bg: '#ff00ff', text: '#111111' },
    })
  }

  // Il dispositivo del test si lascia pulito come l'ha trovato.
  await page.evaluate(() => {
    localStorage.removeItem('tuoturno-colori')
    localStorage.removeItem('tuoturno-mismatch')
    localStorage.removeItem('tuoturno-pending-ring')
  })
  expect(await bustaSalvata(page)).toEqual({})
})

/**
 * IL DEFAULT SEGUE IL TEMA (richiesta 17/09/2026): in chiaro le card sono quelle
 * del tema chiaro («Tema»), in scuro quelle del tema scuro («Notte»). Il pannello
 * dice quale delle due è già in vigore, e non si scrive niente: il default non è
 * una personalizzazione, è quello che l'app mostra comunque.
 */
test('colori delle card: in chiaro il default è Tema, in scuro è Notte', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
  const page = await asEmployee('Di Monda')
  const tuoTurno = `${E2E_BASE_URL}/tuoturno?dev=rootkind-dev-2026`
  const tema = page.getByRole('button', { name: /^Palette Tema:/ })
  const notte = page.getByRole('button', { name: /^Palette Notte:/ })

  // Tema chiaro (il default dell'app, che segue il sistema)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(tuoTurno, { waitUntil: 'domcontentloaded' })
  await (await apriPersonalizza(page)).getByRole('button', { name: /^Palette Tema:/ }).scrollIntoViewIfNeeded()
  await expect(tema, 'in chiaro è già in vigore il tema chiaro').toHaveAttribute('aria-pressed', 'true')
  await expect(notte).toHaveAttribute('aria-pressed', 'false')
  expect(await bustaSalvata(page), 'il default non si salva: non è una scelta').toEqual({})

  // Tema scuro
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(tuoTurno, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html.dark')).toHaveCount(1)
  await (await apriPersonalizza(page)).getByRole('button', { name: /^Palette Notte:/ }).scrollIntoViewIfNeeded()
  await expect(notte, 'in scuro è già in vigore il tema scuro').toHaveAttribute('aria-pressed', 'true')
  await expect(tema).toHaveAttribute('aria-pressed', 'false')
  expect(await bustaSalvata(page)).toEqual({})
  // E le card mostrano DAVVERO i colori di «Notte» senza personalizzazione: il
  // preset è la copia esatta del tema scuro, quindi non serve scrivere nulla.
  const bordoNotte = await page.evaluate(() => {
    const cella = document.querySelector('.cell-day.cell-tint-rest')
    return cella ? getComputedStyle(cella).backgroundColor : null
  })
  if (bordoNotte) expect(bordoNotte.replace(/\s/g, ''), 'tinta riposo del tema scuro (= preset Notte)').toBe('rgb(36,40,46)')
})
