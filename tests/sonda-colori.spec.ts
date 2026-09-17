import { test, expect, E2E_BASE_URL, findEmployee } from './fixtures'
import { apriVoceFabConRitentativo } from './tuoturno'
import type { Page } from '@playwright/test'

/**
 * LA SONDA COLORI, dal vivo (richiesta 17/09/2026, seconda versione).
 *
 * Il contratto, in ordine di importanza:
 *
 *  1. **IL TOCCO È DELL'APP.** Con la sonda accesa bottoni, card e barra di sotto
 *     funzionano come sempre: si naviga, si aprono i popup, si stira una card.
 *     Era il difetto della prima versione (prendeva i tocchi e per usare l'app
 *     bisognava «sospendere»), e qui si difende che non torni: senza la sonda E
 *     con la sonda, il tocco su una voce della barra porta all'altra pagina.
 *  2. **LA PRESSIONE PROLUNGATA CAMPIONA, SENZA NAVIGARE.** Si tiene premuto
 *     ~1 s (la soglia della sonda è 650 ms, sopra i 500 ms che l'app usa da sé
 *     per il pulsante Ferie: i due gesti non si sovrappongono): compare il bordo
 *     luminoso, il pannello si apre con la pila
 *     degli elementi sotto il dito, e il click che il browser manda al rilascio
 *     NON naviga (altrimenti si perderebbe l'elemento appena preso).
 *  3. **DAL COLORE ALLA RICHIESTA.** La riga dice da quale VARIABILE viene il
 *     colore; cambiandolo si vede subito (l'anteprima è un `<style>` sul
 *     dispositivo) e la richiesta da copiare porta selettore, origine e
 *     «da → a». Poi si azzera: nessun override viene scritto da nessuna parte.
 *  4. **IL CAMPIONARIO CONFRONTA LE PAGINE.** Il motivo per cui si guarda un tema
 *     non è cambiare un colore, è vedere se lo stesso elemento è coerente da una
 *     pagina all'altra: con ＋ il colore resta scritto, e la riga dell'elemento
 *     simile dice da sé se combacia («= … su /turnisala») o no («≠ …»).
 *
 * Serve l'admin: l'utente del progetto è `Minino` (ADMIN_ID). Senza anagrafica
 * (service-role in `.env.local`) i test si SALTANO, non falliscono.
 */

test.setTimeout(180_000)

const CARD = '.sala-card-body'
const PILLOLA = '[data-sonda-colori="pillola"]'

/** Accende la sonda dal pannello admin (è l'unico punto d'ingresso). */
async function accendiSonda(page: Page) {
  await page.goto(`${E2E_BASE_URL}/admin?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /^(Colori|Sonda accesa) — / }).click()
  await expect(page.locator(PILLOLA)).toBeVisible()
}

/**
 * Le coordinate di una card nello spazio libero della pagina. Si aspetta che
 * ALMENO una card ci sia: la board carica i dati dopo il primo disegno, e senza
 * attesa il banco sarebbe vuoto (e il test salterebbe per finta). Si scartano le
 * card troppo in alto (sotto l'intestazione della pagina) e troppo in basso
 * (sotto la barra di navigazione): lì il bersaglio sarebbe un comando, non una
 * card.
 */
async function centroCard(page: Page) {
  await page.locator(CARD).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => null)
  return page.evaluate(sel => {
    for (const el of Array.from(document.querySelectorAll(sel)) as HTMLElement[]) {
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      if (r.width >= 40 && y > 90 && y < window.innerHeight - 130 && x > 8 && x < window.innerWidth - 8) return { x, y }
    }
    return null
  }, CARD)
}

/**
 * La pressione prolungata, come la farebbe un dito: giù, mezzo secondo fermo,
 * su. Il mouse di Playwright non ha un «long press», quindi si compone.
 */
async function premiALungo(page: Page, x: number, y: number, ms = 900) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test('senza la sonda il tocco naviga: la barra di sotto resta viva', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Minino')), 'serve l’admin in anagrafica (service-role in .env.local)')
  const page = await asEmployee('Minino')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${E2E_BASE_URL}/turnisala?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  // Controllo negativo: niente sonda accesa, il tocco deve portare a /tuoturno.
  await expect(page.locator(PILLOLA)).toHaveCount(0)
  await page.getByRole('link', { name: 'Il tuo turno' }).click()
  await expect(page).toHaveURL(/\/tuoturno/)
})

test('con la sonda accesa il tocco naviga ancora: è il patto della seconda versione', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Minino')), 'serve l’admin in anagrafica (service-role in .env.local)')
  const page = await asEmployee('Minino')
  await page.setViewportSize({ width: 390, height: 844 })
  await accendiSonda(page)
  await page.goto(`${E2E_BASE_URL}/turnisala?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  // Il tocco sulla barra di sotto naviga: la sonda NON lo prende (era il difetto
  // della prima versione: per muoversi bisognava sospenderla).
  await page.getByRole('link', { name: 'Il tuo turno' }).click()
  await expect(page).toHaveURL(/\/tuoturno/)
  await expect(page.locator(PILLOLA)).toBeVisible()   // e la sonda è ancora accesa

  // E anche i comandi DENTRO la pagina rispondono: il FAB apre il suo menù e la
  // voce apre il pannello. Era l'altra metà del problema («non posso premere
  // bottoni, aprire popup»).
  await apriVoceFabConRitentativo(
    page,
    'Personalizza colori e stile delle card',
    page.getByText('Personalizza le card'),
  )
})

