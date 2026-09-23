import { test, expect, E2E_BASE_URL, findEmployee, employeeLoginEnabled } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * M9 COMPLETA — LA SCALA, L'ATTESA, L'ENFASI, IL MENU, IL SEGMENTED, LA TOOLBAR
 * (23/09/2026).
 *
 * La prima metà di M9 (la pressione che deforma, la glow, l'aptica) è provata da
 * `espressivo-sonda.spec.ts` e da `controlli-piattaforma.spec.ts`. Questa spec
 * copre i sei pezzi che erano rimasti indietro, e ognuno lo fa con la stessa
 * domanda: **dove la specifica non vale, si vede?** Per ogni punto ci sono due
 * affermazioni — quella su Android (dove la forma esiste) e quella sulla skin che
 * NON deve muoversi (iOS o desktop), perché «non implementato» e «implementato
 * che però tocca anche l'altra piattaforma» sono due difetti diversi.
 *
 * LA SKIN si prova con l'override di QA (`?platform=`): il confronto è fra due
 * skin dello STESSO albero, quindi tenerle sullo stesso motore elimina il motore
 * dalla misura. L'attesa della skin (`SKIN`) non è un dettaglio: l'override si
 * applica al MOUNT del provider, e leggere prima significa misurare la skin
 * desktop (lezione di M8b).
 */
const DEV = 'dev=rootkind-dev-2026'

type Skin = 'android' | 'ios' | 'desktop'

const SKIN = (page: Page, piattaforma: Skin) =>
  page.waitForFunction(
    (p) => document.documentElement.getAttribute('data-platform') === p,
    piattaforma,
    { timeout: 20_000 },
  )

/**
 * NAVIGA E ASPETTA LA SKIN, POI IL MARCATORE.
 *
 * Due trappole del dev server, entrambe già pagate una volta e scritte in
 * `knowledge.md`: (1) il rilascio del comando di dashboard NAVIGA, e quella
 * navigazione arriva addosso al `goto` dopo; (2) la PRIMA richiesta a una pagina
 * appena modificata può ricevere il chunk VECCHIO (la ricompilazione parte con
 * la richiesta). Il secondo caso si riconosce dal marcatore che non arriva, e un
 * giro in più lo porta: costa un secondo e toglie un falso negativo — che è
 * esattamente il modo in cui, il 23/09, questa spec ha accusato un codice che
 * funzionava.
 */
const vai = async (page: Page, url: string, piattaforma: Skin, atteso: string) => {
  await page
    .goto(url, { waitUntil: 'domcontentloaded' })
    .catch(() => page.goto(url, { waitUntil: 'domcontentloaded' }))
  await SKIN(page, piattaforma)
  if (!(await page.locator(atteso).first().count())) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await SKIN(page, piattaforma)
  }
}

