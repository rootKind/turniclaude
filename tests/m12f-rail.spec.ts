import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'

/**
 * M12f — LA RAIL (23/09/2026).
 *
 * Il punto che M12 aveva dichiarato fuori: sopra i 600dp la barra in basso
 * diventa la RAIL di Material — una colonna a sinistra, alta quanto la finestra.
 * È la parte del piano che tocca la NAVIGAZIONE invece della pelle, e per questo
 * non è bastato un token: cambia la POSIZIONE di un elemento `fixed`, e con lei
 * cambiano `--nav-space` e `--nav-edge` — cioè lo spazio che FAB, toast, «torna
 * su» e avvisi della board leggono per posizionarsi. Se una di quelle letture
 * restasse ancorata al vecchio mondo, il difetto non sarebbe «la rail non
 * c'è»: sarebbe un FAB che finisce sotto il pollice a metà schermo, o una pagina
 * che lascia ottanta pixel di vuoto in fondo per una barra che non esiste più.
 *
 * Le prove misurano quattro cose, e la quarta è quella che di solito manca:
 *
 *  1. la forma (colonna larga 80dp, alta quanto la finestra, agganciata a
 *     sinistra; voci impilate; indicatore 56×32 come vuole M3);
 *  2. il POSTO che la pagina le lascia (`.shell-nav`, cioè `--nav-start`);
 *  3. il ritorno: sotto i 600dp, e su iOS, e con la finestra bassa (un telefono
 *     in orizzontale), la barra è quella di sempre;
 *  4. la board in largo: la griglia prende un tetto di lettura e si centra nello
 *     spazio che resta, invece di allungarsi quanto lo schermo.
 */
const DEV = 'dev=rootkind-dev-2026'

/** La skin va attesa: `?platform=` si applica al mount del provider (lezione M9). */
const SKIN = (page: import('@playwright/test').Page, piattaforma: 'android' | 'ios' | 'desktop') =>
  page.waitForFunction(
    (p) => document.documentElement.getAttribute('data-platform') === p,
    piattaforma,
    { timeout: 20_000 },
  )

const nav = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Navigazione principale' })

const shell = (page: import('@playwright/test').Page) => page.locator('.shell-nav').first()

function riquadro(locator: import('@playwright/test').Locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  })
}

test.describe('M12f — la rail: una colonna a sinistra sopra i 600dp', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(180_000)

  test('la barra diventa una colonna, e la pagina le lascia il posto', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.setViewportSize({ width: 900, height: 700 })
    await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}&platform=android`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'android')

    // 1. LA FORMA. Larghezza 80 (la misura della rail di Material), agganciata
    //    in alto a sinistra e alta quanto la FINESTRA — non quanto la barra:
    //    è questa differenza che dice «colonna» invece di «fascia».
    const barra = nav(page)
    await expect(barra).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(async () => (await riquadro(barra)).w, { message: 'la larghezza della rail' })
      .toBe(80)
    const r = await riquadro(barra)
    expect(r.x, 'agganciata al bordo sinistro').toBe(0)
    expect(r.y, 'dall’alto').toBe(0)
    expect(r.h, 'alta quanto la finestra, non quanto la barra').toBeGreaterThan(690)

    // Le cinque voci sono IMPILATE, e ognuna è larga quanto la colonna (l'area
    // di tocco della rail è tutta la fascia, non l'icona).
    const voci = barra.locator('a.nav-item')
    await expect(voci).toHaveCount(5)
    const prima = await riquadro(voci.nth(0))
    const seconda = await riquadro(voci.nth(1))
    expect(seconda.y, 'in colonna: la seconda voce sta SOTTO la prima').toBeGreaterThan(prima.y + 20)
    expect(seconda.x, 'allineate: stessi x').toBe(prima.x)
    // La voce occupa TUTTO il lato interno della colonna: l'80 della rail meno
    // il filo di separazione (1px), che è della superficie e non della voce.
    const superficie = await riquadro(barra.locator('.nav-bar'))
    expect(superficie.w, 'la superficie è la colonna intera').toBe(80)
    expect(prima.w, 'la voce occupa la colonna').toBe(superficie.w - 1)
    // Le etichette restano visibili E INTERE: la rail di M3 non le nasconde, e
    // una voce che finisce con i puntini («Impostaz…») sarebbe il ritorno del
    // difetto che M2 aveva corretto in barra. La misura è in px di testo, non a
    // occhio: `scrollWidth` è quanto chiede il testo, `clientWidth` quanto ne ha.
    await expect(voci.nth(2)).toContainText('Turni')
    const troncate = await voci.evaluateAll((links) =>
      links
        .map((a) => a.querySelector('span:last-child') as HTMLElement | null)
        .filter((s): s is HTMLElement => !!s)
        .filter((s) => s.scrollWidth > s.clientWidth + 1)
        .map((s) => s.textContent ?? ''),
    )
    expect(troncate, 'nessuna etichetta tagliata nella colonna').toEqual([])

    // L'indicatore della voce attiva prende la misura della rail: 56×32, non la
    // pillola 64×32 della barra in basso.
    const pillola = barra.locator('a[aria-current="page"] .nav-indicator')
    const p = await riquadro(pillola)
    expect([p.w, p.h], 'indicatore della rail (M3: 56×32)').toEqual([56, 32])

    // 2. IL POSTO. La pagina comincia dove finisce la colonna, e in fondo non
    //    lascia più niente per una navigazione che non c'è (l'area sicura resta:
    //    la barra gesti di Android è comunque lì).
    const contenitore = shell(page)
    expect(await contenitore.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('80px')
    expect(await contenitore.evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('0px')
    const pagina = await riquadro(page.locator('[data-slot="pagina"]'))
    expect(pagina.x, 'niente contenuto sotto la colonna').toBeGreaterThanOrEqual(80)

    // 3. GLI OFFSET. Il comando flottante e «torna su» leggevano `--nav-edge`:
    //    ora quel token è solo l'area sicura, e il LATO lo dice `--nav-start`.
    await expect
      .poll(async () =>
        page.locator('.nav-fab-layer').evaluate((el) => getComputedStyle(el).left),
      )
      .toBe('80px')
  })

  test('la board in largo prende un tetto di lettura e si centra', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}&platform=android`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'android')

    const board = page.locator('[role="region"][aria-label^="Board di sala"]')
    await expect(board).toBeVisible({ timeout: 20_000 })
    await expect
      .poll(async () => (await riquadro(board)).w, { message: 'il tetto della board (56rem)' })
      .toBe(896)
    // …e centrata nello spazio che RESTA, cioè 1200 - 80 di colonna = 1120.
    const b = await riquadro(board)
    expect(b.x, 'centrata nell’area a destra della rail').toBe(80 + Math.round((1120 - 896) / 2))

    // La toolbar smette di andare a capo: con tutto quello spazio «SAB 12…» e i
    // tre turni stanno su una riga.
    const toolbar = page.locator('.board-toolbar')
    expect(await toolbar.evaluate((el) => getComputedStyle(el).flexWrap)).toBe('nowrap')
  })

  test('sotto i 600dp la navigazione resta in basso, e la pagina non si sposta', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.setViewportSize({ width: 500, height: 700 })
    await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}&platform=android`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'android')

    const barra = nav(page)
    await expect(barra).toBeVisible({ timeout: 20_000 })
    const r = await riquadro(barra)
    expect(r.w, 'tutta la larghezza').toBe(500)
    expect(r.h, 'l’altezza della navigation bar di M3').toBe(80)
    expect(r.y + r.h, 'appoggiata al bordo inferiore').toBe(700)

    const contenitore = shell(page)
    expect(await contenitore.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('0px')
    expect(await contenitore.evaluate((el) => getComputedStyle(el).paddingBottom)).toBe('80px')

    // E la board torna a usare tutta la finestra: il tetto è della rail, non una
    // scelta globale.
    const board = await riquadro(page.locator('[role="region"][aria-label^="Board di sala"]'))
    expect(board.w, 'nessun tetto sotto la soglia').toBe(500)
  })

  test('un telefono in orizzontale NON prende la rail: è largo ma è basso', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    // 900dp di larghezza, 412 di altezza: la classe di larghezza direbbe
    // «expanded», ma una colonna qui ruberebbe 80dp alla board, che in
    // orizzontale è la vista che conta (M6 le ha dato le safe area laterali per
    // questo). Material stessa avverte di guardare l'altezza.
    await page.setViewportSize({ width: 900, height: 412 })
    await page.goto(`${E2E_BASE_URL}/turnisala?${DEV}&platform=android`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'android')

    const barra = nav(page)
    await expect(barra).toBeVisible({ timeout: 20_000 })
    const r = await riquadro(barra)
    expect(r.h, 'barra, non colonna').toBe(80)
    expect(r.y + r.h, 'in basso').toBe(412)
    expect(await shell(page).evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('0px')
  })

  test('e dove la rail non esiste — iOS e desktop — non si muove niente', async ({ page }) => {
    // Questa prova non ha bisogno di una sessione di dipendente: quello che
    // misura è la geometria della navigazione, e vale anche da autenticato con
    // lo storageState del progetto.
    await page.setViewportSize({ width: 900, height: 700 })
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}&platform=ios`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'ios')

    const barra = nav(page)
    await expect(barra).toBeVisible({ timeout: 20_000 })
    const ios = await riquadro(barra)
    expect(ios.h, 'iOS: la tab bar',).toBe(49)
    expect(ios.y + ios.h, 'appoggiata in basso').toBe(700)
    expect(await shell(page).evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('0px')

    // Il desktop è quello di sempre: barra alta 64, in basso, e la pagina senza
    // riserve laterali. `platform=desktop` e non l'assenza del parametro: nel
    // progetto `android` lo User-Agent del server è Android, quindi senza
    // override questa metà della prova misurerebbe la rail (già successo: 700).
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}&platform=desktop`, { waitUntil: 'domcontentloaded' })
    await SKIN(page, 'desktop')
    await expect(barra).toBeVisible({ timeout: 20_000 })
    const desktop = await riquadro(barra)
    expect(desktop.h, 'desktop: i 64px di sempre').toBe(64)
    expect(desktop.y + desktop.h).toBe(700)
    expect(await shell(page).evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('0px')
  })
})
