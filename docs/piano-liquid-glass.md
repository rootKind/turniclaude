# Piano M6–M12 — Material 3 Expressive (Android) e Liquid Glass (iOS)

Stato analizzato: **dev @7a2bcdc**, M6 **implementata** in `f437402`, M7
**implementata** in `fbaed52`, M8 **implementata** in `0eb8ca3` con la sua coda
**M8b** in `7a2bcdc`, M9 **chiusa**, M10 **implementata**, M11 **implementata** e M12
**chiusa salvo la coda dichiarata** (M12f: la rail; M12b: l'annulla e le vie d'uscita).
Lo stato puntuale di ogni milestone è nelle sue tabelle, più in basso: le voci date per
*fuori* sono dichiarate una per una e non vanno date per fatte.
Seguito di `docs/audit-ios-material.md` (audit del 19/09, *prima* delle milestone
M1–M5): non ripete quello che le M1–M5 hanno fatto, dice cosa manca e in che
ordine farlo.

**Bersaglio deciso:** Android insegue **Material 3 Expressive**; iOS insegue le
**HIG 26** con il materiale **Liquid Glass**. Il desktop resta identico al pixel
(ogni regola nuova vive sotto `[data-platform='ios'|'android']`).

**Tre avvertenze oneste, che valgono per tutto il piano.**

1. **M3 Expressive non esiste su web in forma ufficiale.** Material Web
   Components sono in manutenzione: la spec espressiva è Compose-first. Esiste un
   *fork* della community (`material-esm/material`, componenti Lit) che ha anche
   una demo Expressive — valutato qui sotto, conclusione: **riferimento, non
   dipendenza**. Quello che adottiamo lo approssimiamo con i nostri token, e ogni
   scostamento va scritto nel codice, perché nessuna libreria ce lo ricorderà.
2. **Liquid Glass non è una proprietà CSS.** È un composito di sei livelli
   (sfocatura + tinta + bordo + luce di bordo + ombra + grana) più la risposta al
   tocco. Sul web se ne approssimano cinque; la rifrazione vera no.
3. **Il vetro è un regalo a iOS, il resto è lavoro su due piattaforme** (§4): la
   parte PWA e il back di sistema sono quasi tutti Android.

**Metodo.** Codice di `dev` letto componente per componente, le due guide
(HIG 26 / M3 e M3 Expressive), e per ogni proprietà nuova la verifica del supporto
reale nei browser che ci interessano (Safari 26, Chrome Android). Ogni voce ha una
prova nel codice o nella guida.

---

## 1. Dove siamo (M1–M5: le fondamenta che non si toccano)

| Livello | Stato |
|---|---|
| Piattaforma decisa dal server (`data-platform` nell'HTML iniziale) | fatto, puro e testato |
| Token a due livelli (semantici → piattaforma) + utility tipografiche `@theme inline` | fatto |
| Contratto `scripts/check-design-tokens.mjs` (chiavi pari, skin viva, utility, WCAG, ratchet **+ token mai letti**) | fatto (M6) |
| Contratto `scripts/check-motion.mjs` (molle generate, durate derivate, effects che non rimbalzano, easing che chiude) | fatto (M7, esteso in M8) |
| Contratto E2E `tests/design-piattaforma.spec.ts` su motori veri | fatto, esteso in M6, M7 e M8 |
| Skin iOS dei controlli (switch 51×31, campo a inserto, segmented, chip 32) | fatto |
| Skin Android dei controlli (state layer, ripple dal dito, campo M3, switch 52×32) | fatto |
| Safe area (ora anche laterali), `dvh`/`svh`, `prefers-reduced-motion` | fatto (M6 completa i lati) |
| Barra di navigazione + superficie delle azioni con scriminatura | fatto (M2) |
| Moto a molle (fisica generata in CSS, due schemi, pressione per piattaforma) | fatto (M7) |
| Barra a **isola** su iOS e a **banda** altrove, con lo stato «scrolled» | fatto (M8) |
| **Back di sistema** che chiude l'overlay più in alto (Android) | fatto (M8) |
| **Fogli trascinabili** dalla maniglia, con la molla viva | fatto (M8) |
| Arrivo di pagina a molla (`--motion-duration-enter` + molla `pop`) | fatto (M8, al posto della dissolvenza scritta a mano) |
| **Testata di pagina**: titolo grande iOS che scorre via, top app bar di Android, desktop intatto | fatto (M8b) |
| **Gesto di ritorno dal bordo** su iOS, con la molla viva e tre rifiuti dichiarati | fatto (M8b) |
| **Transizioni fra pagine disegnate dal browser** (`startViewTransition`) + predictive back Android | fatto (M8b) |

Mancano: le **forme espressive** (nessun morph), il **vetro**, la **PWA** e
l'**adattività**.

---

## 2. Gap, con la prova

### A. Aree di tocco — HIG 44pt / M3 48dp · ALTA
`--touch-min` era consumato in **4 punti**. Risolto in M6 per iOS (allargamento
invisibile a 44pt, verificato su Chromium e WebKit); su Android **non è possibile
allargare in modo invisibile** — il ripple obbliga `overflow: hidden` — quindi la
via è la **taglia vera** e tocca a M9 (scala XS–XL). I campi di testo (`h-8`,
32px) restano da fare: crescerli è un lavoro di forme, non di igiene.

### B. `overscroll` e catene di scorrimento · ALTA → risolta in M6
In standalone la pagina non si ricarica più tirando dal fondo; i contenitori
dentro un overlay non trascinano più la pagina sotto; la tabella di confronto non
sfonda più nello swipe di sistema.

### C. Niente moto fisico · ALTA (è il cuore di M3 Expressive) → **risolta in M7**
Tutto il movimento era tempo + `cubic-bezier`. Ora la fisica sta in `lib/motion.ts`
(massa 1: posizione, rimbalzo, assestamento) e scende in CSS come `linear()`
campionata: le sei molle di Material (spatial/effects × fast/default/slow) nei due
schemi, il trio iOS in linguaggio SwiftUI, e le durate **derivate**
dall'assestamento. Restava scritto a mano un solo movimento guidato — la molla del
gesto di trascinamento dei fogli, che non è esprimibile con una `linear()`: è
arrivata in **M8** (`hooks/use-drag-to-close.ts`, Web Animations, integrata dalla
stessa fisica).

### D. Niente forme espressive · ALTA (Android)
M3 Expressivo è, in gran parte, **forma che cambia stato**: la voce attiva della
navigation bar si allunga e si squadra, l'icona selezionata passa da cerchio a
quadrato, il pollice dello switch si squadra da acceso, l'elemento scelto di un
button group cambia raggio **e larghezza** (e i vicini si spostano), il FAB esteso
si ritira in cerchio, il menu dello split button ruota e si squadra, il loading
indicator morfa fra **sette forme**. Qui la pillola della voce attiva è statica
(`--nav-indicator`) e non esiste nessun morph.

### E. Il bersaglio tipografico espressivo non c'è · MEDIA
M3 Expressive aggiunge gli stili **emphasized** (stessa misura, peso e presenza
maggiori: è così che «l'occhio si ferma»). Qui il vocabolario è solo la scala di
misura. (La scalabilità del testo è stata sistemata in M6: `rem` × `--type-scale`.)

### F. Chrome di navigazione assente · ALTA → **risolta in M8, con una coda (M8b)**
Le due cose che il piano chiamava per nome sono fatte:

- **Il back di sistema di Android chiude l'overlay più in alto**, invece di uscire
  dalla pagina (era il difetto più grave della metà Android, e invisibile da un
  iPhone). Contratto unico: `hooks/use-back-to-close.ts`, montato **una volta** in
  `components/ui/dialog.tsx` e in `nav-action-surface.tsx`.
- **La barra è un'isola su iOS e una banda altrove**, e bordo/ombra sono uno
  **stato** («scrolled»), non un decoro sempre accesso: lo scrive il componente
  (`data-scrolled`), lo disegna il token di piattaforma.

Resta per **M8b**: il titolo grande che si riduce scorrendo e il **gesto di
ritorno dal bordo** su iOS (in standalone WebKit non naviga col gesto), la **top
app bar** di Android (small/medium, con lo stato «scrolled» che già esiste), e
`@view-transition { navigation: auto }` per il **predictive back** al posto
dell'arrivo di pagina scritto a mano (che in M8 è comunque diventato una molla
vera, non una dissolvenza).

### G. I fogli non si trascinano · MEDIA-ALTA → **risolta in M8**
`dialog.tsx` disegnava la scriminatura ma il foglio non si chiudeva trascinando:
un'affordance che insegna un gesto che non esiste. Ora la maniglia è vera
(`.drag-handle`), e il rilascio decide uscita o ritorno dalla **velocità** del
dito, non solo dalla distanza.

### H. Liquid Glass: 1 livello su 6 · ALTA (iOS)
La barra ha `blur(20px) saturate(180%)` su `color-mix(background 82%)`; da M6 ha
anche bordo e luce di bordo (e il loro spegnimento accessibile). Mancano ombra
adattiva, grana e **la risposta al tocco**. La geometria pre-26 è stata chiusa in
M8: la barra è ora la **capsula flottante** (8pt di distacco, raggio 999px).
Trappole misurate: **il vetro non campiona il vetro** (due `backdrop-filter`
sovrapposti danno nero/grigio, e la superficie delle azioni sta *esattamente*
sopra la barra); **`corner-shape: squircle` è solo Chromium 139+**; **costo GPU**
(budget: 3 superfici).

### I. PWA e chrome di sistema · ALTA
- `orientation: 'portrait'` in entrambi i blocchi del manifest: la board
  orizzontale non ruota. **Difetto solo Android** (Safari non implementa
  `orientation`), anzi Chrome ignora il blocco di rotazione dell'utente.
- `theme_color`/`background_color` fissi `#0a0a0a` → splash e barra di stato scuri
  su Android anche in tema chiaro.
- **Safari 26 non legge più il meta `theme-color`**: il chrome lo ricava dallo
  sfondo della pagina. Qui il chrome è impostato *solo* via meta.
- **iOS 26.1**: `black-translucent` non disegna più a tutto schermo in standalone
  → il vetro sotto la barra di stato **non è un obiettivo**.
- Manifest incompleto: mancano `scope`, `id`, `lang`, `dir`, `shortcuts`,
  `categories`, `display_override`, `screenshots`, e la `icon-maskable-192` che
  esiste già. Su Android si vedono tutte.
- **Zero stato offline**: nessun `navigator.onLine`, nessun evento `online`.

### J. Adattività assente · MEDIA
Tutte le pagine sono `max-w-lg mx-auto`. Su un tablet Android la barra in basso è
fuori specifica (M3 vuole una **navigation rail** da 600dp in su — arrivata in M12f); su iPad manca il
layout largo. Nota per M12, da M8: fuori da iOS la banda della barra è **a tutta
larghezza** e il contenuto resta limitato ai 32rem (è la struttura di M2); su iOS
l'isola ha la larghezza del telefono.

### K. Token dichiarati e mai letti · ALTA (era MEDIA: si è rivelato un difetto di
sostanza, non di forma) → **risolta in M6**, con un seguito in M7
`--elevation-nav` dichiarato in quattro posti e letto da nessuno; **`--font-ui`
mai applicato**, quindi su iPhone l'app disegnava Geist e la skin iOS non usava il
font di sistema (la prova E2E controllava il token, non il font disegnato).
`--radius-card` senza lettori: rimosso. Il contratto ora boccia un token di
piattaforma senza lettore — e in M7 ha ripreso lo stesso difetto in piccolo:
`--motion-spring-press` era dichiarato su **Android** e non lo leggeva nessuno
(il rilascio della pressione usava una bezier del web). In M8 il controllo ha
tenuto: `--nav-inset`, `--nav-radius`, `--nav-space` e `--nav-edge` hanno un
lettore vero nell'istante in cui nascono.

