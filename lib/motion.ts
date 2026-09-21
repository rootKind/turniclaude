/**
 * IL MOTO — M7 del design system (22/09/2026).
 *
 * Perché esiste questo file: da M1 a M6 il movimento dell'app era **tempo +
 * cubic-bezier** (`--motion-duration-*`, `--motion-ease-standard`), cioè una
 * approssimazione scritta a mano. Material 3 Expressive ha sostituito quel sistema
 * con uno **a molle**: non «quanto dura», ma quanta rigidità e quanta resistenza.
 * Il motivo non è estetico — una durata fissa non sa quanto è lungo il viaggio,
 * una molla sì (parte veloce se è lontano, si posa piano se è vicino).
 *
 * Il paradosso da risolvere: il CSS non ha le molle. Ha `linear()`, che è una
 * polilinea — e una polilinea, campionata bene, È una molla. Quindi qui c'è la
 * matematica (fisica del sistema massa-molla-smorzatore, massa 1) e la
 * conversione in una stringa `linear(...)` che il foglio di stile può usare come
 * `animation-timing-function` / `transition-timing-function`.
 *
 * CONSEGUENZA IMPORTANTE, e la ragione per cui questo file genera anche le
 * DURATE: in CSS la molla va in coppia con una durata, e la durata giusta è il
 * tempo di assestamento della molla (`assestamento`, in secondi). Se la durata
 * resta quella di prima, il campione viene tagliato a metà e la molla non si
 * sente. Per questo `scripts/check-motion.mjs` verifica che i valori nei token
 * siano ESATTAMENTE quelli calcolati qui: le durate non possono divergere dalle
 * molle che le governano.
 *
 * Da dove vengono i numeri:
 *  - **Android (Material 3)**: le sei molle della libreria ufficiale
 *    (`damping` = rapporto di smorzamento, `stiffness` = rigidità), documentate
 *    in material-components-android → docs/theming/Motion.md. Material le
 *    distingue per **velocità** (fast / default / slow: sceglie la dimensione o la
 *    distanza percorsa) e per **famiglia**: `spatial` per ciò che si sposta
 *    (posizione, dimensione) e `effects` per colore e opacità — che NON devono
 *    mai superare il bersaglio (un'alpha sopra 100% è un difetto, non un
 *    rimbalzo). Questa seconda distinzione è la parte che si sbaglia sempre.
 *  - **iOS**: il vocabolario di riferimento è quello di SwiftUI — «risposta» (il
 *    tempo per arrivare al bersaglio, in secondi) e «frazione di smorzamento» —
 *    quindi qui c'è la conversione (`daRisposta`), non una seconda tabella.
 *
 * Il catalogo è più grande di quello che il foglio di stile espone: in CSS
 * scendono solo le molle che hanno un consumatore vero (il contratto dei token
 * vieta un token che non disegna niente — vedi `check-design-tokens.mjs`).
 * `MOLLE_M3` è la fonte completa; i token escono man mano che le milestone li
 * usano.
 */

/** Una molla nel linguaggio di Material: rapporto di smorzamento + rigidità. */
export interface Molla {
  /** Rapporto di smorzamento ζ: 1 = nessun rimbalzo, < 1 = rimbalza. */
  damping: number
  /** Rigidità k: più è alta, più la molla è rapida. */
  stiffness: number
}

/** Le due famiglie di Material, e la regola che le separa. */
export type Famiglia = 'spatial' | 'effects'

/**
 * LE SEI MOLLE DI MATERIAL 3 (valori della libreria ufficiale, massa 1).
 *
 * `standard` è lo schema sobrio, quello documentato nei valori di default;
 * `espresso` è lo schema di M3 Expressive, che per definizione è più vivace.
 * **Come lo esprimiamo**: la rigidità resta quella dichiarata, lo smorzamento
 * delle molle `spatial` scende da 0.9 a 0.7 (più rimbalzo) mentre le `effects`
 * restano a 1 — perché la regola delle effects («il valore non deve superare il
 * bersaglio») vale anche quando il resto della UI è espressivo. È una
 * approssimazione dichiarata: le due tabelle della spec (spring compositi e loro
 * approssimazione in cubic-bezier) sono pubblicate su m3.material.io, che non è
 * leggibile da uno script — quindi la fonte dei numeri qui è la libreria
 * Android, e la differenza fra gli schemi è resa con un parametro esplicito.
 */
