import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'
import { adminClient } from './supabase-admin'
import { PLATFORM_ATTR } from '../lib/platform'
import { VACATION_PERIOD_LABELS } from '../lib/vacations'

/**
 * GLI OVERLAY, DUE PIATTAFORME — M3 del design system (20/09/2026).
 *
 * Il report contestava tre cose, e ognuna si vede solo a schermo:
 *
 *   1. **«Overlay centrati universali»** (issue n. 4): su iOS i TASK si fanno nei
 *      fogli che salgono dal basso, non nei dialog centrati. Qui si pretende che
 *      la stessa pagina, con lo stesso codice, dia un foglio su iPhone e un
 *      dialog centrato su Android e desktop.
 *   2. **«Close × ghost»**: la × appoggiata sul contenuto era il difetto di
 *      `tests/shift-dialog.spec.ts`. Su un foglio la via d'uscita è SCRITTA
 *      («Chiudi») e sta in una riga sua.
 *   3. **La conferma delle azioni distruttive** (issue n. 6): «Elimina tutte»
 *      nella cronologia delle notifiche svuotava senza chiedere, e nella card di
 *      una richiesta di ferie la conferma era IN LINEA (due pulsanti al posto di
 *      uno). Qui si prova che adesso CHIEDE — con un allarme centrato su ENTRAMBE
 *      le piattaforme, perché un allarme non è un foglio — e che «Annulla» non
 *      cancella niente.
 *
 * Più una quarta, che è una misura del report e non un'opinione: lo snackbar di
 * Material sta in BASSO (l'app lo mostrava in alto al centro su ogni
 * dispositivo).
 *
 * Il valore atteso dipende dal PROGETTO Playwright (`ios` = WebKit/iPhone,
 * `android` = Chromium/Pixel, `chromium` = desktop), quindi la spec gira nei tre.
 */
const DEV = 'dev=rootkind-dev-2026'

type Piattaforma = 'ios' | 'android' | 'desktop'

function piattaformaDelProgetto(): Piattaforma {
  const nome = test.info().project.name
  if (nome === 'ios') return 'ios'
  if (nome === 'android') return 'android'
  return 'desktop'
}

/** Il dialog dei popup: `[data-slot="dialog-content"]` è il contratto del primitivo. */
const dialogo = (page: import('@playwright/test').Page) =>
  page.locator('[data-slot="dialog-content"]').first()
const velo = (page: import('@playwright/test').Page) =>
  page.locator('[data-slot="dialog-overlay"]').first()
/** La barra di navigazione: serve per navigare con un link VERO (vedi M8). */
const nav = (page: import('@playwright/test').Page) =>
  page.locator('nav[aria-label="Navigazione principale"]')

/**
 * Forma, geometria e velo del dialog aperto, misurati sul motore vero.
 *
 * Il confronto con il VELO e non con `window.innerHeight` è voluto: su WebKit il
 * viewport di LAYOUT (quello a cui si aggancia `position: fixed`) è più alto di
 * quello visuale — misurato su iPhone: 1195 contro 664 — quindi «quanto dista dal
 * fondo dello schermo» lì non vuol dire niente. Il velo è `position: fixed;
 * inset: 0`, quindi è il suo rettangolo il riferimento giusto: «il foglio tocca
 * il fondo» diventa «il foglio tocca il fondo del velo», che vale su ogni motore.
 */
async function misureDelDialogo(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const d = document.querySelector('[data-slot="dialog-content"]') as HTMLElement
    const o = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement
    const r = d.getBoundingClientRect()
    const ro = o.getBoundingClientRect()
    const cs = getComputedStyle(d)
    const co = getComputedStyle(o)
    // La scriminatura: la barretta 36×4 centrata in cima al foglio.
    const scriminatura = [...d.querySelectorAll<HTMLElement>('span')].some((s) => {
      const b = s.getBoundingClientRect()
      return Math.round(b.height) === 4 && Math.round(b.width) === 36
    })
    return {
      forma: d.getAttribute('data-shape'),
      // Distanze dal velo: 0 = appoggiato al fondo, metà altezza = centrato.
      distanzaDalFondo: Math.round(ro.bottom - r.bottom),
      distanzaDalBordoAlto: Math.round(r.top - ro.top),
      scostamentoDalCentro: Math.round((r.top + r.bottom) / 2 - (ro.top + ro.bottom) / 2),
      altezzaVelo: Math.round(ro.height),
      larghezzaVelo: Math.round(ro.width),
      raggio: cs.borderTopLeftRadius,
      larghezza: Math.round(r.width),
      scriminatura,
      velo: { sfondo: co.backgroundColor, sfocatura: co.backdropFilter },
    }
  })
}