test.describe('M9 completa: scala, attesa, enfasi, menu, segmented, toolbar', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(120_000)

  test('la scala XS–XL: i due gradini PRIMARI crescono su Android, gli altri no', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    // Il gradino è legato al COMPONENTE (`data-size`), non a una classe ripetuta
    // in ogni pagina: i cinque bottoni della sonda rendono tutta la scala.
    const gradini = ['xs', 'sm', 'default', 'lg', 'xl'] as const
    const attesi: Record<Skin, number[]> = {
      android: [24, 28, 32, 48, 56],
      ios: [24, 28, 32, 36, 44],
      desktop: [24, 28, 32, 36, 44],
    }

    for (const piattaforma of ['android', 'ios', 'desktop'] as const) {
      await vai(
        page,
        `${E2E_BASE_URL}/admin/movimento?${DEV}&platform=${piattaforma}`,
        piattaforma,
        '[data-gradino="xs"]',
      )
      // La misura è una CONDIZIONE, non una lettura secca: se la richiesta ha
      // ricevuto il chunk vecchio, i cinque bottoni arrivano un attimo dopo
      // (la pagina si ricompila mentre la si guarda) — e un `-1` al posto di 24
      // è il modo in cui questa prova accuserebbe un codice che funziona.
      const altezze = () =>
        page.evaluate(
          (lista) =>
            lista.map((g) => {
              const el = document.querySelector(`[data-gradino="${g}"]`)
              return el ? Math.round(el.getBoundingClientRect().height) : -1
            }),
          gradini as unknown as string[],
        )
      await expect
        .poll(altezze, { timeout: 20_000, message: `i cinque gradini devono comparire (${piattaforma})` })
        .toEqual(attesi[piattaforma])
    }
  })

  test('il segno di attesa: sette forme su Android, un quadrato che gira altrove', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    for (const piattaforma of ['android', 'ios', 'desktop'] as const) {
      await vai(
        page,
        `${E2E_BASE_URL}/admin/movimento?${DEV}&platform=${piattaforma}`,
        piattaforma,
        '[data-slot="load-shape"]',
      )
      const m = await page
        .locator('[data-slot="load-shape"]')
        .first()
        .evaluate((el) => {
          const cs = getComputedStyle(el)
          return {
            // La larghezza COMPUTATA, non il rect: `getBoundingClientRect` di un
            // quadrato che RUOTA è più grande del lato (48 ruotati di 30° ne
            // misurano 54), e la rotazione non deve entrare nella misura.
            lato: Math.round(Number.parseFloat(cs.width)),
            animazioni: cs.animationName,
            // L'annuncio è dell'involucro: un segno che gira non dice niente a
            // chi non lo vede, e la pagina sta ASPETTANDO (è ciò che `status`
            // annuncia, senza rubare il fuoco come farebbe `alert`).
            ruolo: el.parentElement?.getAttribute('role'),
          }
        })
      expect(m.lato, `la misura del segno su ${piattaforma}`).toBe(piattaforma === 'android' ? 48 : 32)
      expect(m.animazioni, 'il segno gira sempre').toContain('load-shape-spin')
      expect(
        m.animazioni.includes('load-shape-morph'),
        'la forma cambia solo su Android (HIG non ha il segno a forme)',
      ).toBe(piattaforma === 'android')
      expect(m.ruolo, 'l attesa si annuncia').toBe('status')
    }
  })

  test('l enfasi del titolo: peso e tracking su Android, i valori di HIG altrove', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    // M3E non dà gerarchia cambiando la MISURA: alza il PESO e stringe un filo.
    // Il titolo grande è quello della testata (M8b), il compatto è quello della
    // top app bar — e sul desktop la testata non esiste, quindi non c'è nessun
    // titolo da enfatizzare (è la terza affermazione, non una riga in meno).
    for (const piattaforma of ['android', 'ios', 'desktop'] as const) {
      await vai(
        page,
        `${E2E_BASE_URL}/dashboard?${DEV}&platform=${piattaforma}`,
        piattaforma,
        '[data-slot="testata-titolo"]',
      )
      const tracking = await page
        .locator('[data-slot="testata-titolo"]')
        .evaluate((el) => getComputedStyle(el).letterSpacing)
      if (piattaforma === 'android') {
        // -0.02em sui 28px del titolo grande di Android.
        expect(tracking, 'l enfasi stringe il tracking').toBe('-0.56px')
        const peso = await page
          .locator('[data-slot="testata-compatta"]')
          .evaluate((el) => getComputedStyle(el).fontWeight)
        expect(peso, 'M3E alza il peso del titolo compatto (600 → 700)').toBe('700')
      } else if (piattaforma === 'ios') {
        expect(tracking, 'HIG tiene il suo titolo stretto, ma non quello di M3E').toBe('-0.4px')
        const peso = await page
          .locator('[data-slot="testata-compatta"]')
          .evaluate((el) => getComputedStyle(el).fontWeight)
        expect(peso, 'su iOS il titolo resta quello di HIG').toBe('600')
      } else {
        expect(tracking, 'sul desktop nessuna enfasi').not.toBe('-0.56px')
        // La barra compatta è `display: none`: sul desktop la testata non c'è,
        // ed è la ragione per cui la suite che gira anche qui è la prova che
        // nessuno ha spostato un pixel.
        const visibile = await page
          .locator('[data-slot="testata-barra"]')
          .evaluate((el) => getComputedStyle(el).display)
        expect(visibile, 'sul desktop la barra compatta non esiste').toBe('none')
      }
    }
  })

  test('il FAB menu: il comando si ESTENDE quando è aperto, e solo su Android', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    for (const piattaforma of ['android', 'ios', 'desktop'] as const) {
      await vai(
        page,
        `${E2E_BASE_URL}/dashboard?${DEV}&platform=${piattaforma}`,
        piattaforma,
        'button[data-nav-actions="control"]',
      )
      const comando = page.locator('button[data-nav-actions="control"]').first()
      // La larghezza COMPUTATA, non il rect: sotto il dito il comando è alla
      // scala 0.85, e il rect di 168 diventerebbe 143 (misurato: è così che
      // questa prova bocciava un FAB menu che funzionava).
      const larghezza = () =>
        comando.evaluate((el) => Math.round(Number.parseFloat(getComputedStyle(el).width)))
      const chiuso = await larghezza()

      // La pressione lunga (500ms) apre l'elenco su OGNI piattaforma: è lo
      // stesso gesto che la sonda dell'aptica usa, e apre senza navigare.
      await comando.hover()
      await page.mouse.down()
      await expect(comando, 'la pressione lunga apre il menu').toHaveAttribute('data-menu-open', 'true', {
        timeout: 5_000,
      })

      if (piattaforma === 'android') {
        expect(chiuso, 'a riposo il comando è il FAB di M3').toBe(56)
        // La larghezza è una TRANSIZIONE (200ms expressive): si aspetta che si
        // assesti, non si legge il primo fotogramma (lezione di M9).
        await expect.poll(larghezza, { timeout: 3_000, message: 'il FAB menu si estende' }).toBe(168)
        // La forma aperta è una PILLOLA: il raggio pieno è il massimo
        // rappresentabile, che non è lo stesso numero fra i motori — si prova la
        // geometria, non la stringa.
        const pillola = await comando.evaluate((el) => {
          const cs = getComputedStyle(el)
          return { raggio: Number.parseFloat(cs.borderRadius), altezza: Number.parseFloat(cs.height) }
        })
        expect(pillola.raggio, 'e prende la forma a pillola della specifica').toBeGreaterThanOrEqual(
          pillola.altezza / 2,
        )
      } else if (piattaforma === 'desktop') {
        // Sul desktop `--fab-menu-w` è la misura del comando: aprire non cambia
        // la forma — l'etichetta entra in un FAB che resta quadrato.
        expect(await larghezza(), 'sul desktop il comando non cambia forma').toBe(chiuso)
      } else {
        // Su iOS il comando è GIÀ una pillola con l'etichetta: la forma estesa di
        // Material non esiste e l'apertura non prende la larghezza del menu —
        // cambia solo il contenuto (l'etichetta lascia il posto alla ×).
        expect(await larghezza(), 'su iOS nessuna larghezza da FAB menu').not.toBe(168)
        const altezza = await comando.evaluate((el) => Math.round(Number.parseFloat(getComputedStyle(el).height)))
        expect(altezza, 'la pillola di iOS resta alta 44').toBe(44)
      }
      await page.mouse.up()
    }
  })

  test('il segmented espressivo: la voce si tira verso il dito (Android)', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    for (const piattaforma of ['android', 'ios', 'desktop'] as const) {
      await vai(
        page,
        `${E2E_BASE_URL}/turnisala?${DEV}&platform=${piattaforma}`,
        piattaforma,
        '[data-turni-switch] a',
      )
      const voce = page.locator('[data-turni-switch] a').nth(1)
      await voce.hover()
      await page.mouse.down()
      const trasformazione = () => voce.evaluate((el) => getComputedStyle(el).transform)
      if (piattaforma === 'android') {
        await expect
          .poll(trasformazione, { timeout: 2_000, message: 'la voce premuta si tira verso il dito' })
          .toBe('matrix(0.85, 0, 0, 0.85, 0, 0)')
      } else {
        // La regola sta sotto `[data-platform='android']`: altrove l'attributo
        // c'è (il dito non sa niente di skin) ma nessuno lo legge.
        expect(await voce.getAttribute('data-gl-press')).toBe('true')
        expect(await trasformazione(), `su ${piattaforma} il segmented non si muove`).toBe('none')
      }
      await page.mouse.up()
    }
  })

  test('la toolbar della board: raggio ed elevazione expressive, e solo su Android', async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Minino')), 'admin non in anagrafica')
    const page = await asEmployee('Minino')

    for (const piattaforma of ['android', 'ios', 'desktop'] as const) {
      await vai(
        page,
        `${E2E_BASE_URL}/turnisala?${DEV}&platform=${piattaforma}`,
        piattaforma,
        '.sala-toolbar-bg',
      )
      const m = await page
        .locator('.sala-toolbar-bg')
        .first()
        .evaluate((el) => {
          const cs = getComputedStyle(el)
          return { raggio: cs.borderTopLeftRadius, ombra: cs.boxShadow }
        })
      if (piattaforma === 'android') {
        expect(m.raggio, 'il raggio grande di M3E').toBe('28px')
        expect(m.ombra, 'e l elevazione del chrome di M8').not.toBe('none')
      } else {
        expect(m.raggio, `su ${piattaforma} la toolbar resta il blocco di oggi`).toBe('12px')
        expect(m.ombra, `su ${piattaforma} nessuna ombra`).toBe('none')
      }
    }
  })
})
