import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * M11 — LA PWA, IL CHROME DI SISTEMA E L'OFFLINE (23/09/2026).
 *
 * Le quattro voci della milestone hanno in comune una cosa: **non si vedono
 * nell'HTML**. Il manifest è un documento a parte che il browser legge *prima* di
 * disegnare; il colore del chrome lo decide il tema *dopo* l'idratazione; gli
 * inset di sistema li consegna il telefono; l'assenza di rete è uno stato del
 * sistema operativo. Una revisione a occhio non li copre, e ognuno di essi ha una
 * modalità di rottura silenziosa:
 *
 *  · un `sizes` che non combacia col PNG → il browser scarta la screenshot e il
 *    foglio di installazione torna a essere una riga di testo (nessun errore da
 *    nessuna parte);
 *  · una scorciatoia verso una rotta che non esiste più → il menu dell'icona apre
 *    un 404 (nessun errore da nessuna parte);
 *  · un token di sistema che non arriva al chrome → contenuto sotto la barra di
 *    stato (si vede solo su un dispositivo con intaglio).
 *
 * Le prove qui sotto sono quindi prove di DOCUMENTO e di SISTEMA, non di pixel:
 * leggono il manifest servito, l'header dei PNG, i meta del `<head>`, il canale
 * del service worker e i token risolti con gli inset emulati.
 *
 * La piattaforma si sceglie con l'override di QA `?platform=` (come le spec M9/M10):
 * il confronto è fra due skin dello stesso motore, così nessuna differenza di
 * motore entra nella misura. La parte CDP (inset di sistema veri) è l'unica che
 * non può girare su WebKit, e si salta da sola.
 */
const DEV = 'dev=rootkind-dev-2026'

/** La skin va ATTESA: `?platform=` si applica al mount del provider (lezione M9). */
const SKIN = (page: import('@playwright/test').Page, piattaforma: 'android' | 'ios') =>
  page.waitForFunction(
    (p) => document.documentElement.getAttribute('data-platform') === p,
    piattaforma,
    { timeout: 20_000 },
  )

