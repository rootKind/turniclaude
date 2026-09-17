import { test, expect, E2E_BASE_URL, findEmployee } from './fixtures'
import { boardChipColors, boardChips, cardBodyGaps, openBoard, riposa, selectShift } from './sala-board'
import { giorniGialli } from './sala-gialli'

/**
 * CHIP GIALLE DENTRO LA CARD + SCORRIMENTO VERTICALE (richiesta 15/09/2026).
 *
 * La board è a 3 colonne FISSE: la card misura 411px su desktop ma 114px a 390px
 * di schermo, e la card ha `overflow-hidden` → quello che non entra viene
 * TAGLIATO. La chip gialla «cognome + sigla» è la più esposta: a 390px con
 * «SmeragliuoloSPCA» (142px) in 98px di riga utile, 8 chip su 28 uscivano dalla
 * card. Ora la sigla scende sotto il nome (flex-wrap) e, se nemmeno il solo
 * cognome entra, il testo si rimpicciolisce (`.sala-fit-text`, container query
 * sulla card): qui si difende che a OGNI larghezza nulla sporga e nulla finisca
 * dietro l'ellipsis, e che su desktop non cambi niente (chip su una riga).
 *
 * I GIORNI NON SONO SCRITTI A MANO (16/09/2026, sera): si prendono i più RICCHI
 * di celle gialle dal mese caricato (tests/sala-gialli.ts). Il 16/09 il PDF di
 * settembre è stato ricaricato e il 23/9 è passato da ~30 chip a 1: una prova
 * tarata su quel giorno diventava rossa per il DATO, non per il codice.
 */
const LARGHEZZE = [320, 390, 1280]
/** Quanti giorni del mese (i più ricchi) guardare: ogni giorno×turno è una
 *  navigazione (la board ricarica i dati), quindi si resta a 2 per i tempi. */
const GIORNI = 2

test.setTimeout(300_000)

test('le chip gialle restano dentro la card a ogni larghezza', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
  const gialli = await giorniGialli('2026-09')
  test.skip(!gialli.length, 'nessuna cella gialla nel mese caricato')
  const giorni = gialli.slice(0, GIORNI).map(g => g.day)
  const page = await asEmployee('Di Monda')
  let viste = 0

  for (const w of LARGHEZZE) {
    await page.setViewportSize({ width: w, height: 900 })
    let visteQui = 0
    for (const giorno of giorni) {
      // A ogni larghezza basta UN giorno che mostra chip: le navigazioni sono
      // 3 larghezze × giorni × 3 turni e la board ricarica i dati ogni volta.
      if (visteQui > 0) break
      expect(await openBoard(page, { month: 9, day: giorno }), 'board non aperta').toBe(true)
      for (const turno of ['M', 'P', 'N'] as const) {
        await selectShift(page, turno)
        const chips = await boardChips(page)
        viste += chips.length
        visteQui += chips.length

        expect(
          chips.filter(c => c.overflowing).map(c => `«${c.text}» su ${c.card}`),
          `il ${giorno}/9 turno ${turno}, a ${w}px: nessuna chip deve uscire dalla card`,
        ).toEqual([])
        expect(
          chips.filter(c => c.clipped).map(c => `«${c.text}»`),
          `il ${giorno}/9 turno ${turno}, a ${w}px: nessuna chip deve finire dietro l'ellipsis`,
        ).toEqual([])
        // Su desktop lo spazio c'è: la chip non deve cambiare forma.
        if (w >= 1280) {
          expect(
            chips.filter(c => c.lines > 1).map(c => c.text),
            `il ${giorno}/9 turno ${turno}: su desktop le chip restano su una riga`,
          ).toEqual([])
        }
      }
    }
  }

  console.log(`chip misurate: ${viste} su ${LARGHEZZE.length} larghezze × ${giorni.length} giorni × 3 turni`)
  expect(viste, 'nessuna chip gialla trovata: la prova passerebbe a vuoto').toBeGreaterThan(0)
})

