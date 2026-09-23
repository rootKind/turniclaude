'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * M12 — LA DIMENSIONE DEL TESTO, SCELTA DALL'UTENTE (23/09/2026).
 *
 * Il piano la chiamava «preferenza in-app per la dimensione del testo (usa
 * `--type-scale` di M6)». M6 ha lasciato il token pronto, e il token è la strada
 * giusta per i testi che NASCONO da lui — la scala `--fs-*` (`text-caption`,
 * `text-body`, `text-title3`…). Ma il grosso dell'app scrive le misure con le
 * classi di Tailwind (`text-xs`, `text-sm`, `text-lg`), che sono in `rem` e non
 * leggono nessun token nostro: una preferenza appoggiata solo a `--type-scale`
 * avrebbe ingrandito le intestazioni e lasciato piccoli i cognomi della board —
 * cioè esattamente il pubblico che chiede di ingrandire.
 *
 * Quindi il gradino si applica alla **misura di base del documento**
 * (`html { font-size: N% }`): da lì scalano TUTTI i `rem`, che sono sia la scala
 * `--fs-*` sia le classi di Tailwind. Due conseguenze, entrambe volute:
 *
 *  · è una PERCENTUALE, non un numero di pixel: compone con la preferenza di
 *    sistema che l'utente ha già nel browser invece di sovrascriverla (chi ha il
 *    browser a 20px di base e sceglie «Grande» legge 25px, non 20);
 *  · **`--type-scale` resta 1**. Se anche lui seguisse il gradino, ogni token
 *    `--fs-*` (che è `calc(0.75rem * var(--type-scale))`) scalerebbe DUE volte:
 *    una dal `rem` e una dal moltiplicatore. Il token resta il moltiplicatore di
 *    ripiego per chi un giorno volesse una scala testuale che non tocchi le
 *    spaziature — non è il posto dove girare questa preferenza.
 *
 * PERCHÉ NON SI SALVA SUL PROFILO. Non è una preferenza dell'account: è del
 * DISPOSITIVO (e di chi ci legge), come la dimensione del testo del browser.
 * Vive in `localStorage`, e come tutto il resto viene cancellata al logout
 * (`clearAllLocalData`): conseguenza dichiarata — chi cambia utente se la
 * ritrova da scegliere. Il contrario (sopravvivere al logout) significherebbe
 * tenere un dato di un utente addosso al successivo, che in questa app è una
 * regola scritta.
 *
 * Lo stato vive fuori da React (`localStorage` + attributo sul `<html>`), e si
 * legge con `useSyncExternalStore`: niente `setState` dentro un effetto (la
 * cascata di render che il lint boccia e che questa pagina portava dietro) e
 * niente mismatch di idratazione — il server disegna il gradino normale, il
 * client si allinea subito dopo senza che React se ne accorga.
 */
export const TEXT_SCALE_KEY = 'turni-text-scale'

/** I gradini, nell'ordine in cui si mostrano. `fattore` è la percentuale sul default. */
export const GRADINI_TESTO = [
  { id: 'piccolo', label: 'Piccolo', fattore: 0.9 },
  { id: 'normale', label: 'Normale', fattore: 1 },
  { id: 'grande', label: 'Grande', fattore: 1.125 },
  { id: 'massimo', label: 'Massimo', fattore: 1.25 },
] as const

export type GradinoTesto = (typeof GRADINI_TESTO)[number]['id']

const PREDEFINITO: GradinoTesto = 'normale'

const ascoltatori = new Set<() => void>()

/** Un gradino salvato che non esiste più (rinominato, o storage manomesso) torna al predefinito. */
function gradinoSalvato(): GradinoTesto {
  try {
    const salvato = localStorage.getItem(TEXT_SCALE_KEY)
    if (salvato && GRADINI_TESTO.some((g) => g.id === salvato)) return salvato as GradinoTesto
  } catch {
    // Storage negato (Safari privato, cookie bloccati): si resta sul predefinito.
  }
  return PREDEFINITO
}

function iscrivi(callback: () => void) {
  ascoltatori.add(callback)
  // Un'altra scheda che cambia il gradino aggiorna anche questa (`storage` è
  // l'unico evento che attraversa le schede): senza, due schede aperte
  // mostrerebbero due dimensioni diverse fino al reload.
  const suStorage = (event: StorageEvent) => {
    if (event.key === TEXT_SCALE_KEY) callback()
  }
  window.addEventListener('storage', suStorage)
  return () => {
    ascoltatori.delete(callback)
    window.removeEventListener('storage', suStorage)
  }
}

/**
 * Il gradino sul documento: la percentuale va su `html`, così vale per tutto
 * (contenuto, portali, overlay) e non solo per il sottoalbero di un provider.
 * `data-text-scale` è il marcatore delle prove E2E (e la spia per chi guarda il
 * DOM cercando di capire perché il testo è più grande).
 */
function applica(gradino: GradinoTesto) {
  const fattore = GRADINI_TESTO.find((g) => g.id === gradino)?.fattore ?? 1
  const root = document.documentElement
  root.style.fontSize = `${fattore * 100}%`
  root.setAttribute('data-text-scale', gradino)
}

export function TextScale() {
  const gradino = useSyncExternalStore(iscrivi, gradinoSalvato, () => PREDEFINITO)
  useEffect(() => {
    applica(gradino)
  }, [gradino])
  return null
}

/** Il gradino corrente e il modo di cambiarlo (usato da Impostazioni). */
export function useTextScale(): [GradinoTesto, (gradino: GradinoTesto) => void] {
  const gradino = useSyncExternalStore(iscrivi, gradinoSalvato, () => PREDEFINITO)
  const cambia = (nuovo: GradinoTesto) => {
    try {
      localStorage.setItem(TEXT_SCALE_KEY, nuovo)
    } catch {
      // Se lo storage non è disponibile la preferenza vale per questa sessione:
      // l'effetto la applica comunque, perché lo stato passa dagli ascoltatori.
    }
    applica(nuovo)
    ascoltatori.forEach((ascoltatore) => ascoltatore())
  }
  return [gradino, cambia]
}