export const MOLLE_M3 = {
  standard: {
    fast: {
      spatial: { damping: 0.9, stiffness: 1400 },
      effects: { damping: 1, stiffness: 3800 },
    },
    default: {
      spatial: { damping: 0.9, stiffness: 700 },
      effects: { damping: 1, stiffness: 1600 },
    },
    slow: {
      spatial: { damping: 0.9, stiffness: 300 },
      effects: { damping: 1, stiffness: 800 },
    },
  },
  espresso: {
    fast: {
      spatial: { damping: 0.7, stiffness: 1400 },
      effects: { damping: 1, stiffness: 3800 },
    },
    default: {
      spatial: { damping: 0.7, stiffness: 700 },
      effects: { damping: 1, stiffness: 1600 },
    },
    slow: {
      spatial: { damping: 0.7, stiffness: 300 },
      effects: { damping: 1, stiffness: 800 },
    },
  },
} as const

/**
 * Da SwiftUI a Material: «risposta» (secondi per arrivare al bersaglio) e
 * «frazione di smorzamento» diventano rigidità e damping.
 *
 * Con massa 1, la pulsazione propria è `ω₀ = 2π / risposta`, quindi
 * `k = ω₀²`; la frazione di smorzamento è già lo ζ che Material chiama damping.
 */
export function daRisposta(risposta: { response: number; dampingFraction: number }): Molla {
  const omega0 = (2 * Math.PI) / risposta.response
  return { damping: risposta.dampingFraction, stiffness: omega0 * omega0 }
}

/**
 * LE MOLLE iOS — il trio di riferimento (le stesse tre che i riferimenti iOS 26
 * usano per tap, fogli e arrivi giocosi), qui tradotte in rigidità.
 *
 * I valori di risposta sono scelti perché il tempo di assestamento cada DOVE
 * CADEVA la durata scritta a mano che sostituiscono (≈330ms per il tap, ≈330ms
 * per il foglio, ≈220ms per una dissolvenza): così M7 non cambia il passo
 * dell'app, cambia solo la curva — che è ciò che rende il movimento «liquido»
 * invece che meccanico.
 */
export const MOLLE_IOS = {
  /** Il controllo che torna su dopo il tocco: piccola distanza, arrivo vivo. */
  snappy: daRisposta({ response: 0.2, dampingFraction: 0.8 }),
  /**
   * Un pannello che sale: distanza breve, arrivo deciso.
   *
   * Nota sullo smorzamento: 0.7 dà il 4.6% di rimbalzo, che è esattamente quanto
   * dà la molla `spatial fast` espressiva di Material (ζ 0.7) che sta dall'altra
   * parte. Le due piattaforme non devono muoversi allo stesso *tempo* — iOS ha il
   * suo passo — ma devono «sentirsi» uguali, e l'ampiezza del rimbalzo è ciò che
   * si sente. Con ζ 0.8 il rimbalzo sarebbe stato dell'1.5%: invisibile, cioè
   * espressivo solo sulla carta.
   */
  pop: daRisposta({ response: 0.22, dampingFraction: 0.7 }),
  /** Un velo o un colore: nessun rimbalzo (una dissolvenza che rimbalza è un difetto). */
  fade: daRisposta({ response: 0.2, dampingFraction: 1 }),
} as const

/**
 * Dove si trova la molla al tempo `t` (secondi). 0 = partenza, 1 = bersaglio;
 * sopra 1 significa che ha superato il bersaglio (il rimbalzo).
 *
 * Sistema massa-molla-smorzatore con massa 1:
 *   ω₀ = √k,  ζ = damping
 * e tre forme della soluzione: sotto-smorzata (ζ<1, quella che rimbalza),
 * criticamente smorzata (ζ=1, il ritorno più rapido senza rimbalzo) e
 * sovra-smorzata (ζ>1, ritorno lento e senza vita).
 */
export function posizione(molla: Molla, t: number): number {
  const w0 = Math.sqrt(molla.stiffness)
  const z = molla.damping

  // Sotto-smorzata: la forma con cos/sin, ed è l'unica che supera 1.
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z)
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t))
  }
  // Criticamente smorzata: il caso limite del ritorno più rapido.
  if (z === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t)
  // Sovra-smorzata: due esponenziali reali invece di una oscillazione.
  const r = w0 * Math.sqrt(z * z - 1)
  return 1 - Math.exp(-z * w0 * t) * (Math.cosh(r * t) + ((z * w0) / r) * Math.sinh(r * t))
}

/** Quanto la molla supera il bersaglio al massimo (0 = non lo supera mai). */
export function rimbalzo(molla: Molla): number {
  if (molla.damping >= 1) return 0
  let massimo = 0
  for (let t = 0; t <= 2; t += 0.002) massimo = Math.max(massimo, posizione(molla, t) - 1)
  return massimo
}

