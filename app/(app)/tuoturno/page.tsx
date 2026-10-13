import { TuoturnoBoot } from './tuoturno-boot'

/**
 * /tuoturno — «Il tuo turno»: calendario mensile personale con il turno reale
 * (dal PDF caricato) sopra e il teorico sotto. Il teorico ha tre sorgenti in
 * ordine di priorità (vedi lib/person-cycle.ts):
 *  1. riga base del PDF del mese (esatta per definizione);
 *  2. predizione dalla STORIA dei PDF (ciclo rigido o rotazione a blocchi);
 *  3. rotazione delle squadre del DB (solo ultimo fallback: il seed tronca i
 *     cicli > 28gg e non coincide con i PDF reali).
 *
 * PAGINA STATICA (13/10/2026): qui non si legge più niente dal server. La storia
 * dei PDF e il predittore (2) li prepara il CLIENT dalla cache (tuoturno-boot.tsx
 * → hooks/use-sala-data → lib/queries/tuoturno). Prima erano un server component
 * `async` che, a ogni render — e a ogni prefetch che la barra di navigazione fa da
 * sola — pagava sessione, anagrafica, albero squadre e il giro completo dei mesi
 * per produrre un HTML che era comunque il placeholder del `PwaGuard`: la pagina
 * la disegna il client. Con la pagina statica il prefetch serve HTML
 * prerenderizzato e il server smette di renderizzare ciò che il browser può
 * chiedere da sé.
 */
export default function TuoTurnoPage() {
  return <TuoturnoBoot />
}