test('premi a lungo per campionare: il bordo compare, il pannello si apre, e non si naviga', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Minino')), 'serve l’admin in anagrafica (service-role in .env.local)')
  const page = await asEmployee('Minino')
  // Il display più piccolo che l'app deve reggere (come le altre prove di questa
  // suite): la sonda vive dentro l'app e non deve sbordare.
  await page.setViewportSize({ width: 320, height: 640 })
  await accendiSonda(page)
  await page.goto(`${E2E_BASE_URL}/turnisala?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  const punto = await centroCard(page)
  test.skip(!punto, 'nessuna card della sala visibile in questo momento')
  const url = page.url()
  await premiALungo(page, punto!.x, punto!.y)

  // Ha CAMPIONATO, non navigato.
  await expect(page).toHaveURL(url)
  await expect(page.getByTestId('sonda-evidenzia')).toHaveCount(1)

  // Il pannello si apre da solo e mostra la PILA: la pressione prende il pezzo
  // più piccolo, quindi la card si ripesca salendo di un livello da qui.
  const pannello = page.locator('[data-sonda-colori="pannello"]')
  await expect(pannello).toBeVisible()
  await expect(pannello).toContainText(/elementi sotto la pressione/i)
  await pannello.getByRole('button', { name: /sala-card-body/ }).first().click()
  await expect(pannello).toContainText('sala-card-body')

  // Niente sbordi orizzontali a 320px: pannello e pillola stanno nella finestra.
  const sbordi = await page.evaluate(() => {
    const out: string[] = []
    for (const sel of ['[data-sonda-colori="pannello"]', '[data-sonda-colori="pillola"]']) {
      const el = document.querySelector(sel) as HTMLElement | null
      if (el && el.scrollWidth > el.clientWidth + 1) out.push(`${sel}: ${el.scrollWidth} > ${el.clientWidth}`)
    }
    return out
  })
  expect(sbordi, sbordi.join('\n')).toEqual([])

  // Controllo negativo della PRESSIONE mancata: un tocco secco sulla stessa card
  // non seleziona niente di nuovo (il pannello chiuso non si riapre a sorpresa).
  await pannello.getByRole('button', { name: 'Chiudi il pannello' }).click()
  await page.mouse.click(punto!.x, punto!.y)
  await expect(page.locator('[data-sonda-colori="pannello"]')).toHaveCount(0)
})

test('dal colore alla richiesta, e poi indietro: l’anteprima è solo qui', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Minino')), 'serve l’admin in anagrafica (service-role in .env.local)')
  const page = await asEmployee('Minino')
  await page.setViewportSize({ width: 390, height: 844 })
  await accendiSonda(page)
  await page.goto(`${E2E_BASE_URL}/turnisala?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  const punto = await centroCard(page)
  test.skip(!punto, 'nessuna card della sala visibile in questo momento')
  const sfondoPrima = await page.evaluate(sel => getComputedStyle(document.querySelector(sel)!).backgroundColor, CARD)
  const url = page.url()
  await premiALungo(page, punto!.x, punto!.y)

  const pannello = page.locator('[data-sonda-colori="pannello"]')
  await expect(pannello).toBeVisible()
  // Si sale al livello della CARD (la pressione prende il testo): lì c'è lo sfondo.
  await pannello.getByRole('button', { name: /sala-card-body/ }).first().click()
  await expect(page).toHaveURL(url)   // navigare no, selezionare sì

  const primaRiga = pannello.locator('button[aria-expanded]').first()
  const etichetta = (await primaRiga.innerText()).split('\n')[0]
  // La riga dice DA DOVE viene il colore: è il motivo per cui esiste la sonda.
  await expect(primaRiga).toContainText('Sfondo')
  await expect(primaRiga).toContainText('variabile --sala-card-body-bg')
  await primaRiga.click()

  const picker = pannello.getByTestId('color-picker')
  await expect(picker).toBeVisible()
  const campo = picker.getByLabel(/codice esadecimale/)
  await campo.fill('FF0000')
  await campo.press('Enter')

  // L'ANTEPRIMA: un foglio sul dispositivo con la variabile nel blocco giusto.
  // (Il contenuto di un `<style>` non ha testo «visibile»: si legge textContent.)
  const foglio = await page.locator('#sonda-colori-anteprima').evaluate(el => el.textContent ?? '')
  expect(foglio).toContain('--sala-card-body-bg: #ff0000')
  expect(foglio).toContain('era #f8fbfd')
  expect(await page.evaluate(sel => getComputedStyle(document.querySelector(sel)!).backgroundColor, CARD)).toBe('rgb(255, 0, 0)')
  await expect(page.getByTestId('sonda-apri')).toHaveAttribute('aria-expanded', 'true')

  // LA RICHIESTA: pagina, elemento, selettore, origine e da → a.
  await pannello.getByRole('button', { name: /Copia la richiesta/ }).click()
  const richiesta = page.getByTestId('sonda-richiesta')
  await expect(richiesta).toBeVisible()
  const testo = await richiesta.inputValue()
  expect(testo).toContain('RICHIESTA COLORI')
  expect(testo).toContain('pagina:    /turnisala')
  expect(testo).toContain('selettore: ')
  expect(testo).toContain('oggi è:    variabile --')
  expect(testo).toContain(`→`)
  expect(testo).toContain(etichetta.trim())

  // AZZERA: il foglio sparisce e i colori tornano quelli di sempre.
  await pannello.getByRole('button', { name: /Azzera l’anteprima/ }).click()
  await expect(page.locator('#sonda-colori-anteprima')).toHaveCount(0)
  expect(await page.evaluate(sel => getComputedStyle(document.querySelector(sel)!).backgroundColor, CARD)).toBe(sfondoPrima)
})

test('in tema scuro l’anteprima va nel blocco .dark, non in :root', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Minino')), 'serve l’admin in anagrafica (service-role in .env.local)')
  const page = await asEmployee('Minino')
  await page.setViewportSize({ width: 390, height: 844 })
  await accendiSonda(page)

  // In chiaro e in scuro le variabili sono DUE insiemi diversi (globals.css:
  // `:root` e `.dark`): una modifica pensata per il tema scuro deve finire in
  // `.dark`, altrimenti cambierebbe anche il chiaro.
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(`${E2E_BASE_URL}/turnisala?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html.dark')).toHaveCount(1)

  const punto = await centroCard(page)
  test.skip(!punto, 'nessuna card della sala visibile in questo momento')
  await premiALungo(page, punto!.x, punto!.y)
  await expect(page.locator('[data-sonda-colori="pannello"]')).toContainText('scuro')

  const pannello = page.locator('[data-sonda-colori="pannello"]')
  await pannello.getByRole('button', { name: /sala-card-body/ }).first().click()
  const primaRiga = pannello.locator('button[aria-expanded]').first()
  await expect(primaRiga).toContainText('variabile --sala-card-body-bg')
  await expect(primaRiga).toContainText('tema scuro')      // cioè «(.dark)»
  await primaRiga.click()
  const campo = pannello.getByTestId('color-picker').getByLabel(/codice esadecimale/)
  await campo.fill('00FF00')
  await campo.press('Enter')

  const foglio = await page.locator('#sonda-colori-anteprima').evaluate(el => el.textContent ?? '')
  expect(foglio).toContain('.dark {')
  expect(foglio).toContain('--sala-card-body-bg: #00ff00')
  expect(foglio).not.toContain(':root {')
  // E si azzera, così non resta niente in giro.
  await pannello.getByRole('button', { name: /Azzera l’anteprima/ }).click()
  await expect(page.locator('#sonda-colori-anteprima')).toHaveCount(0)
})

/**
 * IL CONFRONTO FRA PAGINE — la ragione per cui la sonda esiste in questa forma.
 *
 * Si fotografa un elemento che c'è su TUTTE le pagine (la barra di navigazione
 * in basso) su /turnisala, si cambia pagina con un tocco vero, si fotografa lo
 * stesso elemento su /turniferie: la riga del colore dice da sé se combacia
 * («= … su /turnisala») o no («≠ …»), e nel campionario i due campioni sono UN
 * gruppo con due pagine. È il pezzo che sostituisce il «me lo ricordo a memoria».
 */
test('il campionario confronta lo stesso elemento fra due pagine', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Minino')), 'serve l’admin in anagrafica (service-role in .env.local)')
  const page = await asEmployee('Minino')
  await page.setViewportSize({ width: 390, height: 844 })

  // Il campionario è PERSISTITO sul dispositivo: si parte da zero, altrimenti il
  // test dipenderebbe da quello che c'è dentro da ieri. (Un `addInitScript` non
  // andrebbe bene: rigirerebbe a OGNI navigazione, sgonfiando anche `armata`.)
  await page.goto(`${E2E_BASE_URL}/turnisala?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('sonda-colori')
    if (!raw) return
    const stato = JSON.parse(raw)
    window.localStorage.setItem('sonda-colori', JSON.stringify({ ...stato, state: { ...stato.state, campioni: [] } }))
  })
  await accendiSonda(page)
  await page.goto(`${E2E_BASE_URL}/turnisala?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  const pannello = page.locator('[data-sonda-colori="pannello"]')

  /**
   * Fotografa lo sfondo della barra di navigazione in basso, dovunque ci si trovi.
   * La barra è l'unico elemento identico su tutte le pagine: è il banco di prova
   * naturale per «lo stesso colore da un'altra parte». La pressione prende il
   * pezzo più piccolo (una voce della barra), quindi si sale al livello `nav`
   * dalla pila.
   */
  const fotografaLaBarra = async () => {
    const nav = await page.locator('nav').first().boundingBox()
    expect(nav, 'barra di navigazione non trovata').not.toBeNull()
    await premiALungo(page, nav!.x + 24, nav!.y + nav!.height / 2)
    await expect(pannello).toBeVisible()
    await pannello.getByRole('button', { name: /^nav/ }).first().click()
    const riga = pannello.locator('button[aria-expanded]').first()
    await expect(riga, 'lo sfondo della barra non è modificabile da qui').toContainText(/sfondo/i)
    const etichetta = ((await riga.innerText()).split('\n')[0] ?? '').trim()
    await pannello.getByTestId('sonda-segna').first().click()
    return etichetta
  }

  const nome = await fotografaLaBarra()
  await expect(page.locator(PILLOLA)).toContainText('◎ 1')

  // Si cambia pagina (i tocchi dell'app li prova la seconda prova di questo
  // file): la sonda resta accesa e il campionario la segue.
  await pannello.getByRole('button', { name: 'Chiudi il pannello' }).click()
  await page.goto(`${E2E_BASE_URL}/turniferie?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()
  await expect(page.locator(PILLOLA)).toContainText('◎ 1')

  // Seconda fotografia: stessa riga, altra pagina. Il confronto è già scritto
  // NELLA RIGA (non serve aprire il campionario), ed è la risposta al «sono
  // coerenti?» senza doverselo ricordare.
  const nome2 = await fotografaLaBarra()
  expect(nome2, 'la stessa barra non ha lo stesso nome di colore nelle due pagine').toBe(nome)
  await expect(page.locator(PILLOLA)).toContainText('◎ 2')
  const rigaSeconda = pannello.locator('button[aria-expanded]').first()
  await expect(rigaSeconda).toContainText('/turnisala')     // «= … su /turnisala» (o «≠ …»)

  // Nel campionario i due campioni sono UN gruppo con dentro le due pagine: è
  // così che si vede a colpo d'occhio dove il tema non torna.
  await page.getByTestId('sonda-vista-campionario').click()
  const campionario = page.getByTestId('sonda-campionario')
  await expect(campionario).toBeVisible()
  await expect(campionario.locator('ul')).toHaveCount(1)
  await expect(campionario.locator('li')).toHaveCount(2)
  await expect(campionario).toContainText('/turnisala')
  await expect(campionario).toContainText('/turniferie')
  // La barra di sotto è la stessa componente su ogni pagina: qui il tema è
  // coerente, quindi il gruppo NON deve essere segnato come «non torna».
  await expect(campionario).not.toContainText('≠')

  // E il testo da copiare porta il gruppo con le due pagine: è quello che leggo io.
  await pannello.getByRole('button', { name: /Copia il campionario/ }).click()
  const testo = await page.getByTestId('sonda-richiesta').inputValue()
  expect(testo).toContain('CAMPIONARIO COLORI')
  expect(testo).toContain('/turnisala')
  expect(testo).toContain('/turniferie')
  expect(testo).toContain(nome)

  // Il campionario si svuota: non resta appeso al dispositivo.
  await pannello.getByRole('button', { name: /Svuota/ }).click()
  await expect(page.getByTestId('sonda-campionario')).toHaveCount(0)
})