### L. Accessibilità e comodità · MEDIA
M6 ha fatto: tap-highlight, riduzione trasparenza/contrasto, scala del testo,
safe area laterali. M7 ha aggiunto: il collasso delle molle con
`prefers-reduced-motion` in **un punto solo**. M8 ha aggiunto: il gesto
trascinato che con «riduci movimento» non ha una molla da guardare (la chiusura è
immediata, il ritorno istantaneo — la stessa promessa, applicata a un gesto).
Restano: `role="status"`/`aria-live` fuori dai toast, aptica su Android (usata una
volta sola), **undo** invece della conferma dove è reversibile (M3),
`inputMode`/`enterKeyHint` in tre punti soltanto, stati offline.

---

## 3. Le milestone

L'ordine non è arbitrario: M6 è il prerequisito, M7 dà la **fisica** — perché sia
il vetro sia le forme espressive sono moto, prima che disegno —, M8 il chrome, poi
le due metà visibili (M9 espressivo, M10 vetro), poi la PWA e infine adattività e
rifiniture.

### M6 — Igiene, contratti e i primi due livelli del vetro ✅ `f437402`
Fatto: `overscroll` (standalone / overlay / orizzontale), tap-highlight,
`text-size-adjust`, scala in `rem` × `--type-scale`, safe area laterali, area di
tocco iOS a 44pt (misurata su Chromium e WebKit) con il perché scritto del perché
su Android non si può, `--glass-rim`/`--glass-highlight` con
`prefers-reduced-transparency` e `prefers-contrast`, il font di piattaforma
finalmente **applicato**, l'elevazione della barra su Android, il controllo sui
token mai letti nel contratto e le prove E2E estese (token risolti in px, font
disegnato, area di tocco).
Resta da fare in M6 (o da spostare): `role="status"` di base — meglio in M12 col
giro di accessibilità.

### M7 — Il motore di moto (molle, due schemi) ✅ `fbaed52`
1. **Token di molla composti** (damping + stiffness, come la spec) per le due
   famiglie — **spatial** (posizione/dimensione) ed **effects** (colore/opacità) —
   per tre velocità (fast/default/slow) e due schemi (**standard** sobrio /
   **espressivo** rimbalzante); per iOS le tre molle che i riferimenti 26 usano
   (smooth / snappy / bouncy).
2. **Il ponte verso il CSS**: M3 dà damping e stiffness, il web vuole un'easing —
   si campiona la molla in una `linear()` (Safari 17.4+/26 e Chromium), con
   ripiego sulle `cubic-bezier` attuali; per i gesti trascinati (fogli) serve una
   molla vera, quindi Web Animations o le molle già presenti via `motion`.
