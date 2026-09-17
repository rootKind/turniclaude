import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { aggiornaCampione, aggiornaVoce, rimuoviVoce, type Campione, type VoceRichiesta } from '@/lib/theme-inspector'

/**
 * STATO DELLA SONDA COLORI (richiesta 17/09/2026).
 *
 * Tre cose sole, tutte PERSISTITE su questo dispositivo:
 *
 *  - `armata`: la sonda è accesa. Non è più «il tocco seleziona invece di
 *    navigare» (richiesta 17/09/2026, seconda versione: navigare deve restare
 *    possibile): è «la pressione prolungata campiona». Deve sopravvivere alla
 *    navigazione — è il senso della sonda: la accendi dal pannello admin e poi
 *    giri per l'app a raccogliere colori.
 *  - `voci`: le modifiche richieste finora, con il colore di partenza. Si
 *    accumulano fra una pagina e l'altra e finiscono tutte nella richiesta
 *    finale da copiare.
 *  - `campioni`: i colori GUARDATI, non modificati. Servono ad altro: tenere
 *    scritto com'è fatto un elemento su una pagina mentre si va a vedere lo
 *    stesso elemento su un'altra («il mio focus è verificare la coerenza di un
 *    tema fra pagine diverse»).
 *
 * NON c'è nessun salvataggio nel database: l'anteprima è di questo dispositivo e
 * la richiesta la leggo io (decisione 17/09/2026 — la memoria del progetto vieta
 * di reintrodurre gli override globali).
 */
interface ThemeInspectorState {
  armata: boolean
  voci: VoceRichiesta[]
  campioni: Campione[]
  setArmata: (v: boolean) => void
  /** Aggiunge o sostituisce la modifica dello stesso slot. */
  segna: (voce: VoceRichiesta) => void
  /** Riporta lo slot al colore di partenza: non c'è più niente da chiedere. */
  dimentica: (id: string) => void
  azzera: () => void
  /** Mette un colore nel campionario (fotografia, non modifica). */
  campiona: (campione: Campione) => void
  /**
   * Rinomina un GRUPPO di campioni: il nome è la chiave del confronto, e
   * cambiarlo è come dire «questi due sono la stessa cosa» (o smettere di
   * dirlo). Rinominarne uno solo lascierebbe il gruppo spaccato in due.
   */
  rinomina: (tema: string, nome: string, nuovo: string) => void
  scarta: (id: string) => void
  svuotaCampionario: () => void
}

export const useThemeInspectorStore = create<ThemeInspectorState>()(
  persist(
    set => ({
      armata: false,
      voci: [],
      campioni: [],
      setArmata: v => set({ armata: v }),
      segna: voce => set(s => ({ voci: aggiornaVoce(s.voci, voce) })),
      dimentica: id => set(s => ({ voci: rimuoviVoce(s.voci, id) })),
      azzera: () => set({ voci: [] }),
      campiona: campione => set(s => ({ campioni: aggiornaCampione(s.campioni, campione) })),
      rinomina: (tema, nome, nuovo) =>
        set(s => ({
          campioni: s.campioni.map(c =>
            c.tema === tema && c.nome.trim().toLowerCase() === nome.trim().toLowerCase() ? { ...c, nome: nuovo } : c,
          ),
        })),
      scarta: id => set(s => ({ campioni: s.campioni.filter(c => c.id !== id) })),
      svuotaCampionario: () => set({ campioni: [] }),
    }),
    {
      name: 'sonda-colori',
      // La `pausa` della prima versione non esiste più (i tocchi non si
      // bloccano): di uno stato salvato si tiene solo quello che si conosce.
      partialize: s => ({ armata: s.armata, voci: s.voci, campioni: s.campioni }),
    },
  ),
)