test.describe('M11a — il manifest, cioè l’installazione', () => {
  test('le voci che il foglio di installazione usa sono dichiarate e vere', async ({ request }) => {
    const risposta = await request.get(`${E2E_BASE_URL}/manifest.webmanifest`)
    expect(risposta.ok(), 'il manifest si serve').toBe(true)
    const manifest = await risposta.json()

    // L'ORIENTAMENTO lo decide il telefono: era l'errore Android più visibile del
    // piano (la board di sala si legge meglio in orizzontale) e la sua ricomparsa
    // qui sarebbe invisibile a occhio, perché il campo non disegna niente.
    expect(manifest.orientation, 'niente lock sull’orientamento').toBeUndefined()

    // Identità stabile e perimetro: senza `id` l'identità è lo `start_url`, e
    // cambiarlo in futuro creerebbe una SECONDA app installata.
    expect(manifest.id).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.start_url.startsWith('/'), 'start_url dentro lo scope').toBe(true)
    expect(manifest.lang).toBe('it')
    expect(manifest.dir).toBe('ltr')
    expect(manifest.display).toBe('standalone')
    expect(manifest.display_override).toEqual(['standalone', 'minimal-ui'])
    expect(manifest.categories).toContain('productivity')
    expect(manifest.name).toMatch(/Turni/)

    // La maskable 192: è la taglia che Android sceglie a bassa densità, e senza di
    // essa la tile adattiva veniva scalata dalla 512 (bordi morbidi).
    const icone = (manifest.icons ?? []).map(
      (icona: { sizes: string; purpose?: string }) => `${icona.sizes} ${icona.purpose ?? 'any'}`,
    )
    expect(icone).toContain('192x192 maskable')
    expect(icone).toContain('512x512 maskable')
  })

  test('le scorciatoie puntano a rotte che esistono, e le screenshot esistono davvero', async ({
    request,
  }) => {
    const manifest = await (await request.get(`${E2E_BASE_URL}/manifest.webmanifest`)).json()

    // Le rotte reali, lette dal filesystem: una scorciatoia verso `/turnisala`
    // quando la cartella si chiama diversamente è un 404 nel menu dell'icona, e
    // nessun test di rendering se ne accorgerebbe (il menu dell'icona non è
    // nemmeno dentro l'app).
    const rotte = new Set(
      readdirSync(join(process.cwd(), 'app', '(app)'), { withFileTypes: true })
        .filter((voce) => voce.isDirectory())
        .map((voce) => `/${voce.name}`),
    )
    expect(manifest.shortcuts?.length, 'almeno tre scorciatoie').toBeGreaterThanOrEqual(3)
    for (const scorciatoia of manifest.shortcuts) {
      expect(rotte.has(scorciatoia.url), `la scorciatoia ${scorciatoia.url} è una rotta vera`).toBe(true)
      expect(scorciatoia.name.length).toBeGreaterThan(0)
    }

    // Le screenshot: il file ESISTE e la misura dichiarata combacia con l'header
    // PNG. È il difetto più silenzioso di tutti — il browser scarta in silenzio
    // una screenshot mal dichiarata, e il riquadro ricco dell'installazione
    // sparisce senza che nessuno se ne accorga.
    for (const screenshot of manifest.screenshots ?? []) {
      const png = await request.get(`${E2E_BASE_URL}${screenshot.src}`)
      expect(png.ok(), `${screenshot.src} esiste`).toBe(true)
      const bytes = await png.body()
      const larghezza = bytes.readUInt32BE(16)
      const altezza = bytes.readUInt32BE(20)
      expect(`${larghezza}x${altezza}`, `misura reale di ${screenshot.src}`).toBe(screenshot.sizes)
      expect(screenshot.type).toBe('image/png')
    }
  })

  test('la pagina dichiara il manifest e la viewport che accetta il ritaglio', async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/login?${DEV}`, { waitUntil: 'domcontentloaded' })
    const manifest = page.locator('link[rel="manifest"]')
    await expect(manifest).toHaveAttribute('href', '/manifest.webmanifest')

    // `viewport-fit=cover` è la metà della risposta all'edge-to-edge: dice al
    // browser che ACCETTIAMO di finire sotto il ritaglio (poi il chrome legge
    // `--safe-*`, vedi M11b). Senza, il sistema ci metterebbe comunque le barre,
    // ma con una cornice nostra attorno: due spaziature, non una.
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport, 'viewport-fit=cover nella viewport').toContain('viewport-fit=cover')
  })
})

test.describe('M11b — il chrome di sistema', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'la parte CDP (inset di sistema emulati) gira solo su Chromium',
  )

  test('il colore del chrome segue il tema, e segue lo sfondo della pagina', async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/login?${DEV}`, { waitUntil: 'domcontentloaded' })

    /**
     * In tema SCURO il valore deve essere `#0a0a0a`: è lo stesso numero del
     * manifest e delle icone — il «true black» della PWA. Il tema chiaro
     * `#f0f7fc`. I due valori vengono dal token `--background` quando è un
     * esadecimale, e dalle costanti di `lib/color-defaults.ts` quando è oklch
     * (Safari non accetta oklch nel meta): in entrambi i casi, qui, il risultato
     * è uno dei due.
     */
    const atteso = { dark: '#0a0a0a', light: '#f0f7fc' } as const

    for (const tema of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: tema })
      // La riscrittura avviene in un effetto dopo il cambio di tema: si aspetta
      // la CONDIZIONE, non un tempo (regola di casa).
      await expect
        .poll(async () =>
          page.evaluate(() =>
            Array.from(document.querySelectorAll('meta[name="theme-color"]')).map((meta) =>
              meta.getAttribute('content'),
            ),
          ),
        )
        .toEqual([atteso[tema], atteso[tema]])

      /**
       * Il fondo della PAGINA è il vero chrome su iOS 26 (Safari non legge più il
       * meta): la prova che i due combaciano è che il colore dichiarato è anche
       * quello che il `body` disegna.
       *
       * Le due stringhe NON si possono confrontare fra loro: `--background` è in
       * oklch e Chromium lo restituisce come `lab(2.75 0 0)`, mentre il meta è
       * l'esadecimale del fallback. Sono lo stesso colore scritto in due spazi
       * diversi, quindi si portano entrambi in sRGB — un canvas da 1px e
       * `getImageData` fanno la conversione con lo stesso motore che disegna la
       * pagina — e si confrontano i canali, con 2/255 di tolleranza per
       * l'arrotondamento.
       */
      const pixel = await page.evaluate((dichiarato) => {
        const campiona = (colore: string) => {
          const canvas = document.createElement('canvas')
          canvas.width = 1
          canvas.height = 1
          const ctx = canvas.getContext('2d')!
          ctx.fillStyle = colore
          ctx.fillRect(0, 0, 1, 1)
          return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3))
        }
        return {
          pagina: campiona(getComputedStyle(document.body).backgroundColor),
          chrome: campiona(dichiarato),
        }
      }, atteso[tema])
      for (let canale = 0; canale < 3; canale++) {
        expect(
          Math.abs(pixel.pagina[canale] - pixel.chrome[canale]),
          `canale ${canale}: la pagina ${pixel.pagina} e il chrome ${pixel.chrome} sono lo stesso colore`,
        ).toBeLessThanOrEqual(2)
      }
    }
  })

  test('Chromium accetta gli inset di sistema veri (come fa Android 15)', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page).catch(() => null)
    test.skip(!cdp, 'nessuna sessione CDP disponibile')

    await page.goto(`${E2E_BASE_URL}/login?${DEV}`, { waitUntil: 'domcontentloaded' })

    try {
      await cdp!.send('Emulation.setSafeAreaInsetsOverride', {
        insets: { top: 47, left: 0, bottom: 34, right: 0 },
      })
    } catch {
      test.skip(true, 'questo Chromium non espone Emulation.setSafeAreaInsetsOverride')
    }

    // La stessa catena della prova degli inset, ma col valore che arriva dal
    // BROWSER invece che dal test: se un giorno Chrome smettesse di consegnarli,
    // qui si vedrebbe `0px` — cioè contenuto sotto la barra di stato — e non in
    // produzione.
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--safe-top').trim()))
      .toBe('47px')
  })
})

