import { test, expect, findEmployee } from './fixtures'
import { E2E_BASE_URL } from './employee-session'
import { LARGHEZZE } from './tuoturno'

/**
 * IL PANNELLO MESE/ANNO NON DEVE USCIRE DALLO SCHERMO (bug 18/09/2026).
 *
 * Il pannello (`.month-pop`) si centra sul bottone mese/anno con
 * `left-1/2 -translate-x-1/2` e l'animazione `month-pop` dei keyframe porta un
 * SUO `transform: translate(-50%, …)`. Con Tailwind 4 la utility non scrive più
 * `transform` ma la proprietà `translate`: le due traslazioni si COMPONGONO
 * (CSS: prima `translate`, poi `transform`) e il pannello finisce spostato di
 * un'intera larghezza verso sinistra — metà fuori dallo schermo.
 *
 * Qui si difende il comportamento giusto: a OGNI larghezza il pannello sta
 * tutto dentro la finestra e resta centrato sul suo bottone.
 */
const TOL = 2 // px: arrotondamenti subpixel di scale/animazione

test('pannello mese/anno dentro lo schermo e centrato sul bottone', async ({ asEmployee }) => {
  test.skip(!(await findEmployee('Di Monda')), 'serve un dipendente per entrare (service-role in .env.local)')
  const page = await asEmployee('Di Monda')
  await page.goto(`${E2E_BASE_URL}/tuoturno?dev=rootkind-dev-2026`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.cell-day').first()).toBeVisible({ timeout: 30_000 })

  const trigger = page.getByLabel('Scegli mese e anno')

  for (const w of LARGHEZZE) {
    await page.setViewportSize({ width: w, height: 900 })
    // Si riparte da pannello CHIUSO (ESC: il click sul bottone lo riaprirebbe).
    if ((await page.locator('.month-pop').count()) > 0) {
      await page.keyboard.press('Escape')
      await expect(page.locator('.month-pop')).toHaveCount(0)
    }
    await trigger.click()
    const pop = page.locator('.month-pop')
    await expect(pop).toBeVisible()

    // L'animazione parte con overshoot e ha `both` come fill: si misura a
    // animazione FINITA (400 ms > 280 ms), altrimenti si leggerebbe il frame 0.
    await page.waitForTimeout(450)
    const m = await page.evaluate(() => {
      const p = document.querySelector('.month-pop') as HTMLElement | null
      const t = document.querySelector('[aria-label="Scegli mese e anno"]') as HTMLElement | null
      if (!p || !t) return null
      const pr = p.getBoundingClientRect()
      const tr = t.getBoundingClientRect()
      return {
        pop: { left: pr.left, right: pr.right, width: pr.width },
        trigger: { left: tr.left, right: tr.right },
        viewport: window.innerWidth,
      }
    })
    expect(m, `pannello o bottone assenti a ${w}px`).not.toBeNull()
    const { pop: rect, trigger: trg, viewport } = m!

    console.log(
      `${w}px → pannello [${rect.left.toFixed(1)}, ${rect.right.toFixed(1)}] (${rect.width.toFixed(0)}px), ` +
        `bottone [${trg.left.toFixed(1)}, ${trg.right.toFixed(1)}], finestra ${viewport}px`,
    )

    expect(rect.left, `a ${w}px il pannello esce a sinistra: left=${rect.left.toFixed(1)}`).toBeGreaterThanOrEqual(-TOL)
    expect(rect.right, `a ${w}px il pannello esce a destra: right=${rect.right.toFixed(1)}`).toBeLessThanOrEqual(viewport + TOL)

    const centroPannello = (rect.left + rect.right) / 2
    const centroBottone = (trg.left + trg.right) / 2
    expect(
      Math.abs(centroPannello - centroBottone),
      `a ${w}px il pannello non è centrato sul bottone (scarto ${(centroPannello - centroBottone).toFixed(1)}px)`,
    ).toBeLessThanOrEqual(TOL)
  }
})
