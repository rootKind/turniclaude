import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'

/**
 * M9 — LA SONDA DELLA FORMA EXPRESSIVE (22/09/2026).
 *
 * La deformazione e la glow sono MOVIMENTI: una spec può dire «gli attributi
 * ci sono», ma il giudizio se il moto sia bello lo fa l'occhio — è la ragione
 * per cui la sonda esiste (`/admin/movimento`, M7). Questa prova controlla che
 * la sonda DICA LA VERITÀ: il controllo expressivo porta gli attributi che il
 * CSS legge, la glow parte alla pressione e su iOS niente tocca i controlli.
 *
 * La skin la si prova con l'override di QA (`?platform=`): il progetto
 * `chromium` gira in skin desktop, dove le regole expressive non esistono (il
 * progetto le guarda, la skin le indossa).
 */
const DEV = 'dev=rootkind-dev-2026'

/**
 * L'override `?platform=` si indossa al mount del provider: leggere i token o
 * cliccare subito dopo `domcontentloaded` significa agire sulla skin desktop.
 * Si aspetta l'attributo su <html> prima di qualunque azione.
 */
const SKIN = (page: import('@playwright/test').Page, piattaforma: 'android' | 'ios') =>
  page.waitForFunction(
    (p) => document.documentElement.getAttribute('data-platform') === p,
    piattaforma,
    { timeout: 20_000 },
  )

test.describe('La sonda della forma expressive (M9)', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(120_000)

  test('il controllo espressivo deforma e la glow parte alla pressione (skin Android)', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/admin/movimento?${DEV}&platform=android`, {
      waitUntil: 'domcontentloaded',
    })
    await SKIN(page, 'android')

    // Il selettore è l'ATTRIBUTO, non il nome: la sonda ha due «Conferma»
    // (la sezione M7 mostra il controllo normale, questa il controllo
    // espressivo) e solo il secondo porta data-gl.
    const conferma = page.locator('button[data-gl]', { hasText: 'Conferma' }).first()
    await expect(conferma).toBeVisible({ timeout: 20_000 })

    // A riposo nessuna onda: il ::before non anima.
    const onda = () => conferma.evaluate((el) => getComputedStyle(el, '::before').animationName)
    expect(await onda(), 'a riposo nessuna onda').toBe('none')

    // Alla pressione: l'onda expressive parte, e il controllo si DEFORMA
    // (scala 0.85 → matrix). Entrambe le regole esistono solo sotto
    // `[data-platform='android']`: è la skin che le indossa, non il progetto.
    await conferma.hover()
    await page.mouse.down()
    await expect
      .poll(onda, { timeout: 5_000, message: 'la glow expressive parte alla pressione' })
      .toBe('glow-m3-expressive')
    // La deformazione è una TRANSIZIONE (120ms expressive): si aspetta il
    // valore DI FONDO, non un fotogramma a metà strada (0.953 era la scala
    // presa mentre ancora scendeva). Lo stesso poll serve alla iOS, dove la
    // LETTURA secca poteva beccare la ritrazione ancora in corso.
    await expect
      .poll(
        () => conferma.evaluate((el) => getComputedStyle(el).transform),
        { timeout: 2_000, message: 'la pressione deforma il controllo (scala 0.85)' },
      )
      .toBe('matrix(0.85, 0, 0, 0.85, 0, 0)')
    await page.mouse.up()
  })

  test('con la skin iOS la stessa sonda non ha nessuna regola expressive', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/admin/movimento?${DEV}&platform=ios`, {
      waitUntil: 'domcontentloaded',
    })
    await SKIN(page, 'ios')

    const conferma = page.locator('button[data-gl]', { hasText: 'Conferma' }).first()
    await expect(conferma).toBeVisible({ timeout: 20_000 })
    // L'attributo c'è anche su iOS (il dito non sa niente di skin), ma nessuna
    // regola lo legge: la deformazione non è «rotta», non esiste — è la skin
    // che il piano decide.
    await expect(conferma).toHaveAttribute('data-gl', 'true')

    await conferma.hover()
    await page.mouse.down()
    await page.waitForTimeout(250)
    const onda = await conferma.evaluate((el) => getComputedStyle(el, '::before').animationName)
    expect(onda, 'su iOS nessuna glow').toBe('none')
    // La deformazione della GLOW (0.85) non esiste su iOS; la ritrazione a
    // 0.96 sì, ed è M10 (il controllo di vetro che si restringe sotto il
    // dito) — la prova dice che la SKIN expressive non tocca i controlli, non
    // che il controllo è morto.
    await expect
      .poll(
        () => conferma.evaluate((el) => getComputedStyle(el).transform),
        { timeout: 2_000, message: 'su iOS la scala expressive (0.85) non esiste' },
      )
      .toBe('matrix(0.96, 0, 0, 0.96, 0, 0)')
    await page.mouse.up()
  })
})
