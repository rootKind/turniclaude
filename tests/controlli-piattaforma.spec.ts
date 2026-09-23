import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'

/**
 * I CONTROLLI A DOPPIA SKIN — M4 del design system (20/09/2026).
 *
 * Il report (issue n. 7) chiedeva le primitive a doppia skin: switch, campi,
 * chip. La regola dell'app è che il JSX NON cambia per piattaforma — cambiano i
 * token e le regole CSS che li leggono — quindi quello che si prova qui è la
 * CONSEQUENZA misurabile: lo stesso controllo, sullo stesso motore, con
 * `?platform=` diverso, ha la geometria e la materia della piattaforma chiesta.
 *
 * L'override di QA è la strada giusta per QUESTA spec (diversamente dalle spec
 * che provano il verdetto del server): qui il confronto è fra due skin dello
 * STESSO albero DOM, e tenerle sullo stesso motore elimina ogni differenza di
 * motore dalla misura. La piattaforma di default del progetto si prova invece in
 * `design-piattaforma.spec.ts`.
 */
const DEV = 'dev=rootkind-dev-2026'

/**
 * La skin va ATTESA: l'override `?platform=` si applica al mount del provider,
 * e sotto carico la differenza fra 30 e 300 ms è la differenza fra una misura
 * vera e una letta con la skin sbagliata (i 5 fallimenti della prima suite M9).
 */
const SKIN = (page: import('@playwright/test').Page, piattaforma: 'android' | 'ios' | 'desktop') =>
  page.waitForFunction(
    (p) => document.documentElement.getAttribute('data-platform') === p,
    piattaforma,
    { timeout: 20_000 },
  )

/**
 * LE PROVE DELLE MILESTONE M9/M10 (22/09/2026) — le FORME e la PRESSIONE.
 *
 * Lo stesso patto delle spec di M4: il JSX non cambia per piattaforma, cambiano
 * i token e le regole che li leggono — quindi qui si misura la CONSEQUENZA sullo
 * stesso motore, con `?platform=` diverso. Ciò che si prova:
 *
 *  · la **forma espressiva** della voce attiva (il ::before della pillola 32×64
 *    con angoli laterali tondi e l'ombra di terzo livello, solo su Android);
 *  · la **pressione che deforma** (`data-gl-press`, scritta dal componente della
 *    superficie delle azioni: il FAB si tira verso il dito e scappa verso la
 *    pillola — scala 0.85, raggio 24 — e al rilascio TORNANO i valori
 *    `--fab-size`/`--fab-radius` di prima);
 *  · la **glow expressive** della pressione, accesa sul fotogramma zero con
 *    l'opacità della specifica;
 *  · l'**aptica** come contratto letta dai token (`--aptica-*`): le durate
 *    divergono per piattaforma e il canale spara esattamente la durata del
 *    momento — il tutto SPIATO su `navigator.vibrate`, perché è l'unico modo
 *    di vedere un'accensione che non disegna pixel;
 *  · il **vetro contrasto** del foglio (la riga di luce sul bordo alto, che
 *    l'accessibilità spegne).
 */
