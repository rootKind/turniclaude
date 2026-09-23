import { toast } from 'sonner'

/**
 * M12 — L'ANNULLA NELLO SNACKBAR (23/09/2026).
 *
 * Il piano lo diceva in una riga — «undo nella snackbar dove l'azione è
 * reversibile e conferma solo dove non lo è» — e la riga nasconde la domanda
 * vera: **quali** azioni sono reversibili. Le due superfici di questa app sono
 * molto diverse: le notifiche sono storia LOCALE (sta in `localStorage`: se ne
 * conserva una copia prima di toccarla, e rimetterla è esatto per definizione),
 * mentre quasi tutto il resto scrive sul database — e un `delete` sul DB non si
 * annulla con un array in memoria.
 *
 * Questo helper copre il primo caso e lo fa in un modo solo: si passa l'ISTANTANEA
 * di ciò che si sta per cambiare, e l'azione «Annulla» la rimette al suo posto.
 * La copia la prende CHI chiama (ha in mano lo stato corrente), non l'helper: un
 * helper che cattura lo stato da sé è un helper che cattura quello sbagliato — al
 * primo render invece che al momento del gesto, che è l'errore classico di questa
 * famiglia di funzioni.
 *
 * DUE DETTAGLI CHE NON SONO DETTAGLI:
 *  · **la durata** (6s) sta dentro la finestra 4-10s che Material dà agli
 *    snackbar con un'azione: 4 secondi per leggere e decidere di annullare sono
 *    pochi, 10 diventano un avviso che resta appeso. Non è un valore del design
 *    system — è la durata dell'ANNULLA, che non cambia fra le skin, quindi non
 *    entra nel contratto dei token;
 *  · **l'etichetta** è la stessa su entrambe le piattaforme («Annulla»): iOS non
 *    ha lo snackbar, ma ha l'undo, e cambiare parola per skin sarebbe cambiare
 *    vocabolario a chi cambia telefono.
 */

/** Quanto resta a disposizione per annullare. Vedi sopra: dentro la finestra di M3. */
export const DURATA_UNDO = 6000

/**
 * Mostra il messaggio con l'azione che DISFA. `istantanea` è lo stato di PRIMA:
 * chi chiama lo cattura prima di mutare, e lo restituisce così com'era.
 */
export function avvisoAnnulla(
  messaggio: string,
  annulla: () => void,
  description?: string,
) {
  return toast(messaggio, {
    description,
    duration: DURATA_UNDO,
    action: { label: 'Annulla', onClick: annulla },
  })
}
