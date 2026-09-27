import { test, expect, employeeLoginEnabled, findEmployee } from './fixtures'
import { openBoard, openSalaAdminFab } from './sala-board'
import { readSalaLayout } from './sala-layout'

/**
 * VIEW «TEORICO ≠ REALE»: la persona SPOSTATA si legge anche sulla card dove
 * sta davvero (decisione 27/09/2026, caso Semola 26/09: teorico P5, reale M6).
 *
 * Il motore (`theoRealSectionCompare`) scrive la riga rossa «nome → reale»
 * sulla card del TURNO TEORICO (DCO 5°, turno P) e l'elenco delle provenienze
 * («nome da <teorico>») sulle card dei turni in cui la persona si trova davvero.
 * Prima la seconda riga esisteva solo per chi NON ha un teorico di sezione
 * (riposo RC, disponibilità D): chi era stato spostato compariva solo sulla
 * card del turno teorico, e la card dove la persona è davvero non diceva nulla.
 *
 * Qui si verifica l'INVARIANTE, non un caso: per ogni riga il cui reale è una
 * sezione DEL TURNO A SCHERMO, la card di quella sezione deve elencare la
 * persona con la stessa provenienza.
 *
 * ATTENZIONE al dato: la suite gira sul DEV, e il PDF di settembre li ha
 * caricati il 16/09 mentre in PRODUZIONE (dove è successo il caso Semola,
 * teorico P5 → reale M6) il mese è stato ricaricato più volte. Quindi qui non
 * si cerca SEMOLA: si cerca qualunque spostamento, e se il mese a schermo non
 * ne ha nessuno il test si salta invece di fallire.
 */