test.describe('M11b-bis — gli inset arrivano al chrome', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'gli inset si iniettano come stile: la misura si fa su un solo motore',
  )
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(120_000)

  test('testata e barra crescono con gli inset di sistema', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    // La testata esiste su /dashboard (M8b): è il posto giusto per misurare, perché
    // è l'unico punto dell'app che legge `--safe-top` — la barra in basso legge
    // `--safe-bottom`, e il layout di radice le tiene entrambe.
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}&platform=android`, {
      waitUntil: 'domcontentloaded',
    })
    await SKIN(page, 'android')

    const geometria = () =>
      page.evaluate(() => {
        const radice = getComputedStyle(document.documentElement)
        const barra = document.querySelector('.testata-barra') as HTMLElement | null
        const nav = document.querySelector('nav[aria-label="Navigazione principale"]') as HTMLElement | null
        return {
          insetAlto: radice.getPropertyValue('--safe-top').trim(),
          insetBasso: radice.getPropertyValue('--safe-bottom').trim(),
          imbottituraTestata: barra ? getComputedStyle(barra).paddingTop : null,
          altezzaBarra: barra ? Math.round(barra.getBoundingClientRect().height) : null,
          altezzaNav: nav ? Math.round(nav.getBoundingClientRect().height) : null,
          spazioNav: radice.getPropertyValue('--nav-space').trim(),
        }
      })

    const base = await geometria()
    expect(base.altezzaBarra, 'la pagina deve avere una testata').not.toBeNull()
    expect(base.insetAlto, 'nessun intaglio nell’emulazione: inset zero').toBe('0px')
    expect(base.imbottituraTestata, 'senza inset la testata non ha imbottitura alta').toBe('0px')

    // Android 15 ha reso l'edge-to-edge OBBLIGATORIO: la finestra si disegna sotto
    // le barre di sistema. Qui si iniettano i due inset come li consegnerebbe il
    // sistema (47 = barra di stato, 34 = barra gesti) e si guarda cosa fa il
    // chrome — cioè se i token di M6/M8 sono ancora la strada da cui passa
    // l'informazione, o se qualcuno ha scritto un numero a mano nel frattempo.
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-top', '47px')
      document.documentElement.style.setProperty('--safe-bottom', '34px')
    })

    const conInset = await geometria()
    expect(conInset.insetAlto).toBe('47px')
    expect(conInset.imbottituraTestata, 'la testata scende sotto la barra di stato').toBe('47px')
    expect(
      (conInset.altezzaBarra ?? 0) - (base.altezzaBarra ?? 0),
      'la testata cresce quanto l’inset (la sua area è alta come il sistema)',
    ).toBe(47)
    expect(
      (conInset.altezzaNav ?? 0) - (base.altezzaNav ?? 0),
      'la banda della barra si estende sotto la barra gesti',
    ).toBe(34)
    // …e il contenuto non ci finisce dentro: `--nav-space` è ciò che le pagine
    // leggono per lasciare spazio in fondo.
    expect(conInset.spazioNav).not.toBe(base.spazioNav)

    // Si torna indietro: uno stile in linea dimenticato falserebbe ogni lettura
    // successiva, ed è il modo classico in cui una prova di sistema «passa» per
    // il motivo sbagliato.
    await page.evaluate(() => {
      document.documentElement.style.removeProperty('--safe-top')
      document.documentElement.style.removeProperty('--safe-bottom')
    })
    expect((await geometria()).imbottituraTestata, 'la rimozione riporta tutto com’era').toBe('0px')
  })
})

test.describe('M11c — l’offline', () => {
  test('senza rete l’app lo dice, e dice anche cosa resta in cache', async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/login?${DEV}&platform=android`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'android')

    const avviso = page.locator('[data-offline="true"]')
    await expect(avviso, 'online: nessun avviso').toHaveCount(0)

    await page.context().setOffline(true)
    await expect(avviso).toBeVisible()
    // `role="status"`: l'attesa si annuncia senza rubare il fuoco (l'avviso non è
    // una finestra di dialogo, e non deve interrompere chi sta scrivendo).
    await expect(page.locator('[role="status"][data-offline="true"]')).toHaveCount(1)
    await expect(avviso).toContainText('Sei offline')
    await expect(avviso).toContainText('Le modifiche non si salvano')
    // Il testo NON promette che l'app funzioni offline: le pagine non sono in
    // cache di proposito (public/sw.js), e la voce di cache dice il vero.
    await expect(avviso).toContainText(/risorse in cache locale|Cache locale non disponibile/)

    // Il conteggio arriva dal service worker (asincrono): si aspetta che ci sia.
    await expect
      .poll(async () => Number(await avviso.getAttribute('data-cache-voci')), {
        message: 'il conteggio della cache arriva dal service worker',
      })
      .toBeGreaterThan(0)

    // «Riprova» mentre la rete è ancora giù: non si finge un successo, l'avviso
    // resta e il pulsante torna utilizzabile.
    await avviso.getByRole('button', { name: 'Riprova' }).click()
    await expect(avviso).toBeVisible()
    await expect(avviso.getByRole('button', { name: 'Riprova' })).toBeEnabled()

    // Torna la rete: l'avviso si ritira da solo (evento `online`).
    await page.context().setOffline(false)
    await expect(avviso).toHaveCount(0)
  })

  test('«Riprova» funziona anche col flag di sistema storto', async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/login?${DEV}&platform=android`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'android')

    // Il caso vero: la rete C'È ma `navigator.onLine` è rimasto falso (un Wi-Fi
    // che risponde ai ping di sistema ma non ha internet, o un cambio di rete non
    // notificato). Si simula proprio questo — l'evento `offline` senza la rete
    // spenta — ed è la ragione per cui il pulsante fa un ping vero invece di
    // fidarsi del flag: se si fidasse, resterebbe lì per sempre.
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    const avviso = page.locator('[data-offline="true"]')
    await expect(avviso).toBeVisible()

    await avviso.getByRole('button', { name: 'Riprova' }).click()
    await expect(avviso, 'il ping riesce: l’avviso si ritira senza ricaricare').toHaveCount(0)
  })

  test('l’avviso sta sotto la barra di stato anche quando il sistema ne dichiara una', async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/login?${DEV}&platform=ios`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'ios')

    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-top', '47px')
      window.dispatchEvent(new Event('offline'))
    })

    const avviso = page.locator('[data-offline="true"]')
    await expect(avviso).toBeVisible()
    // `max(var(--safe-top), 8px)`: il bordo alto dell'avviso non finisce sotto
    // l'orologio (è la stessa regola dei fogli e della testata).
    expect(await avviso.evaluate((el) => getComputedStyle(el).paddingTop)).toBe('47px')
    // …e la forma è quella di iOS: fascia appoggiata al bordo, senza raggi e
    // senza ombra (su Android la stessa classe ha raggio e ombra: vedi M11b).
    expect(await avviso.evaluate((el) => getComputedStyle(el).borderTopLeftRadius)).toBe('0px')
    expect(await avviso.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none')
  })
})

