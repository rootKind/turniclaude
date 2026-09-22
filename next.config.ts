import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * LE TRANSIZIONI FRA PAGINE LE FA IL BROWSER — M8b del piano (23/09/2026).
   *
   * Il flag è il pezzo lato server: fa entrare il payload dei Server Component
   * DENTRO la transizione, così la fotografia del browser è già la pagina nuova.
   * **Non basta da solo**, ed è misurato: con il flag acceso una navigazione
   * client (un clic su una voce della barra) chiama `document.startViewTransition`
   * **zero volte** — il router non avvolge niente da sé. Per questo la
   * transizione si avvolge dove la navigazione nasce, cioè nell'intercettatore
   * di clic (`components/providers/transizioni-pagina.tsx`), che chiama lo stesso
   * `router.push` ma dentro `startViewTransition`.
   *
   * Da lì viene anche il **predictive back** di Chrome Android: il gesto
   * indietro di sistema usa la transizione dichiarata per quel viaggio per
   * disegnare l'anteprima — sul web non c'è altro modo di averlo. Su WebKit la
   * transizione non parte affatto (la fotografia del motore fa crashare la
   * pagina: vedi `usaWebKit`), quindi l'arrivo resta la molla di M8.
   */
  experimental: {
    viewTransition: true,
  },
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