test.describe('Overlay (M3): la forma la decide la piattaforma', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(120_000)

  test('un TASK è un foglio su iOS e un dialog centrato altrove', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const atteso = piattaformaDelProgetto()
    const page = await asEmployee('Minino')
    // /tuoturno ha un dialog «task» che usa la × di serie: il selettore di chi
    // guardare. Serve perché è proprio la × (e la sua alternativa scritta) la
    // cosa che cambia fra le due piattaforme.
    await page.goto(`${E2E_BASE_URL}/tuoturno?${DEV}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute(PLATFORM_ATTR, atteso)
    await page.getByLabel('Scegli di chi vedere i turni').click()
    await expect(dialogo(page)).toBeVisible({ timeout: 20_000 })
    // TRAPPOLA (vista misurare un foglio 531px sotto lo schermo): il foglio sale
    // con un'animazione che parte da `translateY(100%)`, quindi per i primi 300ms
    // il suo rettangolo È quello di partenza. Misurare subito vuol dire misurare
    // l'animazione, non la posizione: si aspetta che sia finita.
    await expect(dialogo(page)).toHaveCSS('transform', 'none', { timeout: 5_000 })

    const m = await misureDelDialogo(page)

    if (atteso === 'ios') {
      // Il FOGLIO: appoggiato al bordo inferiore, non a tutta altezza, con la
      // scriminatura e la via d'uscita scritta in una riga sua.
      expect(m.forma, 'su iOS un task si apre in un foglio').toBe('sheet')
      expect(m.distanzaDalFondo, 'il foglio tocca il bordo inferiore').toBe(0)
      expect(m.distanzaDalBordoAlto, 'un foglio non copre tutto lo schermo').toBeGreaterThan(
        m.altezzaVelo * 0.15,
      )
      expect(m.larghezza, 'il foglio è largo quanto lo schermo').toBe(m.larghezzaVelo)
      expect(m.raggio, 'angoli alti arrotondati col raggio del foglio').toBe('10px')
      expect(m.scriminatura).toBe(true)
      await expect(dialogo(page).getByRole('button', { name: 'Chiudi' })).toBeVisible()
    } else if (atteso === 'android') {
      // Il DIALOG di Material: centrato, 28dp di raggio, velo al 32% senza sfocatura.
      expect(m.forma).toBe('dialog')
      expect(Math.abs(m.scostamentoDalCentro), 'centrato in verticale').toBeLessThan(4)
      expect(m.raggio, 'M3: 28dp').toBe('28px')
      expect(m.velo.sfondo).toBe('rgba(0, 0, 0, 0.32)')
      expect(m.velo.sfocatura, 'Material scherma, non sfoca').toBe('none')
      await expect(dialogo(page).getByRole('button', { name: 'Chiudi' })).toBeVisible()
    } else {
      // Il DESKTOP è la prova che la M3 non sposta un pixel: raggio 12, velo al
      // 10% sfocato, centrato.
      expect(m.forma).toBe('dialog')
      expect(Math.abs(m.scostamentoDalCentro), 'centrato in verticale').toBeLessThan(4)
      expect(m.raggio, 'rounded-xl, come prima').toBe('12px')
      expect(m.velo.sfondo).toBe('rgba(0, 0, 0, 0.1)')
      expect(m.velo.sfocatura, 'backdrop-blur, come prima').toBe('blur(4px)')
      expect(m.scriminatura, 'la scriminatura è una cosa da foglio').toBe(false)
    }
  })

  test('l’ALLARME è centrato su ogni piattaforma, non ha la ×, e «Annulla» non cancella', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const atteso = piattaformaDelProgetto()
    const page = await asEmployee('Minino')

    // La cronologia delle notifiche vive sul DISPOSITIVO: si semina prima di
    // caricare la pagina, così le azioni di /notifiche esistono (senza storico
    // non c'è niente da svuotare e il pulsante non compare nemmeno).
    await page.addInitScript(() => {
      const voce = (id: string, read: boolean) => ({
        id,
        title: `Prova ${id}`,
        body: 'Voce seminata dalla spec degli overlay',
        timestamp: Date.now(),
        read,
      })
      localStorage.setItem('notification-history', JSON.stringify([voce('a', false), voce('b', true)]))
    })
    await page.goto(`${E2E_BASE_URL}/notifiche?${DEV}`, { waitUntil: 'domcontentloaded' })

    // Il comando delle azioni (fuori dalla barra, dalla M2) → «Elimina tutte».
    await page.locator('button[data-nav-actions="control"]').click()
    await page.getByRole('button', { name: 'Elimina tutte' }).click()

    const allarme = dialogo(page)
    await expect(allarme).toBeVisible()
    await expect(allarme.getByText('Svuotare la cronologia delle notifiche?')).toBeVisible()

    // Un allarme NON è un foglio, nemmeno su iOS: è centrato.
    const m = await misureDelDialogo(page)
    expect(m.forma, 'un allarme resta un dialog anche su iOS').toBe('dialog')
    expect(Math.abs(m.scostamentoDalCentro), 'centrato').toBeLessThan(4)
    await expect(allarme.getByRole('button', { name: 'Chiudi' }), 'HIG: un allarme si risponde, non si chiude').toHaveCount(0)

    // Le due uscite, con la disposizione della piattaforma: impilate e a tutta
    // larghezza su iOS, affiancate e strette su Android/desktop.
    const conferma = allarme.getByRole('button', { name: 'Elimina tutte' })
    const annulla = allarme.getByRole('button', { name: 'Annulla' })
    await expect(conferma).toBeVisible()
    await expect(annulla).toBeVisible()

    const disposizione = await page.evaluate(() => {
      const d = document.querySelector('[data-slot="dialog-content"]') as HTMLElement
      const larghezza = d.getBoundingClientRect().width
      const bottoni = [...d.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect()
        return { testo: (b.textContent ?? '').trim(), w: Math.round(r.width), top: Math.round(r.top) }
      })
      return { larghezza: Math.round(larghezza), bottoni }
    })
    const conferma2 = disposizione.bottoni.find((b) => b.testo === 'Elimina tutte')!
    const annulla2 = disposizione.bottoni.find((b) => b.testo === 'Annulla')!
    if (atteso === 'ios') {
      expect(conferma2.w, 'iOS: le azioni sono righe a tutta larghezza').toBe(disposizione.larghezza)
      expect(annulla2.w).toBe(disposizione.larghezza)
      expect(annulla2.top, 'iOS: impilate (una sotto l’altra)').toBeGreaterThan(conferma2.top)
    } else {
      expect(conferma2.w, 'M3: pulsanti testuali, non righe a tutta larghezza').toBeLessThan(
        disposizione.larghezza / 2,
      )
      expect(Math.abs(annulla2.top - conferma2.top), 'affiancate').toBeLessThan(4)
    }

    // «Annulla» chiude e non tocca niente: le due voci seminate sono ancora lì.
    await annulla.click()
    await expect(allarme).toHaveCount(0, { timeout: 5_000 })
    await expect(page.getByText('Prova a')).toBeVisible()
    await expect(page.getByText('Prova b')).toBeVisible()
  })

  test('la card FERIE non ha più la conferma in linea: chiede, e «Annulla» non elimina', async ({
    asEmployee,
  }) => {
    const chi = await findEmployee('Minino')
    test.skip(!chi, 'serve un dipendente (service-role in .env.local)')
    const atteso = piattaformaDelProgetto()
    const page = await asEmployee('Minino')

    // BANCO FINTO, come `turniferie-anno.spec.ts`: la lista è intercettata a
    // livello di rete, così la spec non dipende da chi abbia davvero una
    // richiesta in corso e — soprattutto — NON SCRIVE nel database condiviso (il
    // DELETE è finto: `viva` tiene il posto della riga).
    // La richiesta è dell'utente LOGGATO: è la condizione perché compaiano i
    // comandi «Elimina» (sulla card di un altro i comandi sono altre cose).
    const RICHIESTA = {
      id: 999_001,
      user_id: chi!.id,
      offered_period: 3,
      target_periods: [3],
      year: 2026,
      is_pending: false,
      created_at: '2026-09-12T08:00:00.000Z',
      user: { id: chi!.id, nome: chi!.nome, cognome: chi!.cognome, is_secondary: false },
      vacation_request_interests: [],
    }
    let viva = true
    await page.route('**/rest/v1/vacation_requests**', async (route) => {
      if (route.request().method() === 'DELETE') {
        viva = false
        return route.fulfill({ json: [{ id: RICHIESTA.id }] })
      }
      return route.fulfill({ json: viva ? [RICHIESTA] : [] })
    })

    // /vacanze è la bacheca delle RICHIESTE (le card con «Elimina»); /turniferie è
    // la piantina dei periodi. Si prova dove vive il comando.
    await page.goto(`${E2E_BASE_URL}/vacanze?${DEV}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveAttribute(PLATFORM_ATTR, atteso)

    // La card si espande al tocco sulla riga: è lì dentro che vivono i comandi.
    const riga = page.locator('div[role="button"][aria-expanded]').first()
    await expect(riga).toBeVisible({ timeout: 20_000 })
    await riga.click()
    const pannello = page.locator('.shift-expand-panel').first()
    await expect(pannello).toBeVisible()

    // IL DIFETTO: prima la card sostituiva «Elimina» con «Conferma»/«Annulla» in
    // linea. Adesso non c'è nessuna conferma dentro la card.
    await expect(pannello.getByRole('button', { name: 'Conferma' })).toHaveCount(0)
    await expect(pannello.getByRole('button', { name: 'Annulla' })).toHaveCount(0)

    await pannello.getByRole('button', { name: /Elimina/ }).click()
    const allarme = dialogo(page)
    await expect(allarme).toBeVisible()
    await expect(allarme.getByText('Eliminare questa richiesta?')).toBeVisible()

    // L'allarme dice COSA si perde — periodo, giorno, anno — perché era questa
    // l'altra metà del difetto: si distruggeva senza nominare la richiesta.
    await expect(allarme).toContainText('P3')
    await expect(allarme).toContainText(VACATION_PERIOD_LABELS[3].label)
    await expect(allarme).toContainText('12 set')

    // E non è un foglio, su nessuna delle due piattaforme: è un allarme.
    const m = await misureDelDialogo(page)
    expect(m.forma, 'un allarme resta un dialog anche su iOS').toBe('dialog')
    expect(Math.abs(m.scostamentoDalCentro), 'centrato').toBeLessThan(4)
    await expect(allarme.getByRole('button', { name: 'Chiudi' })).toHaveCount(0)
    await expect(velo(page), 'un allarme scherma la pagina').toBeVisible()

    // «Annulla» chiude e non elimina: la richiesta è ancora in elenco E nel banco.
    await allarme.getByRole('button', { name: 'Annulla' }).click()
    await expect(allarme).toHaveCount(0, { timeout: 5_000 })
    await expect(riga).toBeVisible()
    expect(viva, '«Annulla» ha eliminato la richiesta').toBe(true)

    // E solo la CONFERMA porta via la card (con la stessa domanda di prima).
    await pannello.getByRole('button', { name: /Elimina/ }).click()
    await dialogo(page).getByRole('button', { name: 'Elimina' }).click()
    await expect(page.locator('.shift-expand-panel')).toHaveCount(0, { timeout: 10_000 })
    expect(viva, 'la conferma non ha eseguito l’eliminazione').toBe(false)
  })

  test('le conferme del pannello notifiche non sono più quelle del BROWSER', async ({ asEmployee }) => {
    const admin = await findEmployee('Minino')
    test.skip(!admin, 'serve un admin (service-role in .env.local)')
    const page = await asEmployee('Minino')

    // Se una conferma fosse ancora `confirm()`, il BROWSER aprirebbe una finestra
    // sua: la si intercetta e la si annota, perché è esattamente quella la cosa
    // che non si deve più vedere (in una PWA su iOS compare come avviso di
    // sistema, in inglese, scollegato dall'app).
    const finestreDelBrowser: string[] = []
    page.on('dialog', async (d) => {
      finestreDelBrowser.push(d.message())
      await d.dismiss()
    })

    await page.goto(`${E2E_BASE_URL}/admin?${DEV}`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Debug notifiche').first().click()
    await page.getByRole('tab', { name: 'Dispositivi' }).click()

    // Il comando compare solo per chi ha iscrizioni push: senza nessun dispositivo
    // iscritto non c'è niente da confermare, e la spec si salta (non è un difetto).
    const rimuovi = page.getByTitle('Rimuovi tutte le iscrizioni push (debug)').first()
    test.skip((await rimuovi.count()) === 0, 'nessun dispositivo iscritto nel DB')
    await rimuovi.click()

    // L'ALLARME DENTRO UN DIALOG GIÀ APERTO: è il rischio vero di questa
    // migrazione (il pannello è modale e la domanda è un secondo modale), e per
    // questo si prova qui invece di dedurlo.
    const allarme = page.locator('[data-slot="dialog-content"]').last()
    await expect(allarme.getByText(/Rimuovere le iscrizioni di/)).toBeVisible()
    await expect(allarme.getByText(/non riceverà più niente/)).toBeVisible()
    await expect(allarme.getByRole('button', { name: 'Rimuovi' })).toBeVisible()

    const m = await page.evaluate(() => {
      const tutti = [...document.querySelectorAll('[data-slot="dialog-content"]')]
      const a = tutti.at(-1) as HTMLElement
      const o = document.querySelector('[data-slot="dialog-overlay"]') as HTMLElement
      const r = a.getBoundingClientRect()
      const ro = o.getBoundingClientRect()
      return {
        quanti: tutti.length,
        forma: a.getAttribute('data-shape'),
        scostamento: Math.round((r.top + r.bottom) / 2 - (ro.top + ro.bottom) / 2),
      }
    })
    expect(m.quanti, 'il pannello e la sua domanda: due overlay distinti').toBe(2)
    expect(m.forma, 'un allarme resta un dialog anche su iOS').toBe('dialog')
    expect(Math.abs(m.scostamento), 'centrato').toBeLessThan(6)
    await expect(allarme.getByRole('button', { name: 'Chiudi' })).toHaveCount(0)
    expect(finestreDelBrowser, 'una conferma è rimasta quella del browser').toEqual([])

    // «Annulla»: si chiude la domanda e resta il PANNELLO — nessuna iscrizione
    // rimossa (nessuna richiesta di rete parte).
    //
    // La domanda chiusa si conta dal suo TESTO, non con `.last()`: quel locatore
    // si risolve a ogni verifica, quindi dopo la chiusura avrebbe puntato al
    // pannello rimasto e la spec avrebbe detto «1 overlay ancora aperto».
    await allarme.getByRole('button', { name: 'Annulla' }).click()
    await expect(page.getByText(/Rimuovere le iscrizioni di/)).toHaveCount(0, { timeout: 5_000 })
    await expect(page.locator('[data-slot="dialog-content"]'), 'il pannello resta aperto').toHaveCount(1)
  })

  test('il GESTO INDIETRO chiude l’overlay, non la pagina', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    test.skip(
      piattaformaDelProgetto() === 'desktop',
      'sul desktop il pulsante indietro del browser resta la cronologia: nessun sequestro',
    )
    const page = await asEmployee('Minino')

    // Si arriva in /tuoturno con una navigazione DENTRO l'app. Non è pignoleria:
    // il gesto può essere annullato solo se l'attraversamento avviene fra due
    // pagine dello stesso documento (annullabile); tornare indietro verso la
    // pagina bianca del browser è un attraversamento fra documenti, e lì il gesto
    // resta del browser — che è un altro caso, e non quello che M8 promette.
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}`, { waitUntil: 'domcontentloaded' })
    await nav(page).locator('a[aria-label="Il tuo turno"]').click()
    await page.waitForURL(/\/tuoturno/, { timeout: 15_000 })
    await page.getByLabel('Scegli di chi vedere i turni').click()
    await expect(dialogo(page)).toBeVisible({ timeout: 20_000 })

    const percorsoPrima = new URL(page.url()).pathname

    // IL GESTO: una navigazione di storia all'indietro vera, non un click su un
    // pulsante dell'app. È quello che fa il tasto di sistema su Android.
    await page.evaluate(() => history.back())

    await expect(dialogo(page), 'il gesto deve chiudere il foglio').toHaveCount(0, { timeout: 10_000 })
    expect(
      new URL(page.url()).pathname,
      'e la PAGINA non deve cambiare: il gesto era per il foglio, non per la cronologia',
    ).toBe(percorsoPrima)
  })

  test('chiuso col PULSANTE, la voce di cronologia non resta fantasma', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    test.skip(
      piattaformaDelProgetto() === 'desktop',
      'sul desktop l’hook non è attivo (vedi la spec precedente)',
    )
    const page = await asEmployee('Minino')

    // Si arriva in /tuoturno con una navigazione CLIENT (un link della barra),
    // così c'è una voce di cronologia vera a cui tornare: senza, il gesto indietro
    // qui non avrebbe dove andare e la prova non direbbe niente.
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}`, { waitUntil: 'domcontentloaded' })
    await nav(page).locator('a[aria-label="Il tuo turno"]').click()
    await page.waitForURL(/\/tuoturno/, { timeout: 15_000 })

    await page.getByLabel('Scegli di chi vedere i turni').click()
    await expect(dialogo(page)).toBeVisible({ timeout: 20_000 })

    // Chiusura col pulsante: la voce che l'hook aveva scritto in cronologia deve
    // sparire con lui. Se restasse, il PRIMO indietro dell'utente verrebbe speso
    // per un foglio che non c'è più — un gesto che sembra rotto.
    await dialogo(page).getByRole('button', { name: 'Chiudi' }).click()
    await expect(dialogo(page)).toHaveCount(0)

    await page.evaluate(() => history.back())
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe('/dashboard')
  })

  test('il foglio si chiude TRASCINANDO la maniglia', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const atteso = piattaformaDelProgetto()
    test.skip(atteso === 'desktop', 'il trascinamento è un gesto del dito')
    const page = await asEmployee('Minino')

    // Su iOS il foglio dei TASK (la scriminatura c'è sempre); su Android i task
    // sono dialog centrati — e lì l'unico foglio dell'app è l'elenco delle
    // azioni, che è anche l'overlay più frequente di tutti.
    const superficie =
      atteso === 'ios'
        ? dialogo(page)
        : page.getByRole('dialog')

    if (atteso === 'ios') {
      await page.goto(`${E2E_BASE_URL}/tuoturno?${DEV}`, { waitUntil: 'domcontentloaded' })
      await page.getByLabel('Scegli di chi vedere i turni').click()
    } else {
      await page.goto(`${E2E_BASE_URL}/tuoturno?${DEV}`, { waitUntil: 'domcontentloaded' })
      await page.locator('button[data-nav-actions="control"]').click()
    }
    await expect(superficie).toBeVisible({ timeout: 20_000 })

    const maniglia = superficie.locator('.drag-handle')
    await expect(maniglia, 'la maniglia c’è su entrambe le skin').toBeVisible()
    expect(
      await maniglia.evaluate((n) => getComputedStyle(n).touchAction),
      'senza `touch-action: none` il browser legge il gesto come scorrimento e il foglio non si muove',
    ).toBe('none')
    // LA TRAPPOLA DI SEMPRE (vedi la spec del TASK): il foglio entra con
    // un'animazione che parte da `translateY(100%)`, quindi per i primi 300ms il
    // suo rettangolo è quello di PARTENZA. Misurare lì vuol dire premere dove la
    // maniglia sarà, non dove è: il dito cade fuori e non succede niente.
    await expect(superficie).toHaveCSS('transform', 'none', { timeout: 5_000 })

    const riquadro = await maniglia.boundingBox()
    if (!riquadro) throw new Error('la maniglia non ha un riquadro: non è misurabile')
    const x = riquadro.x + riquadro.width / 2
    const y = riquadro.y + riquadro.height / 2

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 60, { steps: 5 })

    // IL FOGLIO SEGUE IL DITO, e di quanto si è mosso il dito: è la parte che una
    // `transition` non può fare (il tempo lo decide il dito, non il foglio di
    // stile). La misura è la TRASLAZIONE e non un «non è `none`»: quel controllo
    // l'avrebbe passato anche l'animazione d'ingresso del foglio, che è
    // esattamente il difetto trovato qui (il dito che afferra un foglio ancora in
    // arrivo veniva scavalcato dalla sua animazione).
    await expect
      .poll(async () =>
        superficie.evaluate((n) => {
          const m = new DOMMatrixReadOnly(getComputedStyle(n).transform)
          return Math.round(m.m42)
        }),
      )
      .toBeGreaterThan(40)

    await page.mouse.up()

    await expect(superficie, 'al rilascio il foglio se ne va').toHaveCount(0, { timeout: 10_000 })
  })

  test('lo snackbar di Material sta in basso, sopra la barra', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const atteso = piattaformaDelProgetto()
    const page = await asEmployee('Minino')

    // Serve un messaggio VERO per guardarne la posizione: si entra in /turnisala
    // con un nome che non esiste (la ricetta di `card-cambio-to-sala.spec.ts`),
    // così la board avverte e il messaggio compare. Nessuna scrittura.
    const sb = adminClient()
    const { data: mesi } = sb ? await sb.from('sala_schedule').select('month') : { data: null }
    const mese = (mesi ?? []).map((r) => String(r.month)).sort().at(-1)
    test.skip(!mese, 'nessun mese caricato nel DB')

    await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}&m=${mese}&d=15&t=P&c=Zzznonesistemai`, {
      waitUntil: 'domcontentloaded',
    })
    // La board deve esserci PRIMA del giudizio: è la stessa attesa di
    // `card-cambio-to-sala.spec.ts` (l'avviso vive della board, non della URL).
    await expect(page.locator('.sala-card-bg').first()).toBeVisible({ timeout: 20_000 })

    /**
     * Posizione e geometria dello snackbar, lette IN UN COLPO SOLO.
     *
     * Perché non due `expect` in fila: lo snackbar è un AVVISO, non un pannello —
     * vive pochi secondi, e Sonner toglie dal DOM anche la sua sezione quando non
     * ha più niente da mostrare. Aspettare il messaggio e POI cercare il
     * contenitore sono due letture separate, e fra le due il messaggio può essere
     * già uscito: era la ragione per cui questa prova era instabile (sul desktop
     * l'avviso dura meno dell'attesa che lo precede). Qui il messaggio giusto si
     * trova, il suo contenitore si legge e le due misure si prendono nello stesso
     * fotogramma.
     */
    const leggiAvviso = () =>
      page.evaluate(() => {
        const toast = Array.from(document.querySelectorAll('[data-sonner-toast]')).find(n =>
          /non è in sala/i.test(n.textContent ?? ''),
        )
        const contenitore = toast?.closest('[data-sonner-toaster]') as HTMLElement | null
        const barra = document.querySelector('nav[aria-label="Navigazione principale"]') as HTMLElement | null
        if (!toast || !contenitore) return null
        return {
          posizione: contenitore.getAttribute('data-y-position'),
          base: Math.round(contenitore.getBoundingClientRect().bottom),
          bordoBarra: barra ? Math.round(barra.getBoundingClientRect().top) : null,
        }
      })

    // Un solo `poll` che dice anche PERCHÉ non è ancora a posto: se lo snackbar
    // tardasse, o comparisse nel posto sbagliato, il messaggio lo direbbe.
    await expect
      .poll(
        async () => {
          const letto = await leggiAvviso()
          if (!letto) return 'non ancora a schermo'
          const attesa = atteso === 'android' ? 'bottom' : 'top'
          if (letto.posizione !== attesa) return `posizione ${letto.posizione} invece di ${attesa}`
          // Su Android lo snackbar sta in basso ma SOPRA la navigation bar: la
          // distanza la detta il componente (`components/ui/sonner.tsx`), che
          // legge `--nav-edge` — il token che sa dove sta il bordo alto della
          // barra (sull'isola di iOS non è l'altezza della barra).
          if (atteso === 'android' && letto.bordoBarra !== null && letto.base > letto.bordoBarra + 1) {
            return `sotto la barra (${letto.base} > ${letto.bordoBarra})`
          }
          return 'a posto'
        },
        { timeout: 20_000, message: 'lo snackbar «non è in sala» deve comparire, e sopra la barra' },
      )
      .toBe('a posto')
  })
})