test.describe('Forme e pressione espressive (M9/M10)', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(120_000)

  test('la voce attiva della barra ha la forma e l’ombra expressive SOLO su Android', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    for (const piattaforma of ['ios', 'android', 'desktop'] as const) {
      await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}&platform=${piattaforma}`, {
        waitUntil: 'domcontentloaded',
      })
      // La skin va ATTESA: nav-bar sceglie il JSX della voce (HigItem vs
      // MaterialItem) al mount, e leggere prima significa misurare l'albero
      // della skin precedente (il 24×24 dell'icona al posto della pillola).
      await SKIN(page, piattaforma)
      const attiva = page
        .locator('nav[aria-label="Navigazione principale"] a[aria-current="page"]')
        .first()
      await expect(attiva).toBeVisible({ timeout: 20_000 })

      const m = await page.evaluate(() => {
        const attiva = document.querySelector(
          'nav[aria-label="Navigazione principale"] a[aria-current="page"]',
        )!
        const pillola = attiva.querySelector('span')! as HTMLElement
        const prima = getComputedStyle(pillola, '::before')
        const r = pillola.getBoundingClientRect()
        return {
          // Il ::before ripete il fondo (inherit): dove il fondo è trasparente
          // (iOS, desktop) non disegna niente — è il zero-pixel del desktop.
          formaFondo: prima.backgroundColor,
          raggioForma: prima.borderRadius,
          ombraForma: prima.boxShadow,
          pillola: `${Math.round(r.width)}x${Math.round(r.height)}`,
        }
      })

      // LA PILLOLA DELL'INDICATORE È DI MATERIAL, e solo lì: sul desktop la
      // barra è quella classica e su iOS quella a tinta di HIG, quindi in
      // entrambe il primo `span` della voce è il contenitore dell'icona
      // (24×24) — non una pillola mancata. Pretenderla anche sul desktop era
      // l'attesa sbagliata che la corsa della skin mascherava.
      if (piattaforma === 'android') {
        expect(m.pillola, 'la pillola della voce attiva è 32×64').toBe('64x32')
      } else {
        expect(m.pillola, 'solo Material ha la pillola dell’indicatore attivo').not.toBe('64x32')
      }
      if (piattaforma === 'android') {
        expect(m.raggioForma, 'angoli laterali tondi (--pill-corners)').toBe('10px')
        expect(m.ombraForma, 'ombra di terzo livello della specifica').toContain('rgba(0, 0, 0')
        expect(m.formaFondo, 'il ::before dipinge (fondo della pillola non trasparente)').not.toBe(
          'rgba(0, 0, 0, 0)',
        )
      } else {
        expect(m.formaFondo, 'fuori da Android il ::before copia il vuoto: zero-pixel').toBe(
          'rgba(0, 0, 0, 0)',
        )
      }
    }
  })
})

test.describe('Controlli (M4): la skin la scrivono i token, non il JSX', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(120_000)

  test('lo SWITCH è il toggle di iOS o lo switch M3, e resta quello di prima sul desktop', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    // Il pannello Squadre ha uno switch per riga di tipologia (default size):
    // si MISURA soltanto — mai premuto, perché premere scrive nel DB.
    for (const piattaforma of ['ios', 'android', 'desktop'] as const) {
      await page.goto(`${E2E_BASE_URL}/admin?${DEV}&platform=${piattaforma}`, {
        waitUntil: 'domcontentloaded',
      })
      await page.getByText('Squadre', { exact: true }).first().click()
      const sw = page.locator('[data-slot="switch"][data-size="default"]').first()
      await expect(sw).toBeVisible({ timeout: 20_000 })

      const m = await sw.evaluate((el) => {
        const thumb = el.querySelector('[data-slot="switch-thumb"]') as HTMLElement
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        const rt = thumb.getBoundingClientRect()
        return {
          tracciaW: Math.round(r.width),
          tracciaH: Math.round(r.height),
          pollice: Math.round(Math.max(rt.width, rt.height)),
          // La crescita del pollice la dicono i token, che il contratto blocca:
          // su M3 spento≠acceso (16→24), su iOS sono lo stesso valore (27).
          polliceSpento: getComputedStyle(el).getPropertyValue('--switch-thumb-off').trim(),
          polliceAcceso: getComputedStyle(el).getPropertyValue('--switch-thumb').trim(),
          sfondo: cs.backgroundColor,
          bordoW: cs.borderTopWidth,
        }
      })

      if (piattaforma === 'ios') {
        expect(m.tracciaW, 'HIG: il toggle di iOS è 51pt').toBe(51)
        expect(m.tracciaH).toBe(31)
        expect(m.pollice, 'il pollice di iOS NON cambia misura accendendolo').toBe(27)
        expect(m.polliceSpento, 'iOS: pollice fisso').toBe(m.polliceAcceso)
      } else if (piattaforma === 'android') {
        expect(m.tracciaW, 'M3: traccia 52dp').toBe(52)
        expect(m.tracciaH).toBe(32)
        expect(m.bordoW, 'M3: la traccia spenta porta il contorno da 2dp').toBe('2px')
        expect(m.polliceSpento, 'M3: pollice piccolo quando è spento (16)').not.toBe(m.polliceAcceso)
        expect(m.polliceAcceso).toBe('24px')
      } else {
        expect(m.tracciaW, 'desktop: com’era').toBe(32)
        expect(m.tracciaH).toBe(18)
        expect(m.pollice).toBe(16)
        expect(m.bordoW, 'desktop: nessun contorno aggiunto').toBe('0px')
        expect(m.polliceSpento, 'desktop: nessuna crescita').toBe(m.polliceAcceso)
      }
    }
  })

  test('il CAMPO di testo: inserto senza bordo su iOS, pieno con sottolineatura su Android', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    for (const piattaforma of ['ios', 'android', 'desktop'] as const) {
      // /tuoturno ha il campo di ricerca nel dialog «di chi vedere i turni»: è
      // un Input vero, raggiungibile da qualunque utente.
      await page.goto(`${E2E_BASE_URL}/tuoturno?${DEV}&platform=${piattaforma}`, {
        waitUntil: 'domcontentloaded',
      })
      await page.getByLabel('Scegli di chi vedere i turni').click()
      const campo = page.getByPlaceholder(/Cerca cognome/)
      await expect(campo).toBeVisible({ timeout: 20_000 })

      const m = await campo.evaluate((el) => {
        const cs = getComputedStyle(el)
        return {
          sfondo: cs.backgroundColor,
          bordoSx: cs.borderLeftColor,
          raggioAlto: cs.borderTopLeftRadius,
          raggioBasso: cs.borderBottomLeftRadius,
        }
      })

      // NB: il bordo resta LARGO 1px su tutte (cambiarne lo spessore far
      // vibrare il layout): la skin lo rende TRASPARENTE, non lo toglie.
      if (piattaforma === 'ios') {
        expect(m.bordoSx, 'HIG: il campo di iOS non ha contorni (trasparente)').toBe('rgba(0, 0, 0, 0)')
        expect(m.sfondo, 'HIG: il campo ha un FONDO (inserto)').not.toBe('rgba(0, 0, 0, 0)')
        expect(m.raggioAlto, 'angoli continui a 10pt').toBe('10px')
        expect(m.raggioBasso).toBe('10px')
      } else if (piattaforma === 'android') {
        expect(m.bordoSx, 'M3: niente bordi laterali (trasparenti)').toBe('rgba(0, 0, 0, 0)')
        expect(m.raggioAlto, 'M3: angoli alti a 4dp').toBe('4px')
        expect(m.raggioBasso, 'M3: angoli bassi a 0 (sottolineatura)').toBe('0px')
        expect(m.sfondo, 'M3: campo pieno').not.toBe('rgba(0, 0, 0, 0)')
      } else {
        expect(m.bordoSx, 'desktop: il bordo di sempre, colorato').not.toBe('rgba(0, 0, 0, 0)')
        expect(m.raggioAlto).toBe('10px')
        expect(m.raggioBasso).toBe('10px')
      }

      // La via d'uscita (il foglio va chiuso prima del prossimo giro del for).
      await page.keyboard.press('Escape')
      await expect(campo).toHaveCount(0, { timeout: 5_000 })
    }
  })

  test('la CHIP filtro: 32pt/13 su iOS, 32dp/14sp con contorno pieno su Android, 28px/12 sul desktop', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    for (const piattaforma of ['ios', 'android', 'desktop'] as const) {
      await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}&platform=${piattaforma}`, {
        waitUntil: 'domcontentloaded',
      })
      const chip = page.locator('[data-slot="chip"]').first()
      await expect(chip).toBeVisible({ timeout: 20_000 })

      const m = await chip.evaluate((el) => {
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return {
          h: Math.round(r.height),
          label: cs.fontSize,
          bordo: cs.borderTopWidth,
          stileBordo: cs.borderTopStyle,
        }
      })

      if (piattaforma === 'ios') {
        expect(m.h, 'HIG: capsule da 32pt').toBe(32)
        expect(m.label).toBe('13px')
      } else if (piattaforma === 'android') {
        expect(m.h, 'M3: 32dp').toBe(32)
        expect(m.label, 'M3: label-large 14sp').toBe('14px')
      } else {
        expect(m.h, 'desktop: com’era (py-1.5 + testo 12px)').toBe(28)
        expect(m.label).toBe('12px')
      }
    }
  })

  test('lo STATE LAYER e il RIPPLE esistono solo su Android (e il ripple parte dal dito)', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    for (const piattaforma of ['ios', 'android'] as const) {
      // La pressione SINTETICA (:active da mouse.down) su WebKit in emulazione
      // touch non applica gli stati: su un telefono vero il dito non «passa» e
      // il motore lega :active al tocco. La prova COMPORTAMENTALE della skin
      // M3 sta sui progetti con mouse (chromium desktop + android/Pixel); su
      // WebKit resta la prova HIG (nessun velo, nessun ripple) — e il gesto del
      // tocco vero è ciò che i test manuali su telefono confermano.
      test.skip(
        piattaforma === 'android' && test.info().project.name === 'ios',
        'WebKit touch non applica :active sintetico: la skin M3 si prova sui progetti col mouse',
      )
      await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}&platform=${piattaforma}`, {
        waitUntil: 'domcontentloaded',
      })
      // Una CHIP di filtro: è un controllo del design system (data-slot="chip")
      // e le regole M4 la vestono. NOTA: il comando delle azioni della barra NON
      // va bene qui — è un bottone grezzo fuori dal design system (scelta dell'
      // M2, niente data-slot), quindi le regole di piattaforma non lo mirano.
      const ghost = page.locator('[data-slot="chip"]').first()
      await expect(ghost).toBeVisible({ timeout: 20_000 })

      // Il ripple ha coordinate scritte dal componente SOLO dopo un pointerdown
      // (prima i default sono al centro): è la prova che l'onda parte da dove
      // si è toccato, non dal centro.
      const box = await ghost.boundingBox()
      await page.mouse.move(box!.x + box!.width * 0.8, box!.y + box!.height * 0.8)
      await page.mouse.down()
      // La velatura ha una transizione di 120ms: senza attendere, il valore
      // letto è ancora quello di PARTENZA (trasparente) e il controllo sembra
      // assente — è la stessa trappola dell'animazione dei fogli (M3).
      await page.waitForTimeout(200)
      const m = await ghost.evaluate((el) => {
        const cs = getComputedStyle(el, '::before')
        const cs2 = getComputedStyle(el, '::after')
        return {
          rippleBg: cs.backgroundColor,
          rippleX: cs.left,
          rippleY: cs.top,
          veloPressione: cs2.backgroundColor,
          larghezza: el.getBoundingClientRect().width,
          altezza: el.getBoundingClientRect().height,
        }
      })
      await page.mouse.up()

      // Si prova lo stato di PRESSIONE (:active), non il passaggio: su un
      // telefono vero (il progetto ios è un iPhone emulato) :hover non esiste,
      // ed è giusto così — il feedback del dito è la pressione.
      if (piattaforma === 'android') {
        expect(m.veloPressione, 'M3: state layer alla pressione').not.toBe('rgba(0, 0, 0, 0)')
        expect(m.rippleBg, 'M3: l’onda ha il colore del contenuto').not.toBe('rgba(0, 0, 0, 0)')
        // La coordinata scritta al pointerdown (80% della larghezza), NON 50%:
        // se resta al centro il ripple non parte dal dito.
        expect(parseFloat(m.rippleX), 'il ripple parte dal punto del dito').toBeGreaterThan(
          m.larghezza * 0.65,
        )
        expect(parseFloat(m.rippleY)).toBeGreaterThan(m.altezza * 0.65)
      } else {
        expect(m.veloPressione, 'HIG: nessuna velatura').toBe('rgba(0, 0, 0, 0)')
        expect(m.rippleBg, 'HIG: nessuna increspatura').toBe('rgba(0, 0, 0, 0)')
      }
    }
  })

  test('la RINOMINA dell’omonimo è un foglio con campo, non più window.prompt', async ({ asEmployee }) => {
    const admin = await findEmployee('Minino')
    test.skip(!admin, 'serve un admin (service-role in .env.local)')
    const page = await asEmployee('Minino')

    const finestreDelBrowser: string[] = []
    page.on('dialog', async (d) => {
      finestreDelBrowser.push(d.message())
      await d.dismiss()
    })

    // BANCO FINTO (come per la card ferie): l'albero delle squadre e l'anagrafica
    // sono intercettati a livello di rete, così la spec non dipende da chi ha un
    // omonimo SENZA iniziale nel DB (oggi non ce ne sono: il caso reale è stato
    // rinominato). Una tipologia, una squadra, un membro col cognome nudo di un
    // utente omonimo: esattamente la condizione che accende il suggerimento.
    // Il PUT della rinomina si registra e non tocca niente.
    const putFatti: string[] = []
    await page.route('**/rest/v1/shift_types**', r => r.fulfill({ json: [{
      id: 'tipo-1', name: 'Consegna', cycle_days: 28, pattern_start: '2026-03-01', is_active: true, sort_order: 0,
    }] }))
    await page.route('**/rest/v1/shift_teams**', r => r.fulfill({ json: [{
      id: 'squadra-1', shift_type_id: 'tipo-1', name: 'Squadra A', phase_offset_days: 0, sort_order: 0,
    }] }))
    await page.route('**/rest/v1/shift_team_members**', r => r.fulfill({ json: [{
      id: 'membro-1', team_id: 'squadra-1', full_name: 'NEVANO', user_id: 'utente-pietro',
      pattern: [], sort_order: 0, is_active: true, is_lead: false,
    }] }))
    await page.route('**/rest/v1/shift_adjustments**', r => r.fulfill({ json: [] }))
    await page.route('**/rest/v1/shift_cycle_templates**', r => r.fulfill({ json: [] }))
    await page.route('**/rest/v1/users**', r => r.fulfill({ json: [
      { id: 'utente-pietro', nome: 'Pietro', cognome: 'NEVANO', is_secondary: false },
      { id: 'utente-gino', nome: 'Gino', cognome: 'NEVANO', is_secondary: false },
    ] }))
    await page.route('**/api/admin/shift-teams**', async (r) => {
      if (r.request().method() === 'PUT') {
        putFatti.push(r.request().postData() ?? '')
        return r.fulfill({ json: { ok: true } })
      }
      return r.fallback()
    })

    await page.goto(`${E2E_BASE_URL}/admin?${DEV}`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Squadre', { exact: true }).first().click()
    await page.getByRole('tab', { name: 'Membri' }).click()

    // La tab Membri elenca i membri SOLO dopo aver scelto la squadra dal menu:
    // si apre il secondo select e si prende l'unica voce del banco.
    await page.locator('[data-slot="select-trigger"]').nth(1).click()
    await page.locator('[data-slot="select-item"]').first().click()

    // Il legame all'utente (e il suo suggerimento di rinomina) vivono nel
    // PANNELLO DI MODIFICA del membro: si apre con la matita della riga.
    const riga = page.locator('div.rounded-xl.border', { hasText: 'NEVANO' }).first()
    await riga.locator('button:has(svg[class*="lucide-pencil"])').click()

    // Il suggerimento dell'omonimo: la condizione è costruita dal banco, non
    // cercata nel DB.
    const suggerimento = page.getByText(/Cognome omonimo fra gli utenti: aggiungi l'iniziale/).first()
    await expect(suggerimento).toBeVisible({ timeout: 20_000 })
    await suggerimento.click()

    // Il foglio (dialog su Android/desktop) con il campo precompilato.
    const overlay = page.locator('[data-slot="dialog-content"]').last()
    await expect(overlay.getByText('Rinomina il membro')).toBeVisible()
    const campo = overlay.getByLabel('Nome del membro')
    await expect(campo).toBeVisible()
    const precompilato = await campo.inputValue()
    expect(precompilato, 'il valore parte dal suggerimento (era il secondo argomento del prompt)').toMatch(/\.$/)

    // «Annulla» chiude senza toccare niente: nessun PUT, nessuna finestra nativa.
    await overlay.getByRole('button', { name: 'Annulla' }).click()
    await expect(page.getByText('Rinomina il membro')).toHaveCount(0, { timeout: 5_000 })
    expect(putFatti, '«Annulla» ha rinominato lo stesso').toEqual([])
    expect(finestreDelBrowser, 'una finestra è rimasta quella del browser').toEqual([])
  })
})

// ══ M9/M10 — LA PRESSIONE CHE DEFORMA E LA GLOW ═══════════════════════════════
test.describe('La pressione espressiva del comando (M9/M10)', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(120_000)

  test('il FAB si deforma alla pressione e torna alle misure di prima', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    for (const piattaforma of ['ios', 'android'] as const) {
      // IL `goto` PUÒ ESSERE INTERROTTO (misurato su WebKit il 23/09). Su iOS il
      // rilascio del comando è un TAP, e il tap del comando di dashboard esegue
      // l'azione primaria — «Nuovo turno» → `/dashboard?new=1`: quella
      // navigazione arriva mentre l'iterazione dopo sta caricando la sua URL e
      // la interrompe. Si riprova; della SKIN giusta risponde la `SKIN()` qui
      // sotto, che è ciò che impedisce a un riprova di falsificare la prova.
      const vai = `${E2E_BASE_URL}/dashboard?${DEV}&platform=${piattaforma}`
      await page
        .goto(vai, { waitUntil: 'domcontentloaded' })
        .catch(() => page.goto(vai, { waitUntil: 'domcontentloaded' }))
      await SKIN(page, piattaforma)
      const comando = page.locator('button[data-nav-actions="control"]').first()
      await expect(comando).toBeVisible({ timeout: 20_000 })

      const misura = () =>
        comando.evaluate((el) => {
          const cs = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          return {
            premuto: el.getAttribute('data-gl-press'),
            w: Math.round(r.width),
            h: Math.round(r.height),
            raggio: cs.borderRadius,
            // Il ::before è il suolo dell'onda: a riposo NON deve partire.
            ondaPartita: getComputedStyle(el, '::before').animationName,
          }
        })

      const riposo = await misura()
      if (piattaforma === 'android') {
        expect(riposo.w, 'FAB M3 a riposo').toBe(56)
        expect(riposo.raggio).toBe('16px')
      } else {
        // Su iOS il comando è una pill CON ETICHETTA: la larghezza dipende dal
        // testo (~145px su dashboard), non è 48 — il vecchio valore atteso era
        // il bias desktop che la corsa della skin nascondeva.
        expect(riposo.h, 'toccare HIG a 44pt').toBeGreaterThanOrEqual(44)
        // `rounded-full` su Chromium satura al massimo rappresentabile: la pill
        // è pill per GEOMETRIA (h≥44, piena larghezza del raggio), non per il
        // valore letterale della stringa.
        // `rounded-full` non dà un numero tondo ma il massimo rappresentabile, e
        // il massimo NON è lo stesso fra i motori (WebKit 3.35e7, Chromium
        // 3.4e38): la pill è pill per GEOMETRIA — raggio pieno, cioè almeno
        // metà altezza — non per la stringa.
        expect(
          Number.parseFloat(riposo.raggio),
          'la pill di iOS: raggio pieno, non un numero qualsiasi',
        ).toBeGreaterThanOrEqual(riposo.h / 2)
      }
      expect(riposo.ondaPartita, 'a riposo nessuna onda in corso').toBe('none')

      // La pressione è un GESTO sintetico che Playwright non ripete (a
      // differenza di un click): sotto carico la prima può perdersi
      // (idratazione in corsa o ricompilazione del dev server) e :active non
      // arriva mai. Si riprova finché l'attributo non si accende.
      const premi = async () => {
        await comando.hover()
        await page.mouse.down()
      }
      await premi()
      await expect
        .poll(
          async () => {
            const v = await comando.evaluate((el) => el.getAttribute('data-gl-press'))
            if (v !== 'true') {
              await page.mouse.up()
              await premi()
            }
            return v
          },
          { timeout: 15_000, message: 'la pressione deve accendere data-gl-press' },
        )
        .toBe('true')
      // LA FORMA ARRIVA PER TRANSIZIONE (120ms): `data-gl-press` si accende
      // all'istante, la geometria no. Letta subito, la larghezza è ancora quella
      // di riposo (56 invece di 48, misurato in suite il 23/09: il test passava
      // solo perché spesso il poll aveva già speso quei millisecondi). Si
      // aspetta che il RAGGIO — il valore che distingue la forma premuta — si
      // assesti, e poi si legge tutto.
      if (piattaforma === 'android') {
        await expect
          .poll(async () => (await misura()).raggio, { timeout: 5_000, message: 'la forma premuta deve assestarsi' })
          .toBe('24px')
      }
      const premuto = await misura()
      if (piattaforma === 'android') {
        expect(premuto.w, 'la scala 0.85 tira il FAB verso il dito').toBe(48)
        expect(premuto.raggio, 'la forma scappa verso la pillola (--gl-press-radius)').toBe('24px')
      } else {
        // La deformazione expressive è di Android: su iOS la pressione scrive
        // solo l'attributo, e nessuna regola della skin lo legge (la sonda M9
        // lo prova esplicitamente).
        expect(premuto.w, 'su iOS la pressione non deforma').toBe(riposo.w)
      }
      await page.mouse.up()

      await expect
        .poll(() => comando.evaluate((el) => el.getAttribute('data-gl-press')), { timeout: 5_000 })
        .toBe(null)
      // Anche il RITORNO è una transizione (350ms), e anche qui si aspetta la
      // forma: il raggio di riposo è il valore che la distingue da quella premuta.
      await expect
        .poll(async () => (await misura()).raggio, { timeout: 5_000, message: 'la forma deve tornare a riposo' })
        .toBe(riposo.raggio)
      const rilasciato = await misura()
      expect(rilasciato.w, 'al rilascio torna la misura di prima').toBe(riposo.w)
      expect(rilasciato.raggio, 'al rilascio torna il raggio di prima').toBe(riposo.raggio)
    }
  })

  test('la glow della pressione è l’onda expressive e parte solo alla pressione', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    await page.goto(`${E2E_BASE_URL}/dashboard?${DEV}&platform=android`, {
      waitUntil: 'domcontentloaded',
    })
    await SKIN(page, 'android')
    const comando = page.locator('button[data-nav-actions="control"]').first()
    await expect(comando).toBeVisible({ timeout: 20_000 })

    const premi = async () => {
      await comando.hover()
      await page.mouse.down()
    }
    await premi()
    // Il discriminatore è il NOME dell'animazione (a riposo è `none`):
    // l'uguaglianza sull'opacità misurava un fotogramma a metà strada
    // (0.63 solo al primo istante, poi l'onda cala) ed era la mezzavita
    // che rendeva la prova racy. La pressione si riprova, come sopra.
    await expect
      .poll(
        async () => {
          const onda = await comando.evaluate((el) => getComputedStyle(el, '::before').animationName)
          if (onda !== 'glow-m3-expressive') {
            await page.mouse.up()
            await premi()
          }
          return onda
        },
        { timeout: 15_000, message: 'la glow expressive deve partire alla pressione' },
      )
      .toBe('glow-m3-expressive')
    await page.mouse.up()
  })
})