3. **La regola che conta**: moto **guidato dall'utente** (tap, apertura di un
   foglio, cambio pagina voluto) → schema espressivo; moto **osservato** (barra di
   progresso, avanzamento automatico, skeleton) → schema standard. Senza questa
   distinzione le molle rendono l'app stancante.
4. **Risposta alla pressione**, separata: iOS scatto di scala (0.96) con rilascio a
   molla e luce di bordo che si accende; Android **morph di forma** (M9) più state
   layer, come già fa.
5. `prefers-reduced-motion` continua a spegnere tutto: le molle collassano su una
   durata secca, non spariscono di scatto.
6. **Una pagina di sonda** (come `theme-inspector` per i colori) con le transizioni
   fianco a fianco sulle due skin: il moto si giudica guardandolo.

**Cosa è stato fatto davvero** (e dove lo scostamento è dichiarato):
- **La fisica è una sola** e sta in `lib/motion.ts` (`posizione`, `rimbalzo`,
  `assestamento`, `daRisposta` per il vocabolario SwiftUI); i token sono
  **generati** con `node scripts/check-motion.mjs --write`, e il contratto pretende
  l'uguaglianza esatta: una molla sono ~400 caratteri di numeri e l'unico modo di
  sbagliarla è copiarla a mano.
- **La durata non è una scelta**: in CSS `transition`/`animation` vogliono una
  durata, e quella giusta è l'assestamento della molla. Da qui
  `--motion-duration-enter` / `-press` / `-exit`, derivati e verificati (iOS
  360/270/290ms, Android 280/150/230ms) — sia dal contratto sia dalla suite E2E,
  che li ricalcola dal vivo sul browser vero.
- **La pressione risponde in modo diverso sulle due skin, è voluto**: iOS si
  ritrae (0.96) con la luce di bordo alta e il ritorno a molla (ζ 0.8 → rimbalzo
  1.5%); Android si VELA con la molla delle *effects* (ζ 1, 150ms: nessun
  rimbalzo, un'alpha che rimbalza è uno sfarfallio). L'increspatura resta a durata
  fissa: è la spec di Material, non un arretrato. Il *morph di forma* di Android
  resta dove era, in M9.
- **La sonda** sta su **`/admin/movimento`**, raggiungibile dal pannello admin
  accanto a Statistiche. Non contiene nemmeno un valore proprio — anche la riga
  dell'easing osservato prende la durata del velo dell'app: una sonda con numeri
  propri mostrerebbe un confronto falso, che è peggio del non averla.
- **Scoperta durante il lavoro**: la promessa «Android: morph di forma» non
  poteva reggere anche la molla di pressione, perché su Android la molla della
  pressione è della famiglia *effects* (colore) e non *spatial*: sono state
  separate, ed è la ragione per cui le due skin ora divergono anche nella durata.

### M8 — Chrome di navigazione ✅ `0eb8ca3` (con la coda M8b)

**Le due cose che il piano chiamava per nome.**

1. **Il back di sistema che chiude l'overlay più in alto** (l'unica voce del piano
   che *nessuno* aveva visto, perché da un iPhone non esiste). Contratto unico,
   `hooks/use-back-to-close.ts`, montato in un punto solo per tutti e trenta gli
   overlay (`components/ui/dialog.tsx`, più la superficie delle azioni).
   **Non** un `pushState` + `history.back()`, che era la strada ovvia: misurato,
   `back()` risveglia il router di Next e RIFA la rotta (la pagina sotto si
   rimonta, e un overlay che chiude l'altro è peggio del difetto di partenza).
   Si usa la **Navigation API** (`navigate` + `preventDefault()` su `traverse`),
   che annulla il gesto **prima** che avvenga: nessun `popstate`, il router non se
   ne accorge. Serve una voce di scorta perché in una PWA appena aperta dietro non
   c'è niente da attraversare: si scrive una volta per sessione e **non si toglie
   mai** (toglierla vorrebbe dire chiamare `back()`). Prezzo dichiarato: quando non
   c'è nessun overlay aperto, il primo «indietro» consuma la scorta — stessa URL,
   l'utente non vede cambiare niente. Senza Navigation API il gesto resta del
   browser e l'overlay non si chiude: sta fra le cose che il web non può fare
   dappertutto.
2. **La barra è un'isola su iOS e una banda altrove.** Due token (`--nav-inset`,
   `--nav-radius`) e nessun ramo nel JSX: su iOS 8pt di distacco e capsula
   (`999px` su 49pt di altezza si riduce da sé), su Android e desktop valgono zero
   — cioè la fascia di M2, identica al pixel. Con un limite misurato e scritto: sui
   **320px** l'isola cede (`@media (max-width: 20rem) { --nav-inset: 0 }`), perché
   gli 8pt tolgono 16px alla barra e «Cambi turno» a 10px ne chiede 63 contro i
   60,8 disponibili.

**Le altre tre.** Lo stato **«scrolled»** (HIG: scroll edge effect; M3: stato
scrolled) è uno stato che scrive il componente (`data-scrolled`) e il CSS disegna
col token giusto — filo di vetro su iOS, **elevazione di Material** su Android —
invece di un bordo sempre acceso; e il contenuto riceve lo spazio che la barra
**occupa davvero** (`--nav-space`) e chi le fluttua sopra il suo bordo alto
(`--nav-edge`), che sull'isola non sono lo stesso numero. I **fogli si chiudono
trascinando la maniglia** (`hooks/use-drag-to-close.ts`) con la molla **viva** di
`lib/motion.ts` — resistenza verso l'alto, la velocità del dito che conta più
della distanza, l'uscita che finisce fuori schermo con la stessa molla
dell'ingresso, e con «riduci movimento» la molla sparisce invece di rallentare.
Infine l'**arrivo di pagina** è diventato una molla (`.pagina-arrivo`) al posto
della dissolvenza scritta a mano.

**I difetti che sono venuti fuori strada facendo** (tutti trovati da prove, non a
occhio):

- **Un easing che non chiudeva su 1.** La molla si assesta *asintoticamente*,
  quindi l'ultimo campione della `linear()` valeva 0,9998…: il foglio non tornava
  mai a `transform: none` e restava a 0,014px dal suo posto. Ora l'easing chiude su
  `1 100%` esatto, e il contratto del moto lo pretende (è una regola, non una
  correzione).
- **`animation-fill-mode: both` lascia un `transform` perenne.** Sul foglio di
  Android il valore calcolato restava `matrix(…, 0)`: un `transform` permanente
  rende l'elemento il CONTENITORE di ogni figlio `position: fixed`, e significa che
  il foglio non torna mai davvero a riposo. Dove il fotogramma finale combacia con
  lo stato naturale si usa `backwards`; `.desk-card-flash` è l'eccezione
  dichiarata (il suo `100%` deve spegnere contorno e alone, e c'è una prova che lo
  pretende).
- **`.touch-expand` (M6) disattivava l'`absolute` della «Chiudi».** La regola è
  fuori dai layer, quindi vince sulle utility: il comando finiva al *centro* della
  maniglia e con la sua area da 44pt la rendeva **non afferrabile** — un difetto
  preesistente che solo un gesto vero poteva rivelare. I comandi dentro la maniglia
  ora stanno in un contenitore posizionato.
