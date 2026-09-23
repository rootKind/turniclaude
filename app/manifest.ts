import type { MetadataRoute } from 'next'

/**
 * Manifest dinamico: nelle deploy di anteprima/DEV (qualsiasi branch diverso da
 * master) la PWA si chiama «Turni DEV» e usa le icone con la banda gialla/nera
 * «lavori in corso», per distinguerla a colpo d'occhio dalla PWA live.
 * In produzione (master) resta «Turni Sala C.C.C.» con le icone originali.
 *
 * Il valore viene cotto a BUILD time (VERCEL_GIT_COMMIT_REF è una env di build);
 * cambiare branch a runtime non è possibile, ed è esattamente ciò che serve:
 * il branch determina la deploy, non la sessione. In locale (next dev) la env
 * non esiste → fallback su dev = l'ambiente di sviluppo si vede sempre «DEV».
 *
 * Sostituisce public/manifest.json (rimosso): questo endpoint risponde a
 * /manifest.webmanifest con lo stesso contenuto dinamico.
 *
 * M11 (23/09/2026) — cosa è cambiato e perché:
 *
 *  · **`orientation: 'portrait'` via**. Era l'errore Android più visibile di
 *    tutto il piano: la board di sala (`/turnisala`) è una griglia densa che si
 *    legge MEGLIO in orizzontale — tanto che M6 le ha dato le safe area laterali
 *    per il notch di lato. Un manifest che bloccava il ritratto contraddiceva il
 *    lavoro già fatto. Il lock è una decisione dell'UTENTE (la rotazione di
 *    sistema), non dell'app: senza il campo la PWA segue il telefono.
 *  · **`id` e `scope` espliciti** (`/`). Senza `id` l'identità dell'app è il
 *    `start_url`: cambiare la pagina d'avvio in futuro creerebbe una SECONDA app
 *    installata (icona doppia, dati doppi). Con `id` l'identità è stabile.
 *  · **`lang`/`dir`**: l'app è in italiano, e lo dice al sistema invece di
 *    lasciarglielo indovinare (sintesi vocale, sillabazione, layout RTL).
 *  · **`shortcuts`**: il menu contestuale dell'icona (pressione lunga su Android,
 *    Haptic Touch su iOS). Le quattro destinazioni sono reali e già raggiungibili
 *    dalla barra; la comodità è arrivarci senza aspettare il boot.
 *  · **`display_override`**: `standalone` resta la modalità primaria; il secondo
 *    gradino dichiara come si ripiega se il sistema non la concede.
 *  · **maskable 192** accanto alla 512: Android sceglie la taglia in base alla
 *    densità, e con la sola 512 su schermi a bassa densità la tile adattiva
 *    veniva scalata (bordi morbidi).
 *  · **`screenshots`**: sono il riquadro che il foglio di installazione di Chrome
 *    mostra al posto di una riga di testo. Generati dall'app vera (vedi
 *    `scripts/genera-screenshot-manifest.mjs`), non disegnati a mano.
 *  · **`categories`**: due voci, genera la classificazione nel launcher.
 *
 * La riga DEV aveva anche un DIFETTO DI FORMATTAZIONE (`orientation: 'portrait',`
 * e `icons:` sulla stessa riga, senza a capo): illeggibile ma funzionante. Qui i
 * due rami sono costruiti su una BASE COMUNE, così il ramo DEV non può più
 * divergere da quello di produzione su un campo che non riguarda il nome.
 */

const isProductionDeploy = process.env.VERCEL_GIT_COMMIT_REF === 'master'

// Le destinazioni delle scorciatoie: rotte VERE dell'app (app/(app)/*). Se una
// cambia nome, il manifest punta nel vuoto e il menu dell'icona apre un 404 —
// sono pinnate dalla spec tests/m11-pwa.spec.ts, che le confronta con le
// cartelle di `app/(app)`.
const SCORCIATOIE: MetadataRoute.Manifest['shortcuts'] = [
  { name: 'Dashboard', short_name: 'Dashboard', url: '/dashboard' },
  { name: 'Il tuo turno', short_name: 'Turno', url: '/tuoturno' },
  { name: 'Turni di sala', short_name: 'Sala', url: '/turnisala' },
  { name: 'Notifiche', short_name: 'Notifiche', url: '/notifiche' },
]

export default function manifest(): MetadataRoute.Manifest {
  const nome = isProductionDeploy ? 'Turni Sala C.C.C.' : 'Turni DEV'

  return {
    name: nome,
    short_name: nome,
    description: isProductionDeploy
      ? 'Gestione scambi turni'
      : 'Gestione scambi turni (ambiente di sviluppo)',
    // `id` = identità stabile dell'app installata; `scope` = fin dove la PWA
    // resta «dentro di sé» (fuori dallo scope un link apre il browser, che è
    // giusto per i link esterni).
    id: '/',
    scope: '/',
    start_url: '/dashboard',
    lang: 'it',
    dir: 'ltr',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    // `#0a0a0a` è il DEFAULT del tema scuro (lib/color-defaults.ts): questi due
    // campi sono il fallback per i browser che non leggono il meta `theme-color`
    // (che invece è ADATTIVO al tema, via app/layout.tsx + ThemeColor).
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    categories: ['productivity', 'business'],
    shortcuts: SCORCIATOIE,
    // NIENTE `orientation`: la rotazione la decide il telefono (vedi la testa).
    icons: isProductionDeploy
      ? [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Variante maskable: sfondo PIERO con il 20% di margine per la maschera
          // (Android ritaglia in cerchio/rounded e scala la tela intera). Verifica
          // safe-zone: nessun pixel trasparente entro il cerchio del 40% del lato.
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ]
      : [
          { src: '/icons/icon-192-dev.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512-dev.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-192-dev.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512-dev.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
    // Le due misure sono quelle VERE dei PNG (`scripts/genera-screenshot-manifest.mjs`
    // le stampa quando le rifà): il browser scarta una screenshot la cui
    // dichiarazione non combacia col file, quindi se si rigenerano vanno
    // riallineate qui. La prova lo verifica leggendo l'header PNG.
    screenshots: [
      {
        src: '/screenshots/board-telefono.png',
        sizes: '1179x2556',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'I turni di sala del giorno',
      },
      {
        src: '/screenshots/dashboard-largo.png',
        sizes: '1440x900',
        type: 'image/png',
        form_factor: 'wide',
        label: 'La dashboard su schermo largo',
      },
    ],
  }
}