/**
 * UNA SOLA FAMIGLIA DI COLORI PER CHIP (richiesta 16/09/2026).
 *
 * Nel tema scuro la chip «AlbanoA» della DCIF del 19/9 P (e «MininoSPCA» della
 * 8° del 23/9 P) sembrava avere DUE colori: il testo veniva dalla tinta ASSENTI
 * (rosa #fbd9d6) mentre il BORDO dalla tinta TRASFERTE (ambra #fbbf24): due
 * famiglie lontane, sulla stessa pillola. Era l'unica pillola dell'app col bordo
 * che non seguiva il proprio testo.
 *
 * Qui si confrontano i CANALI resi dal browser: il bordo è 30% del testo, quindi
 * stessi RGB — in entrambi i temi. E nel chiaro il testo è il ROSSO della
 * richiesta, non il marrone di prima.
 */
function canali(css: string): [number, number, number] {
  const srgb = css.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/)
  if (srgb) return [Math.round(+srgb[1] * 255), Math.round(+srgb[2] * 255), Math.round(+srgb[3] * 255)]
  const rgb = css.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  if (!rgb) throw new Error(`colore non interpretabile: ${css}`)
  return [Math.round(+rgb[1]), Math.round(+rgb[2]), Math.round(+rgb[3])]
}

for (const tema of ['light', 'dark'] as const) {
  test(`la chip ha una famiglia sola di colori (tema ${tema})`, async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
    const gialli = await giorniGialli('2026-09')
    test.skip(!gialli.length, 'nessuna cella gialla nel mese caricato')
    const giorni = gialli.slice(0, 2).map(g => g.day)
    const page = await asEmployee('Di Monda')
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.addInitScript(t => window.localStorage.setItem('ui-theme', t), tema)
    await page.emulateMedia({ colorScheme: tema })

    let viste = 0
    // Appena UNA board mostra chip si esce: 2 giorni × 3 turni sono 6
    // navigazioni, e la prova dei colori non guadagna nulla a vederle tutte.
    esterno:
    for (const giorno of giorni) {
      for (const turno of ['M', 'P', 'N'] as const) {
        expect(await openBoard(page, { month: 9, day: giorno, shift: turno }, E2E_BASE_URL), 'board non aperta').toBe(true)
        const chips = await boardChipColors(page)
        viste += chips.length
        for (const c of chips) {
          const testo = canali(c.textColor)
          const bordo = canali(c.borderColor)
          expect(
            bordo.map((v, i) => Math.abs(v - testo[i])),
            `«${c.text}» su ${c.card}: il bordo (${bordo.join(',')}) deve essere della stessa famiglia del testo (${testo.join(',')})`,
          ).toEqual([0, 0, 0])
          // …e alla stessa INTENSITÀ (richiesta 16/09/2026): il bordo è il colore
          // PIENO della scritta, non il 30% — a metà strada fra le due tinte della
          // chip si leggeva come un terzo colore. `color(srgb r g b / 0.3)` e
          // `rgba(…)` portano l'alpha: qui non deve esserci.
          expect(
            /\/|rgba\(/.test(c.borderColor),
            `«${c.text}» su ${c.card}: il bordo deve essere il rosso PIENO del testo, non una sua trasparenza (${c.borderColor})`,
          ).toBe(false)
          // Il cognome e la sigla DENTRO la chip ereditano lo stesso colore.
          for (const f of c.children) {
            expect(canali(f.color), `«${f.text}» dentro «${c.text}»`).toEqual(testo)
          }
        }
        if (viste > 0) break esterno
      }
    }
    expect(viste, 'nessuna chip: la prova passerebbe a vuoto').toBeGreaterThan(0)
  })
}

test('nel tema chiaro il testo della chip è rosso, non marrone', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
  const gialli = await giorniGialli('2026-09')
  test.skip(!gialli.length, 'nessuna cella gialla nel mese caricato')
  const page = await asEmployee('Di Monda')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.addInitScript(() => window.localStorage.setItem('ui-theme', 'light'))
  await page.emulateMedia({ colorScheme: 'light' })

  // Non si sa in CHE turno cada un giorno giallo (la chip sta sulla card dove la
  // persona lavora davvero): si parte dal giorno più ricco su tutti i turni e ci
  // si ferma alla PRIMA board con chip — il colore non cambia da un giorno all'altro.
  const chips: Awaited<ReturnType<typeof boardChipColors>> = []
  for (const g of gialli.slice(0, 3)) {
    for (const turno of ['M', 'P', 'N'] as const) {
      expect(await openBoard(page, { month: 9, day: g.day, shift: turno }, E2E_BASE_URL), 'board non aperta').toBe(true)
      chips.push(...await boardChipColors(page))
      if (chips.length) break
    }
    if (chips.length) break
  }
  expect(chips.length, 'nessuna chip gialla nel mese caricato').toBeGreaterThan(0)
  for (const c of chips) {
    const [r, g] = canali(c.textColor)
    // Il marrone di prima (#8c2a24) stava su R=140: qui si chiede un rosso vero.
    expect(r, `«${c.text}»: componente rossa`).toBeGreaterThan(150)
    expect(g, `«${c.text}»: componente verde`).toBeLessThan(60)
  }
})

