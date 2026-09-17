import type { BrowserContext, Page } from '@playwright/test'

/**
 * PREPARAZIONE DEL BROWSER DI TEST (17/09/2026) — velocità E stabilità.
 *
 * Due popup dell'APP si aprono da soli poco dopo l'avvio e rendono INERTE la
 * pagina sotto di loro: il loro overlay intercetta i click, quindi qualunque
 * prova che clicca qualcosa resta appesa fino al timeout del test. Non sono
 * ipotesi: il 17/09/2026 la suite si fermava così (il primo test di
 * `chip-gialle.spec.ts` moriva a 5 minuti sul click del giorno).
 *
 *  1. **Promemoria permessi notifiche** (`PushPermissionPrompt`): con permesso
 *     'default' o 'denied' compare a 2,5 s. In headless `Notification.permission`
 *     è SEMPRE 'denied' — anche dopo `grantPermissions(['notifications'])`
 *     (verificato: `tests/probe-perm.spec.ts`) — quindi nei test comparirebbe
 *     sempre. Qui lo si zittisce con la chiave di snooze dell'app
 *     (`push-reminder-dismissed`): è esattamente lo stato di chi ha già detto
 *     «Non ora» (l'app non lo rimostra per 7 giorni).
 *  2. **«Novità di questa versione»** (`ChangelogDialog`): a 1,5 s chiede
 *     `GET /api/changelog` e, se c'è una versione non vista, apre il popup. Si
 *     blocca QUELLA richiesta (e solo quella: `/api/changelog/read` resta
 *     intatto): la risposta non arriva, il dialog non si apre e sparisce anche
 *     il sondaggio da 2 s che ogni `openBoard` faceva per chiuderlo. Nessuno
 *     spec verifica il popup del changelog: non si perde copertura. Chi vuole
 *     provarlo toglie il blocco dal contesto (`context.unroute`, col glob del
 *     route qui sotto) e il popup torna a comparire.
 *
 * Le due cose valgono per TUTTE le pagine del contesto: si installano una volta
 * sola, in `tests/fixtures.ts` (fixture automatica), così valgono per ogni spec
 * che importa `test` da lì — compresi quelli futuri.
 */
const pronti = new WeakSet<BrowserContext>()

export async function preparaBrowser(context: BrowserContext): Promise<void> {
  if (pronti.has(context)) return
  pronti.add(context)

  await context.addInitScript(() => {
    try {
      localStorage.setItem('push-reminder-dismissed', String(Date.now()))
    } catch {
      /* localStorage assente: il popup si mostrerà, il test lo tratterà come rumore */
    }
  })

  await context.route(
    url => url.pathname === '/api/changelog',
    route => route.abort(),
  )
}

/** true se il contesto è già preparato (il sondaggio del changelog è inutile). */
export function browserPreparato(page: Page): boolean {
  return pronti.has(page.context())
}
