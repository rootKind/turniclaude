import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // LA RIGA DI VERSIONE IN IMPOSTAZIONI (richiesta 18/09/2026). Vercel conosce,
  // a BUILD time, il commit del deploy (`VERCEL_GIT_COMMIT_SHA`) e il momento in
  // cui compila: cotti qui sotto forma di `NEXT_PUBLIC_*` arrivano al browser, e
  // la riga `V5 · <commit> · ultimo aggiornamento: <data e ora>` dice la verità
  // da sola, senza che nessuno debba ricordarsi di aggiornarla (era il difetto
  // della stringa scritta a mano: «v1.226 · 6eb0c28 — … 26/08/2026»).
  env: {
    NEXT_PUBLIC_APP_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? '',
    NEXT_PUBLIC_APP_BUILD_TIME: new Date().toISOString(),
  },
  serverExternalPackages: ['pdf-parse'],
  // Il worktree convive con pnpm-workspace.yaml della root pwa-v2: Turbopack
  // inferiva il root SBAGLIATO (tutte le route 404). Lo fissiamo alla dir del
  // progetto (vedi warning 'inferred your workspace root').
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig
