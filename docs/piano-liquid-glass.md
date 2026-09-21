# Piano M6–M12 — Material 3 Expressive (Android) e Liquid Glass (iOS)

Stato analizzato: **dev @15a4195**. Seguito di `docs/audit-ios-material.md` (audit
del 19/09, *prima* delle milestone M1–M5): non ripete quello che le M1–M5 hanno
fatto, dice cosa manca e in che ordine farlo.

**Bersaglio deciso:** Android insegue **Material 3 Expressive**; iOS insegue le
**HIG 26** con il materiale **Liquid Glass**. Il desktop resta identico al pixel
(ogni regola nuova vive sotto `[data-platform='ios'|'android']`).

**Due avvertenze oneste, che valgono per tutto il piano.**

1. **M3 Expressive non esiste su web.** Material Web Components sono in
   manutenzione da tempo: la spec espressiva è Compose-first, e Google non
   fornisce un'implementazione web. Quindi *l'approssimiamo* con il nostro
   sistema di token, e ogni volta che ci allontaniamo dalla spec va scritto nel
   codice, perché nessuna libreria ce lo ricorderà.
2. **Liquid Glass non è una proprietà CSS.** È un composito di sei livelli
   (sfocatura + tinta + bordo + luce di bordo + ombra + grana) più la risposta
   al tocco. Sul web se ne approssimano cinque; la rifrazione vera no.

**Metodo.** Codice di `dev` letto componente per componente, le due guide
(HIG 26 / M3 e M3 Expressive), e per ogni proprietà nuova la verifica del
supporto reale nei browser che ci interessano (Safari 26, Chrome Android).
Ogni voce ha una prova nel codice o nella guida.

---

## 1. Dove siamo (M1–M5: le fondamenta che non si toccano)