test.describe('M11d — il percorso di installazione', () => {
  test('la pagina di installazione racconta ciò che il manifest promette', async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/installa?${DEV}&platform=android`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'android')

    const blocco = page.locator('[data-install-info="true"]')
    await expect(blocco).toBeVisible()
    await expect(blocco).toContainText("Dopo l'installazione")

    // Le quattro scorciatoie dichiarate nel manifest sono anche quelle raccontate
    // all'utente: se il manifest ne perde una, questo testo mente.
    const manifest = await (await page.request.get(`${E2E_BASE_URL}/manifest.webmanifest`)).json()
    for (const scorciatoia of manifest.shortcuts ?? []) {
      await expect(blocco, `la scorciatoia «${scorciatoia.name}» è raccontata`).toContainText(
        scorciatoia.name,
      )
    }

    // E dice la verità sull'offline: l'app NON funziona senza rete (le pagine non
    // sono in cache), quindi la pagina non può prometterlo.
    await expect(blocco).toContainText('non salva')
  })

  test('iOS legge la sua ricetta per le scorciatoie', async ({ page }) => {
    await page.goto(`${E2E_BASE_URL}/installa?${DEV}&platform=ios`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'ios')
    await expect(page.getByText('Haptic Touch')).toBeVisible()
  })
})