- **Il limite dei 32rem sulla superficie sbagliata.** Nella prima stesura la
  superficie della barra era limitata a `max-width: 32rem`: su un desktop largo la
  banda si sarebbe interrotta a metà schermo. La suite non poteva vederlo (gira a
  320px), quindi oltre alla correzione c'è ora la **prova a 1280px**.
- **Una prova che si fidava di due letture in fila.** Lo snackbar vive pochi
  secondi e Sonner toglie dal DOM anche la sua sezione: aspettare il messaggio e
  *poi* cercare il contenitore era una corsa. Ora posizione e geometria si leggono
  nello stesso fotogramma.

### M8b — la coda di M8, chiusa ✅ `7a2bcdc`

Le tre voci che M8 aveva dichiarato di non aver fatto, e che richiedono di toccare
l'**impalcatura delle pagine** (titoli, livelli, gerarchie) invece della barra.

1. **La testata di pagina** (`components/nav/testata.tsx`): su iOS il titolo grande
   (34pt) vive nel contenuto e scorre via, la barra compatta (44pt, 17pt semibold,
   vetro) entra quando la pagina si muove; su Android è la **top app bar** (64dp,
   titolo compatto 22sp) che scorrendo prende colore ed elevazione di Material.
   Sul desktop **non esiste** (`--head-bar-height: 0px`) e il titolo resta l'`<h1>`
   di sempre: è ciò che rende la suite (che gira anche da desktop) la prova che
   nessuno ha spostato un pixel. Lo stato «la pagina si è mossa» è **un hook solo**
   (`hooks/use-scrolled.ts`), condiviso con la barra in basso: due implementazioni
   della stessa verità sono due verità.
2. **Il gesto di ritorno dal bordo** (`hooks/use-swipe-back.ts`), solo iOS — in una
   PWA standalone WebKit non lo dà alle pagine, quindi l'unico ritorno era il
   pulsante. Tre rifiuti dichiarati: non parte sopra uno scorrimento laterale, non
   parte con un overlay aperto (lì il back è di `use-back-to-close`), e **non parte
   sulle cinque destinazioni** — lì dietro non c'è una pagina dell'app ma la
   cronologia di prima. Il rilascio lo decide la molla `pop` di `lib/motion.ts`.
3. **Le transizioni fra pagine le disegna il browser**
   (`components/providers/transizioni-pagina.tsx`): l'intercettatore di clic avvolge
   la navigazione in `startViewTransition` con `flushSync`. Il flag di Next da solo
   **non basta** (misurato: zero chiamate al motore per una navigazione client),
   e su WebKit la transizione **non parte affatto** — la fotografia del motore fa
   crashare la pagina con un discendente `position: fixed` (`usaWebKit`), quindi lì
   l'arrivo resta la molla di M8. Da questa strada arriva il **predictive back** di
   Chrome Android. Il predictive back resta però **non provabile in CI**: le spec
   girano su un Chromium desktop, dove il gesto di sistema non esiste.

