import { test, expect, findEmployee } from './fixtures'
import { E2E_BASE_URL } from './employee-session'

/**
 * LA «X» DEL DIALOG DEI CAMBI TURNO NON DEVE STARE SOPRA IL DATEPICKER
 * (bug trovato e chiuso il 17/09/2026).
 *
 * Lo `ShiftDialog` è un popup `p-0` col contenuto che arriva fino ai bordi e
 * scorre, mentre la X arrivava dall'involucro come elemento ASSOLUTO in alto a
 * destra (`DialogContent`, `absolute top-2 right-2`). La X cadeva addosso alla
 * freccia «mese successivo» del calendario — misurato a schermo 390 px: X a
 * x 351-379 / y 121-149, freccia a x 330-358 / y 142-170, cioè 7×7 px di
 * intersezione — e scorrendo finiva sopra i numeri dei giorni.
 *
 * La X ora ha una riga sua, fuori dall'area che scorre (vedi
 * `components/shifts/shift-dialog.tsx`): non copre niente e non si sposta.
 *
 * La guardia guarda DUE cose, perché sbagliare una sola non basta:
 *
 * 1. **La X non si sovrappone a nessun altro controllo** — intersezione fra il
 *    rettangolo della X e quello dei controlli TAGLIATO su ciò che si vede
 *    davvero (catena dei contenitori che scorrono + finestra). Serve il taglio:
 *    un `getBoundingClientRect` di un elemento uscito dallo scorrimento resta
 *    dov'è, e senza taglio la guardia accuserebbe roba invisibile e non
 *    cliccabile. Il taglio è anche il motivo per cui il difetto non si vede
 *    dimezzato: la X non prendeva tutta la freccia, solo il suo angolo in alto a
 *    destra — un controllo di «chi c'è sotto il centro» non lo avrebbe visto.
 * 2. **La X non è coperta da nessuno** — colpo di sonda sui suoi 5 punti
 *    (`elementFromPoint`): se qualcosa le sta sopra, il punto restituisce quello.
 */
test.setTimeout(60_000)

for (const larghezza of [320, 390]) {
  test(`la X non copre il datepicker — ${larghezza}px`, async ({ asEmployee }) => {
    test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente (service-role in .env.local)')
    const page = await asEmployee('Di Monda')
    await page.setViewportSize({ width: larghezza, height: 700 })
    // `?new=1` è la scorciatoia che apre subito il dialog del nuovo cambio turno.
    await page.goto(`${E2E_BASE_URL}/dashboard?new=1&dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })

    const dialog = page.locator('[data-slot="dialog-content"]').first()
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    // Il calendario del dialog: è lento a comparire (dati del mese).
    await expect(dialog.locator('[role="grid"]')).toBeVisible({ timeout: 20_000 })

    /** Problemi trovati adesso: sovrapposizioni e chi copre la X. */
    const analizza = () =>
      page.evaluate(() => {
        const dialog = document.querySelector('[data-slot="dialog-content"]')
        const x = [...document.querySelectorAll('[data-slot="dialog-close"]')].find(el => dialog?.contains(el))
        if (!dialog || !x) return null

        const nome = (el: Element) =>
          (el.getAttribute('aria-label') ?? el.textContent ?? el.className).toString().trim().slice(0, 30) || el.tagName

        /** Rettangolo dell'elemento ridotto a ciò che si vede (tagli + finestra). */
        const visibile = (el: Element) => {
          const r = el.getBoundingClientRect()
          let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
          for (let a = el.parentElement; a; a = a.parentElement) {
            const st = getComputedStyle(a)
            if (!/(auto|scroll|hidden|clip)/.test(st.overflowX + st.overflowY)) continue
            const ar = a.getBoundingClientRect()
            box = {
              left: Math.max(box.left, ar.left),
              top: Math.max(box.top, ar.top),
              right: Math.min(box.right, ar.right),
              bottom: Math.min(box.bottom, ar.bottom),
            }
          }
          return {
            left: Math.max(box.left, 0),
            top: Math.max(box.top, 0),
            right: Math.min(box.right, window.innerWidth),
            bottom: Math.min(box.bottom, window.innerHeight),
          }
        }

        const xr = visibile(x)
        const sovrapposti: string[] = []
        for (const el of dialog.querySelectorAll('button, [role="button"], input')) {
          if (el === x || x.contains(el)) continue
          const v = visibile(el)
          if (v.right - v.left <= 0 || v.bottom - v.top <= 0) continue // tagliato via: non si vede, non si clicca
          // Intersezione vera, non «chi c'è sotto il centro»: il difetto era di
          // 7×7 px sull'angolo della freccia, e il centro della freccia restava
          // libero — un controllo sul solo centro non lo vedrebbe mai.
          const larga = Math.min(v.right, xr.right) - Math.max(v.left, xr.left)
          const alta = Math.min(v.bottom, xr.bottom) - Math.max(v.top, xr.top)
          if (larga > 1 && alta > 1) {
            sovrapposti.push(
              `${nome(el)} a ${JSON.stringify({ x: Math.round(v.left), y: Math.round(v.top) })} — ${Math.round(larga)}×${Math.round(alta)} px`,
            )
          }
        }

        // La X deve essere raggiungibile in ogni punto della sua superficie.
        const r = x.getBoundingClientRect()
        const punti: [number, number][] = [
          [r.x + r.width / 2, r.y + r.height / 2],
          [r.x + 3, r.y + 3],
          [r.right - 3, r.y + 3],
          [r.x + 3, r.bottom - 3],
          [r.right - 3, r.bottom - 3],
        ]
        const coperta = punti
          .map(([px, py]) => {
            const hit = document.elementFromPoint(Math.round(px), Math.round(py))
            if (!hit || x.contains(hit)) return null
            return `(${Math.round(px)},${Math.round(py)}) → ${nome(hit)}`
          })
          .filter(Boolean)

        return { sovrapposti, coperta }
      })

    const inCima = await analizza()
    expect(inCima, 'il dialog non ha la X (showCloseButton?)').not.toBeNull()
    expect(inCima!.sovrapposti, 'la X si sovrappone a un controllo del datepicker').toEqual([])
    expect(inCima!.coperta, 'qualcosa copre la X').toEqual([])

    // Il dialog è alto 85svh e scorre: la X resta fuori dai piedi anche col
    // contenuto spostato (era scorrendo che finiva sui numeri dei giorni).
    await dialog.evaluate(el => {
      const corpo = el.querySelector('.scroll-area') ?? el
      corpo.scrollTop = corpo.scrollHeight
    })
    const inFondo = await analizza()
    expect(inFondo!.sovrapposti, 'la X si sovrappone a qualcosa dopo lo scorrimento').toEqual([])
    expect(inFondo!.coperta, 'qualcosa copre la X dopo lo scorrimento').toEqual([])

    // E chiude ancora: la X ora è la nostra, non più quella dell'involucro.
    await page.locator('[data-slot="dialog-close"]').first().click()
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0, { timeout: 5_000 })
  })
}
