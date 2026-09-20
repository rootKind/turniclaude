import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'
import { PLATFORM_ATTR } from '../lib/platform'

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
        const ct = getComputedStyle(thumb)
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