test.describe('turnisala: teorico ≠ reale, anche sulla card dove la persona è', () => {
  test.skip(!employeeLoginEnabled(), 'serve SUPABASE_SERVICE_ROLE_KEY in .env.local (vedi tests/README.md)')
  test.setTimeout(180_000)
  test.use({ viewport: { width: 1280, height: 900 } })

  /** 26/09/2026 turno M: il giorno della segnalazione (in produzione Semola
   *  P5 → M6; in dev, con il PDF del 16/09, il caso è un altro ma della stessa
   *  natura — gli spostamenti ci sono). */
  const GIORNO = 26
  const MESE = 9
  const TURNO = 'M' as const

  /** Il titolo a schermo è quello della piantina SENZA «doppia»
   *  (components/sala/desk-card.tsx): il confronto va fatto sulle stesse chiavi. */
  const titoloSchermo = (t: string) => t.replace(/\s*doppia\s*/gi, '').trim()

  /** Apre la board del giorno e ACCENDE la view «Teorico ≠ reale» dal mini-Fab. */
  async function apriConConfronto(page: import('@playwright/test').Page) {
    expect(await openBoard(page, { month: MESE, day: GIORNO, shift: TURNO })).toBe(true)
    await openSalaAdminFab(page)
    const voce = page.getByLabel('Mostra i turni teorici diversi dal reale')
    await expect(voce, 'la voce «Teorico ≠ reale» deve essere nel menu admin').toBeVisible()
    await voce.click()
  }

  test('ogni riga «X → sezione» ha la sua «X da <teorico>» sulla card della sezione', async ({ asEmployee }) => {
    const admin = await findEmployee('Minino')
    test.skip(!admin, 'admin non in anagrafica')
    const piantina = await readSalaLayout()
    test.skip(!piantina, 'piantina non leggibile (serve la service-role)')
    const titoloDiSezione = new Map(
      (piantina?.layout.cards ?? []).map(c => [c.sectionKey ?? c.title, titoloSchermo(c.title)] as const),
    )

    const page = await asEmployee('Minino')
    await apriConConfronto(page)

    // Righe e provenienze, card per card (il DOM le espone con data-theo-riga /
    // data-theo-provenienza: nome, teorico e reale, senza leggere il testo).
    const carte = await page.evaluate(() =>
      [...document.querySelectorAll('.sala-card-bg')].map(c => ({
        titolo: c.querySelector('.sala-card-title')?.textContent?.trim() ?? '',
        righe: [...c.querySelectorAll('[data-theo-riga]')].map(el => ({
          persona: el.getAttribute('data-persona') ?? '',
          teorico: el.getAttribute('data-teorico') ?? '',
          reale: el.getAttribute('data-reale') ?? '',
        })),
        provenienze: [...c.querySelectorAll('[data-theo-provenienza]')].map(el => ({
          persona: el.getAttribute('data-persona') ?? '',
          teorico: el.getAttribute('data-teorico') ?? '',
        })),
      })),
    )

    const perTitolo = new Map(carte.map(c => [c.titolo, c]))
    // Righe il cui REALE è una sezione del turno a schermo: la posizione reale
    // è su una card di questo turno, quindi la provenienza deve esserci.
    const daControllare = carte.flatMap(c =>
      c.righe
        .filter(r => r.reale[0] === TURNO && r.reale.length > 1)
        .map(r => ({ ...r, da: c.titolo })),
    )
    test.skip(
      daControllare.length === 0,
      `nessuno spostamento nel mese a schermo (${GIORNO}/${MESE}, turno ${TURNO}): il dato è cambiato, l'invariante non ha niente da dire`,
    )
    expect(
      daControllare.length,
      `il ${GIORNO}/${MESE} turno ${TURNO} dovrebbe avere almeno una persona spostata fra le righe`,
    ).toBeGreaterThan(0)

    const problemi: string[] = []
    for (const r of daControllare) {
      const sezione = r.reale.slice(1)
      const titolo = titoloDiSezione.get(sezione)
      if (!titolo) continue                       // sezione senza card: niente da mostrare
      const card = perTitolo.get(titolo)
      if (!card) {
        problemi.push(`${r.persona}: reale ${r.reale} ma la card «${titolo}» non è a schermo`)
        continue
      }
      const stessa = card.provenienze.find(p => p.persona === r.persona && p.teorico === r.teorico)
      if (!stessa) {
        problemi.push(
          `${r.persona}: riga «${r.teorico} → ${r.reale}» sulla card «${r.da}», ma sulla card «${titolo}» ` +
            `c'è ${JSON.stringify(card.provenienze)} invece di «${r.persona} da ${r.teorico}»`,
        )
      }
    }
    expect(problemi, problemi.join('\n')).toEqual([])
  })

  /**
   * PANNELLO «FUORI POSTO» (28/09/2026): l'elenco del giorno per turno, in
   * fondo alla board. Tre cose devono valere, e sono tutte invarianti (il
   * mese può cambiare, la regola no):
   *  1. senza la view accesa il pannello NON c'è — è l'analisi, non la board;
   *  2. ogni persona compare UNA volta sola, e nel gruppo del turno dove si
   *     trova davvero (le siglie che non sono turni — assenze, riposi,
   *     «presente» — cadono nel turno teorico, come il blocco «Assenti»);
   *  3. il pannello non inventa persone: chi c'è dentro deve comparire anche
   *     fra le righe/provenienze delle card, con gli stessi due codici (per il
   *     turno a schermo: la board mostra un turno per volta).
   */
  test('il pannello «Fuori posto» elenca ogni persona una volta, nel turno giusto', async ({ asEmployee }) => {
    const admin = await findEmployee('Minino')
    test.skip(!admin, 'admin non in anagrafica')
    const page = await asEmployee('Minino')
    expect(await openBoard(page, { month: MESE, day: GIORNO, shift: TURNO })).toBe(true)

    // 1) view spenta → nessun pannello
    expect(
      await page.locator('[data-fuori-posto]').count(),
      'il pannello «Fuori posto» non deve comparire senza la view «Teorico ≠ reale»',
    ).toBe(0)

    await openSalaAdminFab(page)
    await page.getByLabel('Mostra i turni teorici diversi dal reale').click()

    const letto = await page.evaluate(() => ({
      gruppi: [...document.querySelectorAll('[data-fuori-posto]')].map(el => ({
        turno: el.getAttribute('data-fuori-posto') ?? '',
        voci: [...el.querySelectorAll('[data-persona]')].map(c => ({
          persona: c.getAttribute('data-persona') ?? '',
          teorico: c.getAttribute('data-teorico') ?? '',
          reale: c.getAttribute('data-reale') ?? '',
        })),
      })),
      carte: [...document.querySelectorAll('.sala-card-bg')].flatMap(c => [
        ...[...c.querySelectorAll('[data-theo-riga]')].map(el => ({
          persona: el.getAttribute('data-persona') ?? '',
          teorico: el.getAttribute('data-teorico') ?? '',
        })),
        ...[...c.querySelectorAll('[data-theo-provenienza]')].map(el => ({
          persona: el.getAttribute('data-persona') ?? '',
          teorico: el.getAttribute('data-teorico') ?? '',
        })),
      ]),
    }))

    const voci = letto.gruppi.flatMap(g => g.voci.map(v => ({ ...v, gruppo: g.turno })))
    test.skip(voci.length === 0, 'nessuno scostamento nel mese a schermo: il pannello non ha niente da dire')

    const problemi: string[] = []
    const visti = new Map<string, string>()
    for (const v of voci) {
      const chiave = `${v.persona}|${v.teorico}`
      if (visti.has(chiave)) problemi.push(`${v.persona} compare due volte nel pannello (gruppi ${visti.get(chiave)} e ${v.gruppo})`)
      visti.set(chiave, v.gruppo)
      // 2) il gruppo è il turno del REALE, se il reale è un turno
      const c = (v.reale ?? '').trim()
      const turnoReale = /^(presente|assente|na)$/i.test(c) ? '' : 'MPN'.includes(c[0]?.toUpperCase() ?? '') ? c[0].toUpperCase() : ''
      if (turnoReale && turnoReale !== v.gruppo) {
        problemi.push(`${v.persona} (${v.teorico}→${v.reale}) sta nel gruppo «${v.gruppo}» invece che «${turnoReale}»`)
      }
      // 3) la stessa persona, con gli stessi codici, è anche sulle card — ma la
      //    board mostra UN turno alla volta: le card degli altri due non sono a
      //    schermo, quindi il confronto vale solo per il turno selezionato.
      if (
        v.gruppo === TURNO &&
        !letto.carte.some(c2 => c2.persona === v.persona && c2.teorico === v.teorico)
      ) {
        problemi.push(`${v.persona} (${v.teorico}) è nel pannello ma non fra le righe/provenienze delle card`)
      }
    }
    expect(problemi, problemi.join('\n')).toEqual([])
  })
})