/**
 * QUANDO LA MOLLA È FERMA (secondi): il più piccolo T tale che da lì in poi non
 * si muova più di un millesimo. È questo numero a diventare la durata nel CSS —
 * non un valore scelto a occhio.
 *
 * Non c'è una formula chiusa che valga per tutti e tre i regimi (rimbalzante,
 * critico, sovra-smorzato), e per lo smorzamento critico l'inviluppo non è una
 * semplice esponenziale: quindi si misura, campionando all'indietro. È la stessa
 * scelta di `lib/color.ts`, che misura il contrasto invece di stimarlo.
 */
export function assestamento(molla: Molla, tolleranza = 0.001): number {
  const passo = 0.002
  for (let t = 2; t > 0; t -= passo) {
    if (Math.abs(1 - posizione(molla, t)) > tolleranza) return Math.min(t + passo, 2)
  }
  return passo
}

/** Millisecondi, arrotondati alle decine: quello che si scrive in un token di durata. */
export function assestamentoMs(molla: Molla): number {
  return Math.round((assestamento(molla) * 1000) / 10) * 10
}

/**
 * LA MOLLA COME EASING DEL CSS: `linear(0, y₁ p₁%, …, 1)`.
 *
 * `linear()` interpola linearmente fra i punti, quindi una molla campionata
 * abbastanza fitta È la molla (l'errore è quello della spezzata, e con 32 punti
 * su un assestamento di poche centinaia di millisecondi è sotto il pixel).
 * I valori possono uscire da [0,1]: è così che si esprime il rimbalzo.
 *
 * `punti` è il numero di campioni (32 di default): più punti, più precisione,
 * più byte nel foglio di stile — e i token generati sono già ~400 caratteri
 * l'uno, quindi la taratura è fra queste due cose.
 */
export function linearDaMolla(molla: Molla, punti = 32, decimali = 3): string {
  const totale = assestamento(molla)
  const valori: string[] = ['0']
  for (let i = 1; i <= punti; i++) {
    const t = (totale * i) / punti
    const y = posizione(molla, t)
    valori.push(`${arrotonda(y, decimali)} ${arrotonda((100 * i) / punti, 1)}%`)
  }
  return `linear(${valori.join(', ')})`
}

function arrotonda(n: number, decimali: number): number {
  const f = 10 ** decimali
  return Math.round(n * f) / f
}

/**
 * LE MOLLE CHE IL FOGLIO DI STILE ESPONE, per ruolo.
 *
 * La regola con cui si scelgono è quella di Material, e non è «una molla a
 * caso»: si guarda **cosa** si anima e **quanto** è grande il viaggio.
 *   - `press`  → un controllo che torna su: distanza minima, ritorno immediato
 *                (famiglia *effects* su Android: il gesto è soprattutto colore e
 *                luce, e non deve superare il bersaglio);
 *   - `pop`    → un pannello piccolo che sale (il foglio delle azioni, il
 *                selettore mese): distanza breve, arrivo vivo (famiglia
 *                *spatial*);
 *   - `fade`   → velo e trasparenze: nessun rimbalzo, mai.
 *
 * Il resto del catalogo (le `slow` per gli schermi interi, le `default` per le
 * superfici che viaggiano) arriva con le milestone che lo usano: M8 per i fogli
 * trascinabili, M9 per i morph.
 */
export const TOKEN_MOTO = [
  { token: '--motion-spring-press', ios: MOLLE_IOS.snappy, android: MOLLE_M3.espresso.fast.effects, ruolo: 'press' },
  { token: '--motion-spring-pop', ios: MOLLE_IOS.pop, android: MOLLE_M3.espresso.fast.spatial, ruolo: 'pop' },
  { token: '--motion-spring-fade', ios: MOLLE_IOS.fade, android: MOLLE_M3.espresso.default.effects, ruolo: 'fade' },
] as const

/**
 * L'ALTRA META' DEL MOTO: l'easing a durate di Material, quello che resta ai
 * movimenti OSSERVATI (velo, barra di avanzamento, scheletro) — dove una molla
 * non racconta niente perché è il sistema che scorre, non la persona che agisce.
 *
 * Questi due valori sono anche i token `--motion-ease-standard` dei due blocchi di
 * piattaforma, e `scripts/check-motion.mjs` pretende che coincidano: se un giorno
 * qualcuno cambiasse la curva nel foglio di stile senza passare da qui, la sonda
 * mostrerebbe un confronto falso — cioè proprio la cosa che serve a decidere.
 */
export const EASING_OSSERVATO = {
  ios: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
  android: 'cubic-bezier(0.2, 0, 0, 1)',
} as const

/** Il nome leggibile del ruolo, per la sonda e per i messaggi del contratto. */
export const RUOLO_MOTO: Record<string, string> = {
  press: 'Il controllo che torna su (dopo il tocco)',
  pop: 'Il pannello piccolo che sale (foglio azioni, mese)',
  fade: 'Il velo e le trasparenze (scrim, toast)',
}
