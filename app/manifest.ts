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
 * /manifest.json con lo stesso contenuto dinamico.
 */

const isProductionDeploy = process.env.VERCEL_GIT_COMMIT_REF === 'master'

export default function manifest(): MetadataRoute.Manifest {
  if (isProductionDeploy) {
    return {
      name: 'Turni Sala C.C.C.',
      short_name: 'Turni Sala C.C.C.',
      description: 'Gestione scambi turni',
      start_url: '/dashboard',
      display: 'standalone',
      background_color: '#0a0a0a',
      theme_color: '#0a0a0a',
      orientation: 'portrait',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        // Variante maskable: sfondo PIERO con il 20% di margine per la maschera
        // (Android ritaglia in cerchio/rounded e scala la tela intera). Verifica
        // safe-zone: nessun pixel trasparente entro il cerchio del 40% del lato.
        {
          src: '/icons/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    }
  }

  return {
    name: 'Turni DEV',
    short_name: 'Turni DEV',
    description: 'Gestione scambi turni (ambiente di sviluppo)',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'portrait',      icons: [
        { src: '/icons/icon-192-dev.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512-dev.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/icons/icon-maskable-512-dev.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
  }
}