| Livello | Stato |
|---|---|
| Piattaforma decisa dal server (`data-platform` nell'HTML iniziale) | fatto, puro e testato |
| Token a due livelli (semantici → piattaforma) + utility tipografiche `@theme inline` | fatto |
| Contratto `scripts/check-design-tokens.mjs` (chiavi pari, skin viva, utility, WCAG, ratchet) | fatto |
| Contratto E2E `tests/design-piattaforma.spec.ts` su motori veri | fatto |
| Skin iOS dei controlli (switch 51×31, campo a inserto, segmented, chip 32) | fatto |
| Skin Android dei controlli (state layer, ripple dal dito, campo M3, switch 52×32) | fatto |
| Safe area, `dvh`/`svh`, `prefers-reduced-motion`, board con forma per piattaforma | fatto |
| Barra di navigazione + superficie delle azioni con scriminatura | fatto (M2) |

Mancano: il **moto** (nessuna molla, nessuna fisica), le **forme espressive**
(nessun morph), il **vetro**, il **chrome di navigazione** (barre, titolo grande,
indietro), i **fogli trascinabili**, il **back di sistema** di Android, la **PWA**
e l'**adattività**. Su iOS il "materiale" esiste in un solo posto ed è una
sfocatura piatta; su Android la barra è fuori specifica appena lo schermo si
allarga.

---

## 2. Gap, con la prova

### A. Aree di tocco — HIG 44pt / M3 (Expressive) 48dp · ALTA
`--touch-min` è consumato in **4 punti** (`nav-action-surface`, `alert`). Il
resto: `button.tsx` 24/28/32/36px, `input.tsx` 32px, chip 32px.
Due strade diverse, e vanno tenute distinte:
- **iOS si può allargare in modo invisibile**: `::after` è libero, e la HIG lo
  permette esplicitamente (disegno piccolo, area di tocco 44pt).
- **Android no**: il ripple obbliga `overflow: hidden` sul controllo
  (`globals.css` riga ~886), quindi **nessun** pseudo-elemento può uscire dal
  bordo. Il 48dp su Android si ottiene con la **taglia vera** — ed è esattamente
  ciò che la scala XS–XL di M3 Expressive offre.

### B. `overscroll` e catene di scorrimento · ALTA
Zero `overscroll-behavior`, zero `touch-action`. Su iPhone standalone il tiro dal
fondo può **ricaricare la PWA** a metà lavoro; il contenuto dietro un foglio
**scorre** insieme al foglio; lo swipe dei mesi sulla board **sfonda** nello swipe
di sistema. Su Android la stessa cosa si chiama *nested scroll*, ed è un requisito
dei bottom sheet M3, non un dettaglio.

### C. Niente moto fisico · ALTA (è il cuore di M3 Expressive)
Tutto il movimento è tempo + `cubic-bezier` (`--motion-duration-enter/exit`,
`--motion-ease-standard`). M3 Expressive sostituisce il sistema a durate con un
**motore a molle**: due schemi (standard / espressivo) e due famiglie (spatial,
effects). Anche il vetro iOS, per sembrare liquido, ha bisogno di una molla in
rilascio. Oggi l'unica molla del progetto è scritta a mano in un componente
(`feedback-list.tsx`, `type: 'spring'` di motion).

### D. Niente forme espressive · ALTA (Android)
M3 Expressive è, in gran parte, **forma che cambia stato**: la voce attiva della
navigation bar si allunga e si "squadra", l'icona selezionata passa da cerchio a
quadrato, il pollice dello switch si squadra quando è acceso, l'elemento scelto di
un button group cambia raggio **e larghezza** (e i vicini si spostano), il FAB
esteso si ritira in cerchio, il menu dello split button ruota e si squadra, il
loading indicator morfa fra sette forme. Nel progetto la pillola della voce attiva
è **statica** (`--nav-indicator`, 32×64) e non esiste nessun morph.

### E. Il bersaglio tipografico espressivo non c'è · MEDIA
M3 Expressive aggiunge gli stili **emphasized** (stessa misura, peso e presenza
maggiori: è così che "l'occhio si ferma"). Qui il vocabolario è solo la scala di
misura (`--fs-*`), nessun asse di enfasi. E la scala è in **px**: le impostazioni
di testo del sistema non possono ingrandire l'app.

### F. Chrome di navigazione assente · ALTA
L'unico `router.back()` è in `admin-panel`. Su iOS mancano barra, titolo grande e
gesto dal bordo (in standalone WebKit **non** naviga col gesto); su Android manca
la top app bar e — ben più grave — **il back di sistema non chiude gli overlay**:
in tutto il progetto ci sono **zero** `pushState` e zero `popstate`, quindi con un
foglio aperto il gesto indietro esce dalla pagina. La convenzione Android è
l'opposto.

### G. I fogli non si trascinano · MEDIA-ALTA
`dialog.tsx` disegna la scriminatura ma il foglio non si chiude trascinando.
Lo chiedono **entrambe** le guide (action sheet HIG, bottom sheet M3).

### H. Liquid Glass: 1 livello su 6 · ALTA (iOS)
La barra ha `blur(20px) saturate(180%)` su `color-mix(background 82%)`.
Mancano bordo, luce di bordo interna, ombra adattiva, grana, e la risposta al
tocco. Inoltre la geometria è quella pre-26 (barra da 49pt col filo in alto),
mentre iOS 26 vuole la **capsula flottante**.
Trappole misurate: **il vetro non campiona il vetro** (due `backdrop-filter`
sovrapposti danno nero/grigio, e la superficie delle azioni sta *esattamente*
sopra la barra); **`corner-shape: squircle` è solo Chromium 139+** (su iOS si
resta all'arco di `border-radius`); **costo GPU** (budget: 3 superfici).

### I. PWA e chrome di sistema · ALTA
- `orientation: 'portrait'` **in entrambi i blocchi** del manifest: la board
  orizzontale non ruota. **Difetto solo Android** (Safari non implementa
  `orientation`), anzi Chrome ignora il blocco di rotazione dell'utente.
- `theme_color`/`background_color` fissi `#0a0a0a` → splash e barra di stato
  scuri su Android anche in tema chiaro.
- **Safari 26 non legge più il meta `theme-color`**: il chrome lo ricava dallo
  sfondo della pagina. Qui il chrome è impostato *solo* via meta.
- **iOS 26.1**: `black-translucent` non disegna più a tutto schermo in standalone
  → il vetro sotto la barra di stato **non è un obiettivo**.
- Manifest incompleto: mancano `scope`, `id`, `lang`, `dir`, `shortcuts`,
  `categories`, `display_override`, `screenshots`, e la `icon-maskable-192` che
  esiste già in `public/icons`. Su Android si vedono tutte (menu della pressione
  lunga, finestra di installazione).
- **Zero stato offline**: nessun `navigator.onLine`, nessun evento `online`.

### J. Adattività assente · MEDIA
Tutte le pagine sono `max-w-lg mx-auto`. Su un tablet Android la barra in basso è
fuori specifica (M3 vuole una **navigation rail** da 600dp in su); su iPad
manca il layout largo. Inoltre la board si usa **in orizzontale**, e i token di
safe area coprono solo sopra e sotto: con il notch di lato, in landscape, il
contenuto può finire sotto l'angolo arrotondato.

### K. Token dichiarati e mai letti · MEDIA (difetto di metodo)
`--elevation-nav` è dichiarato in quattro posti e ha **zero lettori**: la barra usa
`border-t border-border`. La promessa della M2 («filo su iOS, elevazione su
Android») è dichiarata e non disegnata, e il contratto non lo può vedere: verifica
che i valori **divergano**, non che qualcuno li **legga**.

### L. Accessibilità e comodità · MEDIA
Manca `-webkit-tap-highlight-color` (iOS e Chrome Android dipingono il loro lampo);
nessun `role="status"`/`aria-live` fuori dai toast; l'aptica su Android è usata
**una volta** e M3E la vuole su pressioni e azioni distruttive; manca
`prefers-reduced-transparency`/`prefers-contrast`; si conferma tutto invece di
offrire **undo** dove è reversibile (M3); `inputMode`/`enterKeyHint` sono usati in
tre punti.

---

## 3. Le milestone

L'ordine non è arbitrario: M6 è il prerequisito (igiene + contratti + i primi due
livelli del vetro, spenti per chi non li vuole), M7 dà la **fisica** — perché sia
il vetro sia le forme espressive sono moto, prima che disegno —, M8 il chrome,
poi le due metà visibili (M9 espressivo su Android, M10 vetro su iOS), poi la PWA
e infine adattività e rifiniture.

### M6 — Igiene, contratti e i primi due livelli del vetro
*Nessun ridisegno. Il desktop non si muove di un pixel.*
1. **Scorrimento**: `overscroll-behavior-y: contain` su pagina **solo in
   standalone** (in browser il pull-to-refresh resta: là è atteso e innocuo, in
   app ricaricherebbe la PWA a metà lavoro), `contain` nei contenitori che scorrono
   dentro un overlay, `overscroll-behavior-x: none` sulla board, `touch-action`
   dove il gesto è solo orizzontale.
2. **Tap highlight**: `-webkit-tap-highlight-color: transparent` (+ lo stato di
   pressione, che esiste già).
3. **Testo**: scala in `rem` (così l'impostazione di testo del sistema conta),
   gancio `--fs-scale` per una futura preferenza in-app, `text-size-adjust: 100%`.
   Le prove E2E che leggono i token vanno rese **risolventi** (px calcolati), non
   stringhe.
4. **Safe area laterali**: `--safe-left`/`--safe-right` + utility: la board si usa
   in orizzontale e oggi lì non c'è nessuna protezione.
5. **Primi due livelli del vetro, già con la via d'uscita**: token `--glass-rim`
   (bordo) e `--glass-highlight` (luce di bordo interna) letti subito da
   `.nav-surface` su iOS, più il blocco
   `@media (prefers-reduced-transparency: reduce)` che li spegne e
   `@media (prefers-contrast: more)` che li rinforza. Su Android sono trasparenti:
   nessun vetro, com'è giusto. Così M10 non deve inventarsi il fallimento
   accessibile.
6. **Area di tocco iOS**: espansione **invisibile** a 44pt su bottoni e chip
   (`::after` centrato, `max(100%, var(--touch-min))`), opt-out `.touch-dense` per
   le barre dense. Su Android **non** si fa così: si dichiara il perché (ripple →
   `overflow: hidden`) e si passa la palla alla taglia vera di M9.
7. **Contratti**: `check-design-tokens.mjs` cresce di un controllo nuovo — *un
   token dichiarato in un blocco di piattaforma e mai letto è un errore* — che oggi
   boccia `--elevation-nav`; il token trova poi il suo lettore su Android (ombra di
   elevazione sulla barra al posto del filo, che è quello che M3 vuole).
8. **Prove E2E** nuove: token risolti in px, vetro spento con
   `prefers-reduced-transparency`, area di tocco ≥ 44pt su iPhone.

### M7 — Il motore di moto (molle, due schemi)
*La milestone che rende possibile tutto il resto: M3 Expressive è moto, e Liquid
Glass senza molla non è liquido.*
1. **Token di molla** al posto (o accanto) delle durate: per Android le due
   famiglie di M3 Expressive — **spatial** (posizione/dimensione) ed **effects**
   (colore/opacità) — con i tre preset ciascuna (fast/default/slow) e i due schemi,
   **standard** (sobrio) ed **espressivo** (rimbalzo); per iOS le molle "smooth /
   snappy / bouncy" che i riferimenti iOS 26 usano.
2. **Implementazione**: `linear()` (Safari 17.4+/26 e Chromium) con ripiego sulle
   `cubic-bezier` attuali, e, dove serve vera interattività (trascinamento),
   Web Animations o le molle già presenti via `motion`.
3. **La regola che conta**: moto **guidato dall'utente** (tap, apertura di un
   foglio, cambio pagina voluto) → schema espressivo; moto **osservato** (barra di
   progresso, avanzamento automatico, skeleton) → schema standard. Senza questa
   distinzione le molle rendono l'app stancante.
4. **Risposta alla pressione**, separata per piattaforma: iOS scatto di scala
   (0.96) con rilascio a molla e luce di bordo che si accende; Android **morph di
   forma** (M9) più state layer, come già fa.
5. `prefers-reduced-motion` continua a spegnere tutto: le molle collassano su una
   durata secca, non spariscono di scatto.
6. **Misura**: il moto si prova guardandolo, quindi la milestone include una
   pagina di sonda (come `theme-inspector` fa per i colori) con tutte le transizioni
   fianco a fianco, su entrambe le skin.

### M8 — Chrome di navigazione (iOS + Android)
1. **iOS**: barra flottante a capsula (geometria iOS 26, non più i 49pt col filo),
   titolo grande che si riduce scorrendo, comando indietro, **gesto di ritorno dal
   bordo** (partenza nei primi ~20px, blocco della direzione, e non deve litigare
   con lo swipe dei mesi della board).
2. **Android**: top app bar Material (small/medium, stato «scrolled» quando il
   contenuto le passa sotto), navigation bar espressiva (vedi M9 per la forma), e
   il **back di sistema che chiude l'overlay più in alto** — contratto unico
   (`useBackToClose`, come `chiedi()` per le conferme): all'apertura di un overlay
   si scrive uno stato di history, `popstate` lo chiude.
3. **Predictive back**: `@view-transition { navigation: auto }` (Chromium 126+ e
   Safari 18.2+): su Android Chrome mostra l'anteprima animata del gesto indietro,
   su Safari dà la transizione dal bordo, e in entrambi i casi sostituisce la
   dissolvenza scritta a mano di `PageTransitionWrapper`.
4. **Fogli trascinabili** (entrambe le piattaforme): chiusura verso il basso con
   resistenza, velocità e ritorno a molla; la scriminatura diventa l'affordance di
   un gesto vero. Su iOS i detents (parziale/completa) approssimati.
5. **Scroll edge effect** HIG 26 / stato «scrolled» M3: il contenuto che scorre
   sotto la barra sfuma con una **maschera**, non con un secondo strato di vetro
   (costo GPU).

### M9 — Forme espressive (Android) — *il grosso della M3 Expressive*
1. **Sistema di morph**: token per le due forme di ogni controllo (a riposo /
   attivo) e transizione a molla fra le due. Dove basta, è `border-radius` +
   larghezza; dove la forma è davvero organica (loading indicator) serve un
   `clip-path` con lo **stesso numero di vertici** nelle due forme — è
   l'approssimazione che si può fare sul web, e va scritta come tale.
2. **Scala di forma a contrasto**: la libreria di 35 forme e la scala di raggi a
   10 gradini si usano per **gerarchia** (una superficie "squadrata" accanto a una
   arrotondata dice "questa è un'altra cosa"), non per decorare: si scelgono 3-4
   raggi espressivi e si documenta dove.
3. **I componenti, uno per uno**:
   - **Navigation bar**: la voce attiva si **allunga e si squadra** (oggi la
     pillola è statica);
   - **Icon button**: cerchio ↔ quadrato quando selezionato;
   - **Switch**: il pollice si **squadra** da acceso (oggi cresce e basta);
   - **Button group / segmented** (`turni-switch`): l'elemento scelto cambia raggio
     **e larghezza**, e i vicini si spostano;
   - **FAB**: esteso ↔ cerchio, e **FAB menu** (le azioni frequenti si aprono a
     ventaglio con molla) in alternativa al foglio attuale;
   - **Toolbar** M3E per la board (riga di azioni frequenti, può stare accanto al
     FAB);
   - **Loading indicator** a sette forme e **progress** ondulata;
   - **Split button** dove c'è un'azione primaria con varianti (conferme manager);
   - **Search**: il campo si squadra al focus (migliora la selezione persona).
4. **Scala di taglie XS–XL**: la scala espressiva arriva a 48dp per i bottoni
   primari → **il target Android si chiude qui**, con la taglia vera (M6 ha
   spiegato perché non si può fare con gli pseudo-elementi).
5. **Tipografia emphasized**: un asse di enfasi (peso/presenza) accanto alla
   misura, per i titoli di sezione. **Il pilastro "colore" di M3 Expressive non si
   adotta**: il progetto ha una regola sua (tema a 2 colori, chrome neutro) e
   stravolgerla per una moda sarebbe un danno. Si prendono forma, moto e tipografia.
6. **Elevazione tonale**: M3 non alza solo con l'ombra, **tinge** la superficie per
   livello (i token semantici `--surface-container*` esistono e sono letti una volta
   sola). Più l'increspatura estesa a voci di lista, card azionabili e voci della barra.
7. **Aptica** su pressione lunga e azioni distruttive (`navigator.vibrate`, solo
   Android: su iOS il web non ha aptica — dichiarato).

### M10 — Liquid Glass (iOS)
1. **Il composito a sei livelli** come token a livelli (velo / riposo / flottante):
   sfocatura+saturazione, tinta, bordo, luce di bordo, ombra, grana. I primi due
   arrivano da M6 già con la via d'uscita accessibile.
2. **Le superfici legittime**: barra flottante (M8), superficie delle azioni, foglio
   delle azioni, toast. **Non** i contenuti: il vetro è per il livello di
   navigazione, non per le card dei dati.
3. **Risposta al tocco**: scatto di scala + luce di bordo che si accende, rilascio
   a molla (M7).
4. **Angoli concentrici**: `--radius-inner: calc(--radius-outer - --inset)`,
   generalizzato (il precedente giusto esiste già nel thumb del segmented).
5. **Disciplina del composito**: mai due vetri sovrapposti senza un contenitore
   unico, e mai più di **tre** superfici di vetro insieme.
6. **Soglia di leggibilità**: qualunque testo su vetro passa 4.5:1 contro lo sfondo
   **peggiore** possibile; la matematica c'è (`lib/color.ts`) e va nel contratto.
7. **Chiusa solo da un iPhone vero**: sul simulatore il `backdrop-filter` annidato
   si comporta diversamente.

### M11 — PWA, stato di sistema e offline
1. **Manifest**: via `orientation: 'portrait'` (fix Android più visibile del
   piano), più `scope`, `id`, `lang: 'it'`, `dir`, `shortcuts`, `categories`,
   `display_override`, `screenshots`, la maskable 192; riga DEV sistemata.
2. **Chrome di sistema**: colore guidato dallo sfondo della pagina (Safari 26 non
   legge più il meta), `statusBarStyle: 'default'` con la regressione 26.1 scritta
   come regola, scelta consapevole per `#0a0a0a` (splash e barra Android al lancio),
   edge-to-edge su Android 15+.
3. **Offline**: `navigator.onLine` + eventi, banner non bloccante, stato della
   cache del service worker, possibilità di riprovare, `role="status"`.
4. **Install flow**: già presente; da allineare alle voci nuove del manifest.

### M12 — Adattività, accessibilità e comodità d'uso
1. **Adattività**: navigation rail M3E (≥600dp) e barra flessibile per i
   pieghevoli; layout largo su iPad; board in orizzontale con safe area laterali
   (M6) e controlli raggiungibili col pollice.
2. **Accessibilità**: giro completo con **VoiceOver** e **TalkBack** (la board è
   una tabella densa: è il punto peggiore), `role="status"` sugli aggiornamenti
   realtime, gestione del fuoco negli overlay, contrasto, riduzione del
   movimento/trasparenza già in M6.
3. **Comodità**: **undo** nella snackbar dove l'azione è reversibile (M3) e
   conferma solo dove non lo è; `inputMode`/`enterKeyHint`/`autocomplete` su tutti i
   campi; stati vuoti e di errore con una via d'uscita; "torna su" sulle liste
   lunghe; preferenza in-app per la dimensione del testo (usa `--fs-scale` di M6).
4. **Prestazioni**: budget dichiarato (max 3 vetri, board a 60fps) e **misurato sul
   telefono vero di ciascuna piattaforma**, non sul desktop.

---

## 4. Chi guadagna cosa

| Milestone | iOS | Android |
|---|---|---|
| M6 Igiene | area di tocco 44pt invisibile, safe area laterali, primi 2 livelli di vetro + spegnimento accessibile | scorrimento annidato corretto, tap-highlight, testo ingrandibile, elevazione della barra che finalmente si vede, contratto che non ammette più token morti |
| M7 Moto | molle in rilascio (è ciò che fa "liquido" il vetro) | sistema a molle di M3E, due schemi, driver vs osservato |
| M8 Chrome | barra flottante, titolo grande, gesto dal bordo, fogli trascinabili | top app bar, **back di sistema che chiude gli overlay**, predictive back, fogli trascinabili |
| M9 Forme | — (solo angoli concentrici condivisi) | morph su press/selezione, barra espressiva, switch, button group, FAB menu, loading a 7 forme, **taglia 48dp vera**, enfasi tipografica, elevazione tonale, aptica |
| M10 Vetro | il materiale completo, 6 livelli, capsula flottante | — (nessun vetro, per scelta) |
| M11 PWA | chrome dallo sfondo, regola 26.1 | **orientamento sbloccato**, shortcuts, screenshots, maskable, edge-to-edge |
| M12 Adattività | iPad, board in orizzontale | navigation rail, pieghevoli, talkback, undo |

---

## 5. Verifica (regole di casa, non nuove)

- `npx tsc --noEmit` e `npx eslint` sui file toccati (baseline nel knowledge).
- `scripts/check-design-tokens.mjs` **esteso, mai aggirato**; i ratchet scendono.
- `tests/design-piattaforma.spec.ts` esteso sui motori veri (WebKit/iPhone,
  Chromium/Pixel): mai a occhio. Prove che servono subito: token risolti in px,
  area di tocco ≥ 44pt, vetro spento con `prefers-reduced-transparency`, back di
  sistema che chiude l'overlay, manifest senza `orientation`.
- Il desktop resta identico al pixel: ogni regola nuova sta sotto
  `[data-platform='ios'|'android']`, e la suite E2E è la prova.
- `knowledge.md` aggiornato a fine milestone con le **regole durature**.

---

## 6. Cosa il web non può fare (per non prometterlo)

- **M3 Expressive non ha implementazione web**: tutto ciò che facciamo è
  un'approssimazione dei token e del moto. Le 35 forme ufficiali non esistono in
  CSS: si approssimano con `border-radius` e `clip-path`.
- **Liquid Glass non è rifrazione**: niente luce che piega, niente bagliore che
  risponde all'inclinazione del telefono. È un composito di sfocatura, tinta,
  bordi e ombre.
- **Niente squircle nativi su Safari** (`corner-shape` è solo Chromium 139+).
- **Niente vetro sotto la barra di stato** in standalone dopo iOS 26.1.
- **Niente aptica su iOS** (solo Android, via `navigator.vibrate`).
- **Niente detents nativi** dei fogli iOS: si approssimano.
- **`theme-color` non è affidabile su Safari 26**: il chrome si guida con lo sfondo.