**I due difetti che le prove hanno trovato** (e che l'occhio non avrebbe visto):

- **`view-transition-name` permanente = contesto di impilamento.** Scritto sempre su
  `[data-slot='pagina']`, il nome della transizione rende la pagina un contesto di
  impilamento: il pannello dei minimi (`z-50`, *dentro* la pagina) è finito sotto il
  comando delle Azioni (`z-40`, *fuori*) e la sua «Salva» non era più cliccabile.
  Nessuna prova di geometria lo vedeva; l'ha preso la **suite dei minimi** — che
  nessuna run completa eseguiva da una milestone (il progetto `minimi` dipende da
  `chromium` e le run filtrate non lo toccavano). Il nome vive ora solo nella
  finestra `html[data-vt]`, accesa prima di `startViewTransition`; costo dichiarato:
  le transizioni fra **documenti** (ricaricamenti, link esterni) non si animano.
  Corollario per il futuro: `@view-transition { navigation: auto }` resta **fuori**
  finché non si accetta un nome permanente.
- **Una prova che si avvelenava da sola.** Su WebKit il mouse *sintetico* di
  Playwright smette di consegnare il flusso del puntatore dopo un trascinamento
  (misurato: 2 mosse su 13 dopo un drag, 13 su 13 su pagina fresca; su Chromium la
  stessa sequenza consegna sempre 13 su 13). Le due affermazioni del gesto sono
  quindi **due prove con una pagina fresca ciascuna** — la prima non deve poter
  avvelenare la seconda.

### M9 — Forme espressive (Android) — *il grosso della M3 Expressive*
1. **Sistema di morph**: due forme per controllo (riposo / attivo) e transizione a
   molla. Dove basta: `border-radius` + larghezza; dove la forma è organica
   (loading indicator) serve `clip-path` con lo **stesso numero di vertici** — è
   l'approssimazione possibile sul web, e va scritta come tale.
2. **Scala di forma a contrasto**: delle 35 forme e della scala di raggi a 10
   gradini si scelgono 3–4 valori usati per **gerarchia**, non per decorazione.
3. **I componenti**: navigation bar (voce attiva che si allunga e si squadra),
   icon button (cerchio ↔ quadrato), switch (pollice che si squadra), button group
   / segmented (raggio **e** larghezza, vicini che si spostano), FAB (esteso ↔
   cerchio) e **FAB menu**, **toolbar** per la board, **loading indicator a sette
   forme** e progress ondulata, **split button**, **search** (il campo si squadra
   al focus).
4. **Scala di taglie XS–XL**: i bottoni primari arrivano a 48dp → **il target
   Android si chiude qui**, con la taglia vera (M6 ha spiegato perché non con gli
   pseudo-elementi).
5. **Tipografia emphasized**: un asse di enfasi accanto alla misura. **Il pilastro
   «colore» di M3 Expressive non si adotta**: il progetto ha una regola sua (tema a
   2 colori, chrome neutro) e stravolgerla per una moda sarebbe un danno — si
   prendono forma, moto e tipografia, e lo si scrive.
6. **Elevazione tonale**: M3 non alza solo con l'ombra, **tinge** la superficie per
   livello (`--surface-container*` esiste ed è letto una volta sola). Più
   l'increspatura estesa a voci di lista, card azionabili e voci della barra.
7. **Aptica** su pressione lunga e azioni distruttive (`navigator.vibrate`, solo
   Android: su iOS il web non ha aptica — dichiarato).

### M10 — Liquid Glass (iOS)
1. **Il composito a sei livelli** come token a livelli (velo / riposo / flottante):
   sfocatura+saturazione, tinta, bordo, luce di bordo, ombra, grana. I primi due
   arrivano da M6 con la via d'uscita accessibile già pronta.
2. **Le superfici legittime**: barra flottante (M8), superficie delle azioni, foglio
   delle azioni, toast. **Non** i contenuti: il vetro è per il livello di
   navigazione.
3. **Risposta al tocco**: scatto di scala + luce di bordo che si accende, rilascio a
   molla (M7).
4. **Angoli concentrici**: `--radius-inner: calc(--radius-outer - --inset)`,
   generalizzato (il precedente giusto esiste nel thumb del segmented).
5. **Disciplina del composito**: mai due vetri sovrapposti senza un contenitore
   unico, mai più di **tre** superfici insieme.
6. **Soglia di leggibilità**: qualunque testo su vetro passa 4.5:1 contro lo sfondo
   **peggiore** possibile; la matematica c'è (`lib/color.ts`) e va nel contratto.
7. **Chiusa solo da un iPhone vero**: sul simulatore il `backdrop-filter` annidato
   si comporta diversamente.

### M9/M10 — esito reale

**Cosa è atterrato** (il vocabolario portable della specifica, non tutto il catalogo):

| punto | esito |
|---|---|
| M9.1 morph | **la pressione deforma**: ogni controllo che si dichiara `[data-gl]` si tira verso il dito (`scale .85`) e la forma scappa verso la pillola (raggio 24), 120ms all'andata e 350ms al ritorno su `--m3-expressive`; sullo switch M3 il pollice acceso diventa **pillola** (24×32); l'indicatore attivo della navigation bar prende la forma «a plenilunio» (`--pill-corners`) |
| M9.2 scala di forma | tre valori usati per gerarchia: `--pill-corners` 10, `--gl-press-radius` 24, il raggio del FAB (16, che resta quello letto), **più la scala di taglie XS–XL** legata al componente (`data-size` → `--control-h-*`) |
| M9.3 componenti | **tutti**: barra ✅, switch ✅, comando/FAB ✅, button e icon button ✅, **segmented** ✅ (la voce premuta si tira verso il dito), **FAB menu** ✅ (il comando aperto prende la forma estesa con l'etichetta), **toolbar** ✅ (raggio ed elevazione expressive), **loading a sette forme** ✅ (`LoadingShape`, otto vertici per forma), increspatura → **glow** expressiva ✅. Fuori: split button e campo di ricerca che si squadra al focus |
| M9.4 taglie XS–XL | ✅ i due gradini PRIMARI prendono la misura vera del dito su Android (48 e 56) e altrove restano quelli di oggi; la scala è cinque token letti da `[data-size]` |
| M9.5 enfasi tipografica | ✅ l'asse `--type-emphasis-*` (peso 700 e tracking −0,02em) entra nel titolo grande e in quello compatto su Android; su iOS/desktop i token sono neutri e i titoli restano quelli di HIG |
| M9.6 elevazione tonale | **parziale**: l'ombra di terzo livello dell'indicatore attivo c'è, la toolbar ha la sua; la scala `--surface-container*` per livello e l'increspatura estesa a voci di lista e card restano fuori |
| M9.7 aptica | ✅ quattro accenti (`--aptica-tap/avviso/conferma/errore`), durate decise dalla skin, `navigator.vibrate`; su iOS il canale è muto per scelta (HIG non mette il feedback a scatti nel vocabolario dei controlli, e WebKit non distribuisce l'API) |
| M10.1–2 composito e superfici | **parziale ma coerente**: la superficie delle azioni e il foglio prendono la **riga di luce** sul bordo alto (il 30% del filo di vetro, smorzata in 28px), spenta da `prefers-reduced-transparency`; velo e sfocatura restano quelli di M6. Toast non toccato |
| M10.3 risposta al tocco | ✅ scatto, luce di bordo e ritorno a molla (M7 + M10) |
| M10.4 angoli concentrici | **non fatto** |
| M10.6 soglia di leggibilità | **parziale**: le coppie AA sono misurate con la matematica di `lib/color.ts`, le sei su fondo traslucido restano dichiarate saltate |
| M10.7 iPhone vero | resta l'unica chiusura valida, come già scritto |

**Due difetti trovati dalle prove, non dall'occhio:**

1. **`--nav-indicator-shadow` era letto e mai dichiarato.** `box-shadow: var(...)` con la chiave
   inesistente **non** è «nessun effetto»: è una dichiarazione INVALIDA, che il browser scarta e
   la proprietà cade al valore iniziale. L'ombra di terzo livello dell'indicatore attivo non
   esisteva, e nessuna guardia se n'era accorta: il contratto chiedeva che un token *dichiarato*
   fosse letto, non il rovescio. Ora la chiave c'è (su iOS e desktop `none`, su Android l'ombra
   vera) e c'è la guardia mancante: `check-design-tokens.mjs` pretende che **ogni `var()` del
   progetto abbia una dichiarazione**, con un elenco chiuso e motivato di deroghe (i font di
   `next/font`, i token che il `<Button>` scrive a runtime, i token dello stile in linea del
   testo che si adatta). Provata togliendo una dichiarazione: morde.
2. **La pillola dell'indicatore non esiste sul desktop.** La prova la pretendeva su «Android e
   desktop» e passava solo perché leggeva l'albero prima che la skin fosse indossata: la barra
   del desktop è quella classica, e il suo primo `span` è il contenitore dell'icona (24×24).

**Difetti delle prove stesse, corretti qui** (erano misure, non app): il cronometro del respiro
osservava le **mutazioni** e leggeva 409ms su una card accesa 3s (ora campiona a tempo); la prova
del FAB leggeva la geometria **prima** che la transizione di forma arrivasse (misurava 56 invece
di 48) e confrontava `rounded-full` come stringa, mentre il valore saturato differisce fra i
motori; su iOS il rilascio del comando **naviga** (`/dashboard?new=1`) e interrompeva il `goto`
dell'iterazione dopo.

**Verifica:** `tsc` ed `eslint` puliti su tutto il toccato; contratti verdi (85 chiavi × 2,
molle generate e misurate, **0 `var()` orfane di dichiarazione**); suite completa **355 passate /
11 saltate / 0 fallite** in 6,2 minuti a 2 worker.

**Lo snellimento della suite, misurato.** La leva grossa era già stata presa: `dismissChangelog`
esce subito quando il contesto di test è preparato (era «la voce più cara dell'intera suite»), le
attese fisse sono 25 in tutto il progetto (≈26s di valori dichiarati) e le molle hanno sostituito
i `waitForTimeout`. Numeri di oggi: **366 prove, 719s di tempo di prova, 6,2 minuti a muro con 2
worker** (parallelizzazione ≈1,9×). Il tempo sta quasi tutto in due posti: `card-cambio-to-sala`
(198s, il 27%: prove con DB e fino a tre navigazioni di ricerca, che su WebKit girano una seconda
volta) e le prove sopra i 5s (32 prove, 309s — il 43% del totale). Le strade per scendere, col
prezzo accanto: **togliere `card-cambio-to-sala` dal progetto `ios`** (~70s, il 10%) al prezzo
della copertura WebKit su evidenzia e cronologia di quel salto; **4 worker** (~3,3 minuti) al
prezzo dei fallimenti da carico già misurati in M8b; oppure **non scendere** — sei minuti per 366
prove su due motori e tre skin è un prezzo che il progetto ha già scelto di pagare.

### M9 chiusa — le sei voci che restavano (23/09/2026)

**M9 è chiusa il 23/09/2026** con le sei voci che la tabella sopra dava per mancanti — scala di
taglie, segno di caricamento, enfasi, FAB menu, segmented, toolbar — e le prove sono in
`tests/m9-completa.spec.ts`: per OGNI voce c'è l'affermazione su Android (dove la forma esiste) e
quella sulla skin che non deve muoversi, perché «non implementato» e «implementato che tocca anche
l'altra piattaforma» sono due difetti diversi. Restano fuori, dichiarati: il **vicino che si sposta**
nel segmented (la specifica lo chiede, il web lo fa con una misura a runtime: è un cambio di layout,
non di pelle), il **FAB menu a pila di FAB piccoli** (sostituirebbe il foglio delle azioni, che quattro
spec pinnano: è una modifica alla navigazione, da fare per scelta e non in coda a una milestone), la
scala tonale e l'increspatura estesa, e tutto M10 che non è composito (angoli concentrici, chiusura su
iPhone vero).

Il prezzo è stato in gran parte CAPIRE le misure, non scriverle — e le due trappole sono in
`knowledge.md`: una regola di stessa specificità che perde per ORDINE nel foglio (il peso del titolo
restava 600: si lega il token, non si aggiunge una regola) e la misura di una forma sotto una
trasformazione (il rect di un comando di 168 scalato a 0,85 è 143, e quello di un quadrato che ruota è
più grande del suo lato: si misura la larghezza COMPUTATA).

### M11 — PWA, stato di sistema e offline ✅ (23/09/2026)
1. **Manifest**: via `orientation: 'portrait'` (fix Android più visibile del
   piano), più `scope`, `id`, `lang: 'it'`, `dir`, `shortcuts`, `categories`,
   `display_override`, `screenshots`, la maskable 192; riga DEV sistemata.
2. **Chrome di sistema**: colore guidato dallo sfondo della pagina (Safari 26 non
   legge più il meta), `statusBarStyle: 'default'` con la regressione 26.1 scritta
   come regola, scelta consapevole per `#0a0a0a`, edge-to-edge su Android 15+.
3. **Offline**: `navigator.onLine` + eventi, banner non bloccante, stato della cache
   del service worker, possibilità di riprovare, `role="status"`.
4. **Install flow**: già presente; da allineare alle voci nuove del manifest.

#### M11 — esito reale

| punto | esito |
|---|---|
| 1. manifest | ✅ `orientation` **via** (la rotazione la decide il telefono), `id`/`scope` espliciti (**senza `id` l'identità è lo `start_url`: cambiarlo creerebbe una seconda app installata**), `lang`/`dir`, 4 `shortcuts`, `categories`, `display_override`, maskable **192** accanto alla 512, due `screenshots` (1179×2556 narrow e 1440×900 wide) e i due rami — prod e DEV — costruiti su una **base comune**, così la riga malformata del ramo DEV non può tornare. Le screenshot si generano con `scripts/genera-screenshot-manifest.mjs`: larghezza 393 CSS px a densità 3, perché **la larghezza decide il layout** e una foto da 1080 di lato mostrerebbe il desktop in cornice da telefono. |
| 2. chrome | ✅ il meta `theme-color` resta adattivo al tema (`#f0f7fc`/`#0a0a0a`) come **fallback**, ma su iOS 26 il colore della fascia di stato è quello che la pagina disegna sotto di essa: la regola è scritta dove si decide (`appleWebApp.statusBarStyle: 'default'`), insieme al ritiro della barra piena nella 26.1. |
| 2b. edge-to-edge | ✅ `viewport-fit=cover` più **gli inset veri del sistema**, letti dai token di M6 (`--safe-*`). Nessun fallback inventato («se `env()` è zero allora 24px» aggiungerebbe spazio dove il sistema non ne chiede — e su Chrome di Android 15 gli inset ARRIVANO: verificato con `Emulation.setSafeAreaInsetsOverride` via CDP). Le prove iniettano 47/34 e pretendono che testata, banda della barra e avviso di rete crescano di quell'esatto numero. |
| 3. offline | ✅ `components/providers/offline-bar.tsx` nel layout di RADICE (fuori da `PwaGuard`: senza rete la prima pagina che deve poterlo dire è `/login`), `role="status"`, `navigator.onLine` + eventi, **stato della cache** risposto dal service worker (messaggio `STATO_CACHE` → `clients.matchAll`) e «Riprova» che fa un **ping vero** (`fetch` `no-store`) invece di fidarsi del flag di sistema. |
| 4. install flow | ✅ la pagina dichiara le voci nuove che l'utente non poteva indovinare: le quattro scorciatoie del menu dell'icona (nominate col gesto giusto per la piattaforma) e la verità sull'offline — **le pagine non sono in cache di proposito**, quindi il testo non promette un'app che funziona senza rete. |
| fuori, dichiarato | screenshot `wide` non provata su iPad vero; il foglio di installazione nativo di Chrome non è pilotabile da un test (si prova il contenuto del manifest, che è ciò che lo alimenta); lo splash di iOS resta un colore solido (limite di piattaforma, vedi §7). |

Le prove sono in `tests/m11-pwa.spec.ts` (11 prove, ~4s): leggono il **manifest servito**, l'**header dei PNG** (un `sizes` che non combacia fa scartare la screenshot in silenzio: nessun errore da nessuna parte), le **scorciatoie confrontate con le cartelle reali** di `app/(app)`, i meta del `<head>`, i token risolti con gli inset emulati e il canale del service worker.

### M12 — Adattività, accessibilità e comodità d'uso — *chiusa salvo la coda dichiarata* (23/09/2026)
1. **Adattività**: navigation rail M3E (≥600dp) e barra flessibile per i
   pieghevoli; layout largo su iPad; board in orizzontale con le safe area laterali
   di M6.
2. **Accessibilità**: giro completo con **VoiceOver** e **TalkBack** (la board è una
   tabella densa: è il punto peggiore), `role="status"` sugli aggiornamenti
   realtime, gestione del fuoco negli overlay.
3. **Comodità**: **undo** nella snackbar dove l'azione è reversibile e conferma solo
   dove non lo è; `inputMode`/`enterKeyHint`/`autocomplete` su tutti i campi; stati
   vuoti e di errore con una via d'uscita; «torna su» sulle liste lunghe;
   preferenza in-app per la dimensione del testo (usa `--type-scale` di M6).
4. **Prestazioni**: budget dichiarato (max 3 vetri, board a 60fps) e **misurato sul
   telefono vero**, non sul desktop.

#### M12 — esito reale (la parte fatta)

| punto | esito |
|---|---|
| 2. accessibilità della board | ✅ **la board parla.** Regione etichettata (`Board di sala — giorno, turno`), live region che annuncia giorno/turno/numero di card, ogni card `role="group"` con «SEZIONE — N persone, M scoperti», i nomi come **elenco** (l'ordine è informazione), i tre turni come gruppo con `aria-pressed` e nome per esteso, il calendario `role="dialog"` dichiarato da `aria-haspopup`/`aria-expanded`, `aria-label` su ogni comando a icona, i pallini colorati `aria-hidden`. |
| 2. annunci realtime | ✅ due live region distinte: quella della board (contesto) e `data-slot="realtime-annuncio"`, che dice «Dati aggiornati: turni, alle 14:32» e si svuota dopo 6s (una live region parla quando il **testo cambia**). **Non coperta da prove**: servirebbe una scrittura sul DB e un evento realtime vero. |
| 3. dimensione del testo | ✅ **Impostazioni → Testo**, quattro gradini. Agisce sulla **misura di base del documento** (`html { font-size: N% }`) e non su `--type-scale`: la scala `--fs-*` è in `rem` come le classi di Tailwind, e con il solo token sarebbero cresciute le intestazioni e non i cognomi della board. `--type-scale` resta 1 per non scalare due volte; è una percentuale (compone con la preferenza del browser) ed è del dispositivo. |
| 3. campi | ✅ `inputMode`/`enterKeyHint`/`autoComplete` su accesso, recupero password, OTP, cambio password e sui campi admin (email, nomi, numeri, ricerca). |
| 3. «torna su» | ✅ su Notifiche (dalla pagina, non dall'elenco: l'altezza è della pagina) e in fondo a destra **no**: il posto è della campanella/FAB, quindi a sinistra. Con `prefers-reduced-motion` salta in cima invece di scorrere. |
| 3. stati vuoti | ✅ parzialmente: l'elenco notifiche vuoto offre «Vai ai turni di sala». Gli altri stati vuoti/di errore dell'app restano da passare uno per uno. |
| 4. prestazioni | ✅ **budget del vetro misurato**: massimo tre superfici con `backdrop-filter` attivo per schermata (`/turnisala`, `/dashboard`), contate dalla prova. La board a 60fps sul telefono vero resta da misurare su un dispositivo. |
| 1. orizzontale | ✅ verificato: a 852×393 la board non sborda e il contenuto si sposta di quanto dichiara l'inset laterale (`--safe-left`). |
| 3. stati vuoti | ✅ **chiusa in M12b** (sotto): elenco notifiche, classifica utenti delle statistiche, ricerca di «Vedi come», ricerca del confronto in «Il tuo turno», feedback dell'admin (con «Ricarica»: la lista può essere vuota per un colpo di rete), debug notifiche (idem) e grafico attività, che offre il periodo più largo. Ogni uscita dipende dalla CAUSA del vuoto. |

#### M12f — LA RAIL (il primo punto della lista, 23/09/2026): fatta

| punto | esito |
|---|---|
| navigation rail M3E ≥600dp | ✅ su Android, `@media (min-width: 600px) and (min-height: 480px)`: la barra diventa una **colonna a sinistra** larga 80dp e alta quanto la finestra, voci impilate, indicatore 56×32. La decide il CSS, perché la scelta è della FINESTRA (in JS sarebbe un primo disegno con la forma sbagliata); i tre agganci (`nav-shell`, `nav-items`, `nav-item`) esistono in tutte le configurazioni e sono inerti dove la rail non c'è. |
| tutti gli offset | ✅ una chiave nuova (`--nav-rail-w`) e un derivato (`--nav-start`) che la pagina legge senza sapere dove sia la navigazione: `.shell-nav` (lo spazio laterale), `.nav-fab-layer` (il FAB resta in basso a destra della FINESTRA, non della banda dei 32rem), «torna su». In rail `--nav-space`/`--nav-edge` diventano `var(--safe-bottom)`, NON zero: sulla barra gesti l'area sicura c'è comunque. La geometria che il componente scrive in `style` è diventata token (`--nav-shell-h`, `--nav-bar-h`), altrimenti lo stile in linea vincerebbe su qualunque regola. |
| layout largo della board | ✅ `.board-largo`: sopra i 600dp la griglia prende un tetto di lettura (56rem), si centra nello spazio che resta e la toolbar smette di andare a capo. La griglia resta di TRE colonne: il modello delle card è riga × allineamento, e una quarta colonna sarebbe una pagina nuova, non una finestra più larga. |
| dove NON si accende | ✅ sotto i 600dp, su iOS, sul desktop e su un telefono in orizzontale (largo 900dp ma alto 412: lì una colonna ruberebbe larghezza alla board). Le prove misurano anche questo, perché «la rail non esiste dove non deve» è metà del contratto. |

#### M12b — l'annulla e le vie d'uscita (23/09/2026): fatta

| punto | esito |
|---|---|
| undo nello snackbar | ✅ `lib/undo.ts`: «Annulla» per 6s (dentro la finestra 4-10s che M3 dà agli snackbar con un'azione) sulle TRE azioni reversibili — la riga cancellata con lo swipe, «Segna tutte come lette» e la cronologia svuotata. Sono reversibili perché vivono in `localStorage`, e l'istantanea la prende chi muta (l'elenco INTERO: ricostruire la voce pezzo per pezzo sbaglia l'ordine e la posizione). Lo svuotamento tiene **conferma e annulla**: togliere la conferma a un'azione distruttiva sarebbe stato un favore a metà. Tutto ciò che scrive sul DATABASE resta con la conferma. |
| stati vuoti e di errore | ✅ `components/ui/via-uscita.tsx` per la forma unica; sette schermate passate (vedi la tabella qui sopra). |
| **fuori, dichiarato** | **giro con VoiceOver/TalkBack su dispositivo vero** (l'albero è corretto e provato, ma la lettura reale è un'altra cosa); barra flessibile per i pieghevoli; layout largo su iPad (la rail è di Material); i 60fps della board misurati su un telefono vero. |

Le prove di M12 sono in `tests/m12-comodita.spec.ts` (10 prove, ~16s: l'albero di accessibilità della board, il gradino del testo, gli attributi dei campi, «torna su», il budget del vetro, l'orizzontale), in `tests/m12f-rail.spec.ts` (5 prove × 2 progetti, ~13s: forma, posto, offset, il largo della board e i casi in cui non si accende) e in `tests/m12b-undo.spec.ts` (5 prove, ~7s: le tre azioni reversibili e due vie d'uscita vere).

---

## 4. Chi guadagna cosa

| Milestone | iOS | Android |
|---|---|---|
| M6 Igiene ✅ | area di tocco 44pt invisibile, safe area laterali, primi 2 livelli di vetro, **font di sistema applicato** | scorrimento annidato corretto, tap-highlight, testo ingrandibile, elevazione della barra che finalmente si vede, contratto che non ammette più token morti |
| M7 Moto ✅ | molle in rilascio (è ciò che fa «liquido» il vetro): pressione che si ritrae, ritorno a molla con 1.5% di rimbalzo, luce di bordo che si accende | sistema a molle di M3E (schemi standard/espressivo, spatial/effects), pressione velata con la molla delle effects, **un contratto che genera e verifica le molle** — e la base per ogni morph di M9 |
| M8 Chrome ✅ | barra a **isola** (capsula flottante), stato «scrolled» col filo di vetro, fogli trascinabili che escono con la molla dell'ingresso | **il back di sistema che chiude l'overlay più in alto**, stato «scrolled» con l'elevazione di Material, fogli trascinabili, e la barra che resta la banda di sempre |
| M8b Chrome (coda) | titolo grande che si riduce, gesto di ritorno dal bordo | top app bar (small/medium), predictive back con `@view-transition` |
| M9 Forme | — (solo angoli concentrici condivisi) | morph su press/selezione, barra espressiva, switch, button group, FAB menu, loading a 7 forme, **taglia 48dp vera**, enfasi tipografica, elevazione tonale, aptica |
| M10 Vetro | il materiale completo, 6 livelli, capsula flottante | — (nessun vetro, per scelta) |
| M11 PWA ✅ | chrome dallo sfondo (la pagina sotto la fascia di stato è la verità: Safari 26 non legge il meta), regola 26.1 scritta dove si decide, inset di sistema senza numeri di riserva | **orientamento sbloccato**, shortcuts, screenshots, maskable 192, edge-to-edge verificato con gli inset emulati, avviso di rete con lo stato della cache e un «Riprova» che pinga davvero |
| M12 Comodità | gradino del testo sul dispositivo (la base del documento, non il token: è ciò che fa crescere anche i cognomi), «torna su» a sinistra perché il basso a destra è della campanella, elenco vuoto con una via d'uscita | **la board parla** (regione, annunci, elenchi, dialog dichiarato), campi con tastiera e tasto giusti, budget del vetro misurato, orizzontale verificato; **la rail** sopra i 600dp — la navigazione diventa una colonna a sinistra — e la board in largo con un tetto di lettura; **l'annulla** sulle tre azioni reversibili e le vie d'uscita sugli stati vuoti |

---

## 5. Fonti, e la valutazione di `material-esm/material`

Le fonti usate per decidere (da rileggere quando una milestone si tocca):
M3 Expressive (blog ufficiale e panoramiche), **Motion physics** di M3 (molle
composte: damping + stiffness; famiglie spatial/effects; tre velocità; due
schemi), il composito Liquid Glass (sei livelli, disciplina del composito, settori
di vetro), il supporto di `corner-shape` (solo Chromium 139+), le rotture delle PWA
su iOS 26/26.1 (barra di stato non più a tutto schermo) e il fatto che **Safari 26
non legge più il meta `theme-color`**.
Per M7, in più, i valori **ufficiali** delle sei molle sono presi da
material-components-android (`docs/theming/Motion.md`): lo scheletro `linear()` è
stato validato su Chromium e WebKit veri (6 easing su 6 accettati come
`transition-timing-function`, e il percorso misurato coincide con la curva
campionata).
Per M8, in più: la **Navigation API** (Chromium e WebKit, `canIntercept` sui
viaggi di sola cronologia) misurata prima di scriverci sopra l'hook, e i valori di
riferimento della tab bar flottante di iOS 26 (8pt di distacco, raggio pieno su
49pt di altezza) approssimati come il piano dichiara di fare.

**`github.com/material-esm/material` — utile, ma come RIFERIMENTO, non come
dipendenza.** È un fork della libreria ufficiale Material Web (che Google ha
messo in manutenzione): componenti **Lit** (`<md-button>`, `<md-text-field>`,
`<md-navigation-bar>`…), token `--md-sys-*`, e una demo Expressive. 191★, 12 fork,
attivo.

Perché non adottarlo: (1) porta un **secondo sistema di token e di tema**
(`--md-sys-*` + `light.css`/`dark.css` dal Theme Builder) che si sovrapporrebbe al
nostro livello a due livelli, alla regola dei 2 colori, ai contratti `check-design-tokens`/E2E;
(2) i componenti vivono in **shadow DOM**: la nostra skin lavora su attributi di
piattaforma e utility, e non arriverebbe dentro senza `::part`; (3) è **Material,
quindi Android per costruzione**: la metà iOS del design system (che è la ragione
d'interesse di questo progetto) non è esprimibile; (4) è un fork di un progetto in
manutenzione — rischio di dipendenza per un'app interna a vita lunga; (5) un terzo
modello di rendering (Lit) accanto a React.

Perché vale la pena tenerlo aperto: (1) **valori di riferimento** delle misure M3E
(altezze, forme, opacità degli state layer) quando approssimiamo; (2) possibili
**implementazioni di riferimento del morph** (indicatore della navigation bar,
icon button) — è la parte difficile di M9; (3) il loro `light.css`/`dark.css` come
**controprova** dei nostri token; (4) un esempio vivo di come M3E si traduce in CSS
(e di cosa manca, che è la strada dell'errore da evitare). Per il **moto**, in
particolare: le loro molle sono un control per la taratura, non una sorgente —
i valori che usiamo vengono dalla libreria Android, e la sonda li mostra a fianco
proprio per giudicarli con l'occhio.

---

## 6. Verifica (regole di casa, non nuove)

- `npx tsc --noEmit` e `npx eslint` sui file toccati (baseline nel knowledge).
- `node scripts/check-design-tokens.mjs` **esteso, mai aggirato**; i ratchet
  scendono, e un token di piattaforma senza lettore è un errore.
- `node scripts/check-motion.mjs` (M7): le molle nei blocchi di piattaforma devono
  essere quelle **calcolate**, le durate devono essere il tempo di assestamento
  della molla che governano, le `effects` non devono rimbalzare, e l'easing deve
  **chiudere su `1 100%`** (M8: la molla si assesta all'infinito, l'animazione no).
- `tests/design-piattaforma.spec.ts` esteso sui motori veri (WebKit/iPhone,
  Chromium/Pixel): mai a occhio. Già in M6: token risolti in px, **font disegnato**,
  area di tocco. In M7: molle e durate ricalcolate dal vivo, pressione che legge la
  molla su entrambe le skin, collasso con `prefers-reduced-motion`. In M8: la barra
  misurata a 320px **e a 1280px** (isola e banda), lo stato «scrolled» prima e dopo
  lo scorrimento, il **gesto indietro** che chiude l'overlay senza toccare la
  cronologia, il foglio trascinato che si posa (e l'uscita con la molla).
- Il desktop resta identico al pixel: ogni regola nuova sta sotto
  `[data-platform='ios'|'android']`, e la suite E2E è la prova. Vale anche per le
  molle: sul desktop sono l'easing di sempre e le durate 300/200.
- `knowledge.md` aggiornato a fine milestone con le **regole durature**.
- Le prove che i browser dei test non possono emulare (`prefers-reduced-transparency`
  non è emulabile da Playwright) si verificano **sul telefono vero** e si annotano
  qui: è la ragione per cui certe cose restano «da confermare su iPhone».
- **Il moto si giudica guardandolo**: `/admin/movimento` è lo strumento di taratura
  (schema contro schema, sulla skin vera), e la taratura che ne esce si scrive in
  `lib/motion.ts`, non nel foglio di stile.
- **Trappola dell'ambiente, costata due diagnosi false**: il dev server può servire
  un `globals.css` **vecchio** anche dopo una modifica (e anche dopo un tocco al
  file). Se una regola di stile non si vede, prima di cercare un difetto nel codice
  si fa `rm -rf .next` e si riavvia — è scritto anche nel knowledge.

---

## 7. Cosa il web non può fare (per non prometterlo)

- **M3 Expressive non ha implementazione ufficiale sul web**: quello che facciamo è
  un'approssimazione dei token e del moto; le 35 forme non esistono in CSS.
- **Liquid Glass non è rifrazione**: niente luce che piega, niente bagliore che
  risponde all'inclinazione del telefono.
- **Niente squircle nativi su Safari** (`corner-shape` è solo Chromium 139+).
- **Niente vetro sotto la barra di stato** in standalone dopo iOS 26.1.
- **Niente aptica su iOS** (solo Android, via `navigator.vibrate`).
- **Niente detents nativi** dei fogli iOS: si approssimano.
- **`theme-color` non è affidabile su Safari 26**: il chrome si guida con lo sfondo.
- **Una `linear()` non è una molla viva**: campiona un tempo già deciso, quindi non
  sa reagire al dito che si muove (gesti trascinati) e non si può «rilanciare» a
  metà corsa. In M8 si è risolto così: Web Animations con la stessa fisica.
- **Senza Navigation API il back di sistema non chiude l'overlay**: l'alternativa
  (riscrivere la cronologia con `pushState`/`back()`) rimonta la pagina sotto perché
  il router la legge come una navigazione estranea. Sui motori senza `navigation`
  (Firefox) il gesto resta del browser, e l'overlay si chiude col pulsante.