/**
 * IL CORPO DELLA CARD NON MOSTRA IL FONDO CARD (richiesta 16/09/2026).
 *
 * La card ha due tinte: il fondo (in scuro #262626) e la superficie del corpo
 * (#171717). Nelle card a RIGA le chip di coda (gialle e «scoperto») stavano
 * fuori da `.sala-card-body`, quindi sotto il titolo la card mostrava DUE tinte:
 * il corpo scuro e, più in basso, il fondo più chiaro — visibile solo in tema
 * scuro, perché nel chiaro le due tinte differiscono di 3 unità su 255.
 *
 * La prova è STRUTTURALE (non guarda i colori): sotto il titolo ogni riga di
 * pixel deve essere coperta da una fascia a tutta larghezza (corpo, coda, tir,
 * teorico≠reale). Vale nei due temi, quindi la regressione non può tornare
 * nemmeno cambiando le tinte.
 */
for (const tema of ['light', 'dark'] as const) {
  test(`il corpo della card non lascia scoperto il fondo card (tema ${tema})`, async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
    const gialli = await giorniGialli('2026-09')
    test.skip(!gialli.length, 'nessuna cella gialla nel mese caricato')
    const giorni = gialli.slice(0, 1).map(g => g.day)
    const page = await asEmployee('Di Monda')
    await page.addInitScript(t => window.localStorage.setItem('ui-theme', t), tema)
    await page.emulateMedia({ colorScheme: tema })

    for (const w of [390, 1280]) {
      await page.setViewportSize({ width: w, height: 900 })
      for (const giorno of giorni) {
        expect(await openBoard(page, { month: 9, day: giorno }, E2E_BASE_URL), 'board non aperta').toBe(true)
        for (const turno of ['M', 'P', 'N'] as const) {
          await selectShift(page, turno)
          const buchi = await cardBodyGaps(page)
          expect(
            buchi.map(b => `${b.card} a ${b.y}px dal bordo alto`),
            `il ${giorno}/9, a ${w}px, turno ${turno}: sotto il titolo la card non deve mai mostrare il proprio fondo`,
          ).toEqual([])
        }
      }
    }
  })
}

test('/turnisala scorre in verticale sui display bassi', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
  const page = await asEmployee('Di Monda')
  await page.setViewportSize({ width: 1280, height: 900 })
  expect(await openBoard(page, { month: 9, day: 23, shift: 'P' }), 'board non aperta').toBe(true)

  for (const h of [380, 500, 1280]) {
    await page.setViewportSize({ width: 1280, height: h })
    await riposa(page)
    const prima = await page.evaluate(() => ({
      doc: document.documentElement.scrollHeight,
      view: window.innerHeight,
      html: getComputedStyle(document.documentElement).overflowY,
      body: getComputedStyle(document.body).overflowY,
    }))
    // Nessuno deve aver spento lo scorrimento del documento.
    expect([prima.html, prima.body], 'overflow-y del documento non deve essere hidden').not.toContain('hidden')

    await page.evaluate(() => window.scrollTo(0, 99999))
    await riposa(page)
    const dopo = await page.evaluate(() => ({
      y: Math.round(window.scrollY),
      max: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    }))

    if (prima.doc > prima.view) {
      expect(dopo.max, `a ${h}px di altezza la pagina deve scorrere`).toBeGreaterThan(0)
      expect(Math.abs(dopo.y - dopo.max), `a ${h}px lo scorrimento deve arrivare in fondo`).toBeLessThan(3)
      console.log(`1280×${h}: pagina alta ${prima.doc}px su viewport ${prima.view}px → scroll fino a ${dopo.max}px ✓`)
    } else {
      expect(dopo.y, `a ${h}px la pagina ci sta: nessuno scroll`).toBe(0)
      console.log(`1280×${h}: pagina alta ${prima.doc}px su viewport ${prima.view}px → nessuno scroll necessario`)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
  }
})
