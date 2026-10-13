import { test as base, expect, type Page } from '@playwright/test'
import { asPlaywrightCookies, sessionForEmployee, type Employee } from './employee-session'
import { preparaBrowser } from './browser-setup'

/**
 * FIXTURE «ENTRA COME DIPENDENTE» (27/09/2026).
 *
 * ```
 * import { test, expect } from './fixtures'
 *
 * test('il mio turno giallo evidenzia la mia card', async ({ asEmployee }) => {
 *   const page = await asEmployee('Barra')        // cognome, oppure { cognome, nome }
 *   await page.goto(`${E2E_BASE_URL}/turnisala?dev=rootkind-dev-2026`)
 * })
 * ```
 *
 * Sostituisce i COOKIE di sessione dell'utente di test (quelli di `storageState`)
 * con quelli del dipendente indicato, ricavati col link magico admin: nessuna
 * password, nessun file di sessione da rigenerare — serve solo la service-role
 * in `.env.local`. È la sessione che conta per il profilo lato server (e quindi
 * per l'evidenzia della card). Usa il contesto/pagina del test, quindi eredita viewport,
 * bypass dev e quant'altro dalla configurazione; chiudi col context del test.
 *
 * Se la service-role o il dipendente non ci sono, `sessionForEmployee` lancia:
 * il test decide se saltare (`test.skip`) o fallire.
 */
export const test = base.extend<{
  /** Autentica il contesto del test COME quel dipendente e restituisce la pagina. */
  asEmployee: (who: Employee | string) => Promise<Page>
  /** Fixture automatica: prepara il contesto (vedi tests/browser-setup.ts). */
  browserPronto: void
}>({
  // AUTOMATICA, e prima delle altre: spegne i due popup dell'app che altrimenti
  // coprono la pagina e intercettano i click (promemoria permessi notifiche e
  // «Novità di questa versione»), e toglie di mezzo il sondaggio da 2 s che ogni
  // navigazione faceva per chiudere il secondo.
  browserPronto: [async ({ context }, use) => {
    await preparaBrowser(context)
    await use()
  }, { auto: true }],

  asEmployee: async ({ context, page }, use) => {
    // `use` è il callback delle fixture Playwright, non un Hook React: la regola
    // dei React Hooks qui non si applica.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(async who => {
      const session = await sessionForEmployee(who)
      // Niente sessione residua (l'utente di test dello storageState ha lo
      // STESSO nome di cookie: senza clear, chi vince dipende dall'ordine).
      await context.clearCookies()
      await context.addCookies(asPlaywrightCookies(session))
      // I COOKIE NON SONO TUTTO: l'app si identifica anche dal CLIENT e tiene il
      // profilo in localStorage (`cache:{userId}:user-profile`, con
      // `cache:last-user-id` a dire qual è). Sostituendo solo i cookie, la pagina
      // disegna col profilo del dipendente PRECEDENTE — la pillola «SEI TU» di
      // Cosenza sulla board di Di Monda — finché la guardia
      // (components/providers/auth-cache-guard.tsx) non se ne accorge. Nella vita
      // vera quel cambio passa da un login, che svuota le cache (clearUserCaches):
      // qui lo fa il fixture. SOLO le chiavi `cache:*`: i bypass del contesto di
      // test (tests/browser-setup.ts) vivono in altre chiavi e restano.
      const svuotaCache = () => {
        try {
          const keys: string[] = []
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (k && k.startsWith('cache:')) keys.push(k)
          }
          keys.forEach(k => localStorage.removeItem(k))
        } catch { /* storage negato: la pagina riparte comunque dal DB */ }
      }
      await page.evaluate(svuotaCache).catch(() => { /* pagina non ancora navigata */ })
      return page
    })
  },
})

export { expect }
export { E2E_BASE_URL, employeeLoginEnabled, findEmployee } from './employee-session'
