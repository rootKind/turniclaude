# Audit UI — Variante iOS (HIG) vs Android (Material 3)

**App:** Turni Sala C.C.C. (Next.js 16 App Router + Tailwind 4 + shadcn/Base UI + PWA, service worker con push)
**Data audit:** 19/09/2026
**Natura:** analisi statica del codice. Nessuna modifica al codice. I valori di contrasto indicati sono calcoli CSS/WCAG effettuati a mano sui token di `app/globals.css`, non misurazioni di runtime: dove un valore dipende da dati o da stile inline utente (pannello «Colori» di /tuoturno) è esplicitamente marcato come non verificabile staticamente.

**Fonti di riferimento citate** (verificate il 19/09/2026):
- Apple HIG: [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [Navigation bars](https://developer.apple.com/design/human-interface-guidelines/navigation-bars), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts), [Action sheets](https://developer.apple.com/design/human-interface-guidelines/action-sheets), [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets), [Menus](https://developer.apple.com/design/human-interface-guidelines/menus), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Color](https://developer.apple.com/design/human-interface-guidelines/color), [Dark mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode), [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics), [Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications), [Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding), [Launching](https://developer.apple.com/design/human-interface-guidelines/launching), [Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles), [Search fields](https://developer.apple.com/design/human-interface-guidelines/search-fields), [Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures), [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Inclusion](https://developer.apple.com/design/human-interface-guidelines/inclusion), [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback), [Touch input](https://developer.apple.com/design/human-interface-guidelines/touch-input).
- Material 3: [Navigation bar](https://m3.material.io/components/navigation-bar/overview), [Top app bar](https://m3.material.io/components/top-app-bar/overview), [FAB](https://m3.material.io/components/floating-action-button/overview), [Buttons](https://m3.material.io/components/buttons/overview), [Dialogs](https://m3.material.io/components/dialogs/overview), [Bottom sheets](https://m3.material.io/components/bottom-sheets/overview), [Snackbar](https://m3.material.io/components/snackbar/overview), [Chips](https://m3.material.io/components/chips/overview), [Switch](https://m3.material.io/components/switch/overview), [Text fields](https://m3.material.io/components/text-fields/overview), [Badges](https://m3.material.io/components/badges/overview), [Typography](https://m3.material.io/styles/typography/overview), [Color roles](https://m3.material.io/styles/color/roles), [Color system](https://m3.material.io/styles/color/system/overview), [Shape scale tokens](https://m3.material.io/styles/shape/shape-scale-tokens), [Elevation](https://m3.material.io/styles/elevation/overview), [Motion](https://m3.material.io/styles/motion/overview), [State layers](https://m3.material.io/foundations/interaction/states/state-layers), [Gestures](https://m3.material.io/foundations/interaction/gestures), [Design tokens](https://m3.material.io/foundations/design-tokens/overview), [Accessible design](https://m3.material.io/foundations/accessible-design/overview), [In-app notification](https://m3.material.io/foundations/communication/in-app-notification/overview).

> Nota metodologica: le pagine m3.material.io sono state in parte lette via fetch; dove il fetch è fallito (404 su alcuni path interni) le regole citate sono quelle ancora presenti sulle pagine componente/foundation raggiunte e sulle pagine di stile (typography, color roles, shape, elevation, motion, state layers). Le pagine HIG sono state lette tutte direttamente da developer.apple.com.

---

## 1. Sintesi esecutiva

L'app oggi ha **una sola skin per entrambe le piattaforme**: font Geist (non SF Pro, non Roboto), sistema di colori shadcn in oklch con palette fredda/grigia (nessun mapping ai ruoli M3 né ai colori semantici iOS), bottoni `rounded-lg`/pill senza state layer M3 né feedback iOS, navigazione a barra inferiore ibrida (una voce con etichetta a 7 px, un FAB al centro che cambia funzione per pagina, voci che nascondono l'etichetta), 15+ dialog centrati stile desktop, toast Sonner in alto al centro su entrambe le piattaforme.

Il codice è però **ben stratificato** (primitive `components/ui/*`, pagine che consumano hook e query condivisi, token centralizzati in `globals.css`), quindi il costo del doppio binario è soprattutto nella **rifattorizzazione di BottomNav, dei dialog e delle board dati** (desk-board, cell grid, tabella confronto), che oggi mescolano markup, dati e stile in un solo file.

**Top 10 problemi (per impatto sull'allineamento HIG/M3):**

| # | Problema | Severità | Dove |
|---|----------|----------|------|
| 1 | Barra inferiore con **azioni** (FAB, mini-FAB, azioni admin) mescolate a **destinazioni**; etichetta «Turni» a 7px illeggibile; «Turni Sala e Ferie» troppo lunga | Alta | `components/nav/bottom-nav.tsx` |
| 2 | FAB centrale che **cambia funzione per pagina** (crea turno, crea richiesta ferie, segnalazione, admin, cambio vista, menu azioni) — viola sia HIG che M3 (FAB = azione primaria stabile) | Alta | `bottom-nav.tsx` righe ~330–430 |
| 3 | Nessuna gerarchia tipografica piattaforma: Geist ovunque; niente SF Pro (iOS) né Roboto/type scale M3 (Android); decine di dimensioni arbitrarie (`text-[7px]`…`text-[20px]`) | Alta | `app/layout.tsx` (Geist), tutti i componenti |
| 4 | Colori non mappati ai ruoli M3 (surface/surface-container/primary-container ecc.) né al sistema iOS (systemBackground, secondarySystemGroupedBackground, fill); `--primary` è **nero** in chiaro e quasi-bianco in scuro → nessun colore di brand per il FAB/top bar come M3 si aspetta | Alta | `app/globals.css` righe 56–75, 261–272 |
| 5 | Dialog centrati floating con close «×» ghost: né stile **alert iOS** (centrati, due pulsanti in fila, niente ×) né **dialog M3** (centrati senza close, pulsanti testuali a destra) | Alta | `components/ui/dialog.tsx` righe 44–79 |
| 6 | Toast Sonner `position="top-center"` con icone custom: su Android il canale corretto è lo **snackbar** (bottom, azione inline, swipe); su iOS i toast non esistono nel linguaggio HIG (banners/notifications) | Media | `app/layout.tsx` (Toaster), `components/ui/sonner.tsx` |
| 7 | Target touch sotto 44 pt (iOS) e 48 dp (Android): bottoni `h-8` (32px) di default, mini-FAB overlay `w-10 h-10` (40px), switch 18,4×32 px, `<button>` manager w-5 h-5 (20px) | Alta | `button.tsx`, `switch.tsx`, `bottom-nav.tsx`, `shift-item.tsx` |
| 8 | Feedback di pressione: **nessun ripple/state layer M3** e **nessuna evidenza di tap iOS** (tinte uniformi, `hover:` inutili su touch); `active:translate-y-px` è l'unico feedback | Media | `button.tsx`, tutti i bottoni custom |
| 9 | Doppio binario di rilevamento piattaforma già presente ma informale: `@supports (-webkit-touch-callout)` per lo splash, UA sniffing per installazione — nessun contesto piattaforma condiviso per stile/comportamento | Media | `globals.css` (boot-splash), `app/installa/page.tsx`, `pwa-guard.tsx` |
| 10 | Raggi e forme incoerenti: `--radius: 0.625rem` con derivati, `rounded-full` per FAB (corretto per M3 corne→circular solo per alcune varianti), card 8–14px arbitrarie (`rounded-[10px]`, 14px split) | Media | `globals.css`, `shift-item.tsx`, `desk-card.tsx` |

**Stima d'impegno complessiva** (sviluppo senior frontend, inclusi test visivi su iOS Safari standalone + Chrome Android standalone):

| Fase | Contenuto | Stima |
|------|-----------|-------|
| 1. Fondamenta | token a due livelli (base + piattaforma), provider di piattaforma, font | 3–5 gg |
| 2. Navigazione | BottomNav iOS (tab bar) + NavigationBar M3, smistamento azioni | 4–6 gg |
| 3. Overlays | Alert iOS + Dialog/BottomSheet M3, action sheet/menu | 4–6 gg |
| 4. Controlli | Button/Switch/Input/Chip/Picker a doppia skin, ripple/state layer, touch target | 5–8 gg |
| 5. Board dati | Desk board, cell grid, confronto: rifattorizzazione + skin | 6–10 gg |
| 6. PWA specifics | theme-color dinamico, safe-area, install/push flows per piattaforma | 2–3 gg |
| **Totale** | | **24–38 gg** |

MVP credibile (fasi 1–3 + skeleton della 4): **12–18 gg**.

---

## 2. Inventario completo di pagine, popup, finestre e pulsanti

Layout: `app/layout.tsx` (root: font Geist, BootSplash, ThemeProvider+AuthCacheGuard+SwRegistrar+ThemeColor, QueryProvider, PwaGuard, ThemeInspector, Toaster richColors top-center), `app/(app)/layout.tsx` (shell autenticata, header + BottomNav + PageTransition), `app/(auth)/layout.tsx` (centrato, nessuna nav), `app/admin/layout` incluso in `(app)`.

### 2.1 Pagine

| Rotta | File | Cosa contiene oggi | Note invarianti |
|---|---|---|---|
| `/` | `app/page.tsx` | Redirect a `/dashboard` (nessun landing) | — |
| `/dashboard` | `app/(app)/dashboard/page.tsx`, client in pagina, `loading.tsx` | Lista scambi (`ShiftList`), header con titolo «Cambi turno», FAB è nel nav | gruppi per giorno, expand inline |
| `/vacanze` | `app/(app)/vacanze/page.tsx` | Richieste ferie (`VacationRequestList`), dialog nuova richiesta, `?new=1` apre dialog | header + filtri periodo |
| `/turnisala` | `app/(app)/turnisala/sala-page-client.tsx` + `loading.tsx` | Board piantina sala: toolbar (data+turno M/P/N, nav mese, filtro ricerca), desk board 3 colonne, minimi panel, edit toolbar, dialog calendario, dialog upload PDF, dialog cronologia | dnd-kit, highlight, flash |
| `/turniferie` | `app/(app)/turniferie/page.tsx` | Tabella periodi ferie 6 periodi + «Il mio periodo», filtro dipendente, swap ferie admin | — |
| `/tuoturno` | `app/(app)/tuoturno/tuoturno-client.tsx` + `loading.tsx` | Griglia mese personale con celle tinta, confronto multi-dipendente (44px), pannello colori, picker mese/anno con pallino PDF | override colori utente inline |
| `/notifiche` | `app/(app)/notifiche/page.tsx` | Lista notifiche (NotificationList), FAB → mini-FAB «tutte lette»/«elimina tutte» | badge, vuoto con testo |
| `/impostazioni` | `app/(app)/impostazioni/page.tsx` + `settings-page.tsx` | Lista voci: tema, notifiche (push), feedback, changelog, esci; FAB feedback se non admin, Lock→/admin se admin | switch tema, help dialog |
| `/notifiche` (bell) | `components/notifications/notification-bell.tsx` | Campanella con badge nel header di (app)/layout | apre /notifiche |
| `/admin` | `app/admin/page.tsx` + `admin-panel.tsx` | Pannello admin: statistiche, utenti, squadre, feedback, changelog, cleanup, notification debug, theme inspector, impersona | solo admin |
| `/admin/statistiche` | `app/admin/statistiche/page.tsx` + `stats-page.tsx` | Grafici attività + tabella utenti | — |
| `/login` | `app/(auth)/login/page.tsx` + `login-form.tsx` | Email+password, link reset, link installa | — |
| `/verify-otp` | `app/(auth)/verify-otp/page.tsx` + `otp-form.tsx` | 6 caselle OTP | — |
| `/reset-password` | `app/(auth)/reset-password/page.tsx` + `reset-password-form.tsx` | Email per reset | — |
| `/update-password` | `app/(auth)/update-password/page.tsx` + `update-password-form.tsx` | Nuova password | — |
| `/confirm-email` | `app/(auth)/confirm-email/page.tsx` | Conferma email (stato ok/errore) | — |
| `/installa` | `app/installa/page.tsx` | Istruzioni installazione PWA: branch UA (iOS: Condividi→Aggiungi a Home; Android: banner/istanza beforeinstallprompt) | — |
| Global | `components/providers/push-permission-prompt.tsx` | Banner prompt permesso notifiche dopo login | condizionato: primo login, non in standalone |

### 2.2 Overlay, popup, sheet, menu, toast

| Componente | File | Tipo | Comportamento oggi |
|---|---|---|---|
| Dialog base | `components/ui/dialog.tsx` | Dialog centrato, overlay `bg-black/10`+blur, `rounded-xl`, close × ghost absolute top-right, footer `flex-col-reverse → sm:flex-row justify-end` con bg muted | usato da quasi tutti |
| ShiftDialog | `components/shifts/shift-dialog.tsx` | Dialog nuova offerta: toggle pill M/P/N, calendar react-day-picker, `ios-dialog-fix` | calendar custom |
| EditShiftDialog | `components/shifts/edit-shift-dialog.tsx` | Idem per modifica | — |
| VacationRequestDialog | `components/vacanze/vacation-request-dialog.tsx` | Dialog richiesta ferie (periodo, tipo) | — |
| FeedbackDialog | `components/settings/feedback-dialog.tsx` | Dialog testo + invio | aperto anche da BottomNav FAB |
| NotificationHelpDialog | `components/settings/notification-help-dialog.tsx` | Dialog istruzioni permessi notifiche per piattaforma (iOS vs Android differenzia solo testo) | — |
| ChangelogDialog | `components/providers/changelog-dialog.tsx` | Dialog changelog full | — |
| ImpersonateDialog | `components/admin/impersonate-dialog.tsx` | Dialog selezione utente da impersonare | — |
| CompareVisibilityDialog | `components/admin/compare-visibility-dialog.tsx` | Dialog gestione visibilità confronto | — |
| UserManagementDialog | `components/admin/user-management-dialog.tsx` | Dialog gestione utenti (lista + azioni) | — |
| EditUserDialog | `components/admin/edit-user-dialog.tsx` | Dialog form utente | — |
| SquadreDialog | `components/admin/squadre-dialog.tsx` | Dialog squadre | — |
| NotificationDialog | `components/admin/notification-dialog.tsx` | Dialog invio notifica manuale | — |
| NotificationDebugDialog | `components/admin/notification-debug-dialog.tsx` | Dialog debug push (payload, token, log) | — |
| ShiftCleanupDialog | `components/admin/shift-cleanup-dialog.tsx` | Dialog pulizia turni (range date, checkbox conferma) | azione distruttiva |
| ChangelogManagerDialog | `components/admin/changelog-manager-dialog.tsx` | Dialog CRUD changelog | — |
| Sala: dialog calendario | dentro `sala-page-client.tsx` (panel react-day-picker con `.cal-panel`, `.cal-monthsel`) | dropdown/panel custom | picker mese/anno select |
| Sala: upload PDF | dentro `sala-page-client.tsx` | dialog drag&drop file | — |
| Sala: cronologia PDF | dentro `sala-page-client.tsx` | dialog lista upload | — |
| Sala: minimi per card | `components/sala/minimi-panel.tsx` | dialog/panel impostazione minimi | — |
| Sala: colori card | `components/sala/card-color-panel.tsx` | pannello colori persona | — |
| ColorPicker | `components/ui/color-picker.tsx` | pannello SV+Hue custom | usato da tuoturno e sala |
| Toast Sonner | `components/ui/sonner.tsx`, `<Toaster richColors position="top-center">` in `app/layout.tsx` | toast | usato ovunque (success/error/info) |
| GlobalLoadingBar | `components/ui/global-loading-bar.tsx` | barra top shimmer | su navigazioni |
| BootSplash | `components/providers/boot-splash.tsx` + CSS `.boot-splash` | splash overlay full-screen | solo iOS via `@supports` |
| Push permission prompt | `components/providers/push-permission-prompt.tsx` | banner di sistema a comparsa | — |
| PwaGuard | `components/providers/pwa-guard.tsx` | pagina/blocco "apri in app" fuori standalone | — |
| Mini-FAB overlay | `bottom-nav.tsx` | backdrop fisso + colonna bottoni con etichetta sopra il nav (4 varianti: manager sala, admin sala, ferie admin, tuoturno, notifiche) | — |
| Confirm delete inline | `shift-item.tsx` `confirmDelete` | i pulsanti «Elimina/Conferma/Annulla» dentro la card espansa | niente dialog di conferma |
| Manager reject inline | `shift-item.tsx` `managerAction='reject'` | textarea + bottoni dentro la card espansa | — |

### 2.3 Pulsanti e controlli (riassunto per tipologia)

| Controllo | File | Stato oggi |
|---|---|---|
| Button base | `components/ui/button.tsx` | cva, 6 varianti (default/outline/secondary/ghost/destructive/link), 8 size, `rounded-lg`, `h-8` default, active `translate-y-px`, focus ring 3px; `destructive` = solo tinta (bg 10% + testo rosso) |
| Icon button (primitive) | `button.tsx` size `icon`, `icon-xs`(24), `icon-sm`(28), `icon-lg`(36) | sotto 44/48 target |
| Switch | `components/ui/switch.tsx` | 32×18,4 px (default), 24×14 (sm), thumb `bg-background` |
| Input | `components/ui/input.tsx` | `h-8` (32px), `rounded-lg`, ring focus |
| Textarea | `components/ui/textarea.tsx` | simile Input |
| Select nativo | usato in `shift-item.tsx`, `sala-page-client` (picker mese/anno) | `rounded-lg border bg-background` |
| Tabs | `components/ui/tabs.tsx` | variante default `bg-muted` pill, variante line underline; h-8 list |
| Calendar | `components/ui/calendar.tsx` (react-day-picker) + override `.cal-panel` | selezione con `.picker-sel-m`, colore fisso |
| Chips/filtri | implementate ad hoc: `chip-selected`, `.chip-count`, filter bar di dashboard/sala (`Chip` inline in `shift-list.tsx`, `desk-board.tsx`, `stats-page.tsx`) | stili locali non riutilizzati |
| Badge | `components/ui/notification-badge.tsx` | pill destructive translucent + layer opaco di «taglio» |
| Pill turno M/P/N | `SHIFT_PILL_CLASSES` in `lib/utils.ts` + `.pill-*` | 3 tinte fisse, bordo 30% |
| Celle tinta tuoturno | `.cell-tint-*`, `.cell-day`, `.day-badge`, `.is-pend`, split halves | geometria complessa |
| Card sala | `.sala-card-*`, `.desk-card-highlight`, `.desk-card-flash`, `.sala-fit-text` | fit-text container query |
| FAB centrale | `bottom-nav.tsx` (w-12 h-12 = 48px) | primario pieno |
| Mini-FAB overlay | `bottom-nav.tsx` (w-10 h-10 = 40px) | secondari |
| Interest button | `shift-item.tsx` (`btn-interest-on`) | w-full h-9 |
| Manager pending/confirm micro-btn | `shift-item.tsx` (w-5 h-5) | 20px target |
| Toggle tema | `settings-page.tsx` Switch | — |
| Checkbox | `shift-cleanup-dialog.tsx` (input type checkbox nativo) | — |
| DnD handles | `desk-board.tsx` (dnd-kit, drag card intera) | — |
| Ricerca sala | input in toolbar + chip filtri | — |
| Back nav | assente: nessun header back arrow; dipende dal gesto/hardware back | — |

### 2.4 Stati condizionati da coprire

- **Ruoli**: dipendente / DCO+ / manager / admin (`isDcoPlus`, `isManagerView`, `isAdmin(loggedInUserId)`) — cambiano card, pulsanti nav, pannello admin, visibilità confronto.
- **Impersonazione**: banner `.banner-impersonate` in cima a tutte le pagine admin/utente impersonato + interests via API admin.
- **Pending/confirmed**: overlay `.pending-overlay`/`.confirm-overlay` sulle card + micro-bottoni manager.
- **Vuoti**: nessun turno (testo inline), nessuna notifica, nessun interessato, nessun periodo assegnato, nessun feedback.
- **Loading**: `loading.tsx` route-level (dashboard/turnisala/tuoturno), `YearGateSkeleton`, GlobalLoadingBar, shimmer interni, `verificando` con `opacity-60` sulla colonna data.
- **Errori**: `toast.error` (rete, elimina, manager), `catch` silenziosi su query (stati errore non sempre mostrati in pagina).
- **Offline**: nessun banner offline dedicato; cache SW + IndexedDB sala + toast di errore fetch. Da verificare a runtime il reale comportamento offline (non deducibile staticamente).
- **Push permission**: `push-permission-prompt.tsx` (banner) + `notification-help-dialog` (istruzioni differenziate iOS/Android nel solo testo).
- **Install**: `pwa-guard.tsx` + `/installa` (istruzioni per iOS/Android) + `beforeinstallprompt` su Android (da verificare il flusso reale a runtime).
- **Splash**: BootSplash iOS-only.
- **Theme inspector admin**: overlay sonda colori globale.

---

## 3. Problemi comuni a entrambe le piattaforme

**P1 — Touch target insufficienti** *(Alta)*
- Dove: `button.tsx` (default h-8 = 32px; icon-xs 24px; icon-sm 28px; icon-lg 36px), `switch.tsx` (32×18,4), `input.tsx` (h-8), micro-bottoni manager `shift-item.tsx` (w-5 h-5), mini-FAB 40px, chip filtri testuali ~24–28px.
- Regola: iOS «best practice: 44×44 pt» — [Touch input](https://developer.apple.com/design/human-interface-guidelines/touch-input) e [Layout](https://developer.apple.com/design/human-interface-guidelines/layout); M3 minimum target 48×48 dp — [Accessible design](https://m3.material.io/foundations/accessible-design/overview).
- Fix iOS: alzare h a 44pt su controlli primari e area hit estesa (padding trasparente) su icon button.
- Fix Android: alzare a 48dp; lo switch M3 usa 52×32dp con track.

**P2 — Tipografia piattaforma assente** *(Alta)*
- Dove: `app/layout.tsx` (`Geist`), classi `text-[7px]`…`text-[20px]` sparse (es. `bottom-nav.tsx` etichette, `shift-item.tsx` pill/card, `desk-card.tsx` fit-text).
- Regola: iOS — [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) (San Francisco, Dynamic Type, text styles); M3 — [Typography](https://m3.material.io/styles/typography/overview) (Roboto + type scale, role Display/Headline/Title/Body/Label).
- Fix: introdurre due scale (iOS: Large Title 34/BODY 17/FOOTNOTE 13 via SF con `font-family: -apple-system` e Dynamic Type rem-based; Android: Roboto + ruoli M3) e sostituire le size arbitrarie con token.

**P3 — Colori non mappati ai sistemi di ruolo** *(Alta)*
- Dove: `globals.css` `:root`/`.dark`: `--primary` nero (oklch 0.205) in chiaro, quasi-bianco in scuro; palette di card/pill a tinte fisse hex; nessun `--md-sys-color-*` né `--ios-*`.
- Regola: M3 — [Color roles](https://m3.material.io/styles/color/roles) (primary/on-primary/primary-container/surface/surface-container…), [Color system](https://m3.material.io/styles/color/system/overview); iOS — [Color](https://developer.apple.com/design/human-interface-guidelines/color) (semantic colors: label, systemBackground, secondarySystemBackground, systemFill, separator…) e [Dark mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) (alzare i piani, non invertire).
- Fix: due layer di token — livello base semantico (surface, elevated-surface, primary-action, destructive, success, warning, on-*) e livello piattaforma che rimappa ai ruoli HIG/M3.

**P4 — Overlay centrati universali, close × ghost** *(Alta)*
- Dove: `dialog.tsx` (overlay bg-black/10 + blur, rounded-xl, close ghost top-right, footer muted bg).
- Regola: iOS — [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) (centrati, titolo+messaggio, 1–2 pulsanti, niente ×; il dismiss è un pulsante esplicito) e [Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets) per i form; M3 — [Dialogs](https://m3.material.io/components/dialogs/overview) (centrati, icona opzionale, headline/support, pulsanti testuali a destra, niente × — il dismiss è mediante pulsanti o scrim).
- Fix iOS: due primitive — `Alert` (per conferme, max 2 azioni) e `Sheet` slide-up con grabber per form.
- Fix Android: `Dialog` M3 con pulsanti testuali a destra e scrim nera 32% senza blur; form lunghi in `BottomSheet`.

**P5 — Toast in alto al centro con icone custom** *(Media)*
- Dove: `app/layout.tsx` `<Toaster richColors position="top-center">`, `sonner.tsx`.
- Regola: M3 — [Snackbar](https://m3.material.io/components/snackbar/overview) (in basso, label+azione opzionale, 4–10 s, max uno alla volta, inverse surface) e [In-app notification](https://m3.material.io/foundations/communication/in-app-notification/overview); iOS — [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback): preferire alert/banner di sistema; toast persistenti in-app non fanno parte del linguaggio.
- Fix iOS: convertire i toast di successo in feedback inline/haptic + alert solo per errori bloccanti; su standalone iOS usarli come banner discreto.
- Fix Android: mappare su snackbar bottom con azione (es. «Annulla»).

**P6 — Azioni distruttive e conferme inline** *(Media)*
- Dove: `shift-item.tsx` (Elimina→Conferma inline nella card, rifiuto con textarea inline), `bottom-nav.tsx` «Elimina tutte» (mini-FAB rosso senza conferma prima dell'azione? — l'azione parte subito dal tap, nessuna conferma visibile nel codice).
- Regola: iOS — [Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts) per la conferma distruttiva (pulsante rosso a sinistra o sotto); M3 — [Dialogs](https://m3.material.io/components/dialogs/overview) con pulsante distruttivo testuale.
- Fix entrambe: conferma tramite alert/dialog centrato con chiarezza sull'irreversibilità.

**P7 — Raggi/shape non tokenizzati** *(Media)*
- Dove: `--radius: 0.625rem` + derivati; `rounded-[10px]` (shift-item), `rounded-xl` (dialog), 14px split halves, `rounded-full` per FAB, 6px day-badge.
- Regola: M3 — [Shape scale tokens](https://m3.material.io/styles/shape/shape-scale-tokens) (extra-small 4, small 8, medium 12, large 16, extra-large 28); iOS — angoli continui (corner smoothing) su card e sheet, radius coerente per gruppo di elementi.
- Fix: introdurre `--shape-xs/sm/md/lg/xl` mappati per piattaforma (iOS: card 10–12 continui, sheet 10 top; Android: 12/16/28 per sheet).

**P8 — Stati di pressione assenti/differenti** *(Media)*
- Dove: `button.tsx` (`active:translate-y-px`, `hover:` varianti), chip, card (`.desk-card-highlight` è stato, non pressione).
- Regola: M3 — [State layers](https://m3.material.io/foundations/interaction/states/state-layers) (hover 8%, focus 12%, pressed 12%, dragged 16%) + ripple; iOS — evidenza di pressione (dimm e scale leggero, non ripple) e [Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures).
- Fix: implementare PrimitiveButton con layer pressione per piattaforma (ripple Android via CSS/JS su pointerdown, iOS: opacity 0.6 + scale 0.98).

**P9 — Iconografia Lucide unica** *(Bassa)*
- Dove: tutte le icone da `lucide-react` (ArrowLeftRight, Palmtree, Lock…).
- Regola: iOS — [SF Symbols](https://developer.apple.com/design/human-interface-guidelines/) (nella pagina Buttons/Iconography di HIG): simboli coerenti col sistema; M3 — Material Symbols (icona outline/filled con pesi).
- Fix: mappare i nomi Lucide a simboli per piattaforma (es. `ArrowLeftRight` → `arrow.left.arrow.right` iOS, `swap_horiz` M3) tramite una componente `PlatformIcon`.

**P10 — Densità informativa e leggibilità** *(Media)*
- Dove: `sala-fit-text` riduce fino a 9px; `text-[10px]`/`text-[11px]` su card e nav; contrasti di alcune tinte (es. `--cell-rest-text #4a5057` su `#e4e6e9` ≈ 5.1:1 ok, ma `--pill-pomeriggio-text #a14a06` su `#fef3c7` ≈ 4.0:1 **sotto AA**) — valori calcolati manualmente, da verificare con contraster su runtime.
- Regola: HIG [Typography] (min 11pt leggibile) e [Accessibility]; M3 [Accessible design] (min 16sp per body? — M3 raccomanda 14sp min per label).
- Fix: alzare i minimi a 11–12px iOS / 12–14sp Android e aumentare contrasto pill ambra.

**P11 — Assenza di header/back coerente** *(Alta)*
- Dove: nessun NavigationBar/top-app-bar con back arrow; il back è lasciato al browser/hardware. Header autenticato (`(app)/layout.tsx`) mostra solo titolo+campanella.
- Regola: iOS — [Navigation bars](https://developer.apple.com/design/human-interface-guidelines/navigation-bars) (back chevron + titolo pagina precedente o titolo sezione, large title che collassa); M3 — [Top app bar](https://m3.material.io/components/top-app-bar/overview) (nav icon back, title, action icons).
- Fix: introdurre `TopBar` per piattaforma con back reale (router.back o fallback route) e titolo della sezione corrente.

**P12 — Focus/keyboard OK ma solo desktop-oriented** *(Bassa)*
- Dove: focus ring 3px `ring-ring/50` su Button/Switch/Input/Tabs; onKeyDown su ShiftItem row (Enter/Space) — già buono.
- Regola: HIG [Accessibility] e M3 [Accessible design]: focus visibile, ordine coerente.
- Fix: mantenere; aggiungere `:focus-visible` su card espandibili e board.

---

## 4. Problemi specifici iOS (HIG), item per item

**iOS-1 — La barra inferiore è una tab bar di nome ma non di semantica** *(Alta)*
- Posizione: `components/nav/bottom-nav.tsx` (intero file).
- Oggi: 3 voci di navigazione (Cambi, Il tuo turno, Turni Sala e Ferie) + Impostazioni, ma la prima voce «Cambi» è un **toggle** fra due pagine (dashboard↔vacanze), la quarta è un gruppo con due icone, il FAB centrale cambia funzione per pagina, e ci sono **mini-FAB overlay** sopra la barra per azioni admin. Etichetta «Turni» a 7px sotto le frecce.
- Regola: [Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) — una tab bar mostra **le sezioni dell'app a pari livello**; «avoid using a tab bar to enable actions»; le etichette devono essere brevi ma complete, non divise. Inoltre [Navigation bars] per il titolo di sezione.
- Fix iOS: tab bar con 4–5 sezioni stabili: Cambi turno, Cambi ferie, Il tuo turno, Turni sala, Impostazioni. Rimuovere il toggle: due voci distinte. Le azioni (nuovo turno, nuova richiesta, admin) vanno in un toolbar/pulsante «+» nell'header della sezione, non nel tab bar.

**iOS-2 — FAB inesistente in HIG** *(Alta)*
- Posizione: `bottom-nav.tsx` FAB centrale w-12 h-12.
- Regola: [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) + [Navigation bars]: le azioni primarie vivono in un **toolbar button** (angolo destro/sinistro della nav bar) o in un pulsante contestuale nella pagina, non in un pulsante flottante centrale.
- Fix: sostituire con `+` in nav bar (dashboard/vacanze) e menu (per admin/manager).

**iOS-3 — Mini-FAB overlay con etichette sopra la barra** *(Media)*
- Posizione: `bottom-nav.tsx` (tutti i 5 overlay).
- Oggi: backdrop + colonna di bottoni circolari 40px con etichette pill accanto, pop spring.
- Regola: [Menus](https://developer.apple.com/design/human-interface-guidelines/menus) — su iOS le liste di azioni contestuali sono un menu (context menu long-press o un `button` che apre un menu a tendina); [Action sheets](https://developer.apple.com/design/human-interface-guidelines/action-sheets) per scelte che confermano un'azione (dal basso, testo completo, azione distruttiva rossa in fondo).
- Fix: sostituire con action sheet (`Elimina tutte` rosso) o menu popover ancorato al pulsante; mantenere long-press per admin (già implementato: 500ms) come contesto.

**iOS-4 — Dialog vs Alert vs Sheet** *(Alta)*
- Posizione: `dialog.tsx` + tutti i dialog elencati in §2.2.
- Regola: [Alerts] per decisioni brevi (max 2 azioni); [Sheets] per form/creazione (slide-up con grabber, pulsanti in footer); [Action sheets] per scelte distruttive.
- Fix: ShiftDialog/EditShiftDialog/VacationRequestDialog/Feedback → Sheet; conferme di eliminazione/rifiuto → Alert con «Elimina» rosso; NotificationDebug etc → Sheet full-height.

**iOS-5 — Nessun large title / titolo di sezione** *(Media)*
- Posizione: header di `(app)/layout.tsx` (titolo statico per pagina? — da verificare a runtime, nel codice il titolo è impostato per-route).
- Regola: [Navigation bars]: large title nella pagina, collassa allo scroll; back con chevron.
- Fix: introdurre large title su Cambi/Turni/Impostazioni; mantenere inline title sulle board dati.

**iOS-6 — Material/tinta della status bar e safe area** *(Media)*
- Posizione: `viewportFit=cover` in `app/layout.tsx` (viewport) + `.safe-area-pt`/`.safe-area-pb`; `appleWebApp.statusBarStyle: 'default'`.
- Regola: [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) — rispettare safe area; [Dark mode] — la status bar deve leggersi sempre; il manifesto dichiara `theme_color #0a0a0a` (Android) e `statusBarStyle default` (iOS): in chiaro la status bar resta scura su sfondo chiaro.
- Fix iOS: settare `statusBarStyle: 'black-translucent'` (edge-to-edge) e usare `env(safe-area-inset-top)` sull'header, già parzialmente fatto; verificare tema chiaro.

**iOS-7 — Haptics assenti** *(Bassa)*
- Posizione: nessun `navigator.vibrate` nel progetto (verificato con grep su tutto `components/`, `hooks/`, `lib/`).
- Regola: [Playing haptics](https://developer.apple.com/design/human-interface-guidelines/playing-haptics) — feedback aptico per azioni confermate/distruttive.
- Fix: la web API non offre haptics su iOS Safari (non esiste); su Android `navigator.vibrate(10)` dove supportato. Dichiarare nei plan che l'haptics reale iOS è raggiungibile solo via app nativa/wrapper; nel web usare feedback visivo.

**iOS-8 — Tipografia** *(Alta)*
- Posizione: Geist via `next/font`, tutti i componenti.
- Regola: [Typography] — SF Pro per UI, Dynamic Type; testi minimi 11pt.
- Fix: `font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui` per iOS; ridimensionare via `rem` per Dynamic Type; portare le etichette a 11pt+.

**iOS-9 — Install prompt e splash** *(Bassa)*
- Posizione: `app/installa/page.tsx`, `boot-splash.tsx`, `manifest.ts` (`appleWebApp`).
- Oggi: splash iOS custom già presente (corretto secondo [Launching](https://developer.apple.com/design/human-interface-guidelines/launching)); istruzioni installazione via screenshot/testo.
- Fix: mantenere; aggiungere branch specifico per iOS 16.4+ (Aggiungi al Dock con in-app prompt quando disponibile).

**iOS-10 — Switch/checkbox** *(Bassa)*
- Posizione: `switch.tsx` (32×18,4), checkbox nativo in `shift-cleanup-dialog`.
- Regola: [Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles) — switch iOS 51×31 pt.
- Fix: variante iOS 51×31.

**iOS-11 — Picker data/time nativi** *(Media)*
- Posizione: calendar custom react-day-picker in ShiftDialog e sala-page (`.cal-panel`).
- Regola: [Pickers] in HIG (dentro [Patterns] e componenti): su iOS gli input `type="date"`/`time` aprono i picker di sistema — più familiari e accessibili.
- Fix: dove possibile usare `input type=date` nativo per iOS (già quando il form lo consente) mantenendo il custom per Android; oppure uniformare con uno sheet che contiene il calendario.

**iOS-12 — Badge campanella** *(Bassa)*
- Posizione: `notification-badge.tsx` (pill rossa translucent + layer opaco).
- Regola: [Notifications] — badge è contatore semplice; ok il concetto, il colore distruttivo non è standard (badge iOS è rosso pieno su app icon; in-app può essere tint grigio).
- Fix: usare tint primario o rosso pieno pieno (non 10% di opacità).

---

## 5. Problemi specifici Android (Material 3), item per item

**M3-1 — Navigation bar mancante: c'è una tab bar ibrida** *(Alta)*
- Posizione: `bottom-nav.tsx`.
- Regola: [Navigation bar](https://m3.material.io/components/navigation-bar/overview) — 3–5 destinazioni, icona 24dp con active indicator pill, etichette sempre visibili (label medium 12sp), badge opzionale.
- Fix: rimuovere il FAB dalla barra (M3 prevede FAB separato sopra la barra o bar con FAB incorporato solo se coerente — qui meglio FAB distaccato), attivare l'active indicator (pill color secondary-container), etichette a 12sp sempre.

**M3-2 — FAB: forma, posizione e semantica** *(Alta)*
- Posizione: `bottom-nav.tsx` FAB centrale; cambia funzione per pagina (crea/segna/admin/cambio vista/menu).
- Regola: [FAB](https://m3.material.io/components/floating-action-button/overview) — azione primaria **stabile** della schermata, 56dp, corne 16dp (extended) o circular, colore primary-container con on-primary-container, posizionato sopra la nav bar a destra (o al centro se incorporato); «avoid using a FAB for destructive or navigation actions».
- Fix: FAB 56dp destro sopra la nav bar con azione «+» coerente per pagina; per admin/manager usare menu (not icon swap). Per /turnisala la creazione non esiste: usare un icon button nella top app bar, non un FAB.

**M3-3 — Mini-FAB overlay → Menu o FAB menu** *(Media)*
- Posizione: `bottom-nav.tsx` overlay.
- Regola: [Menus](https://m3.material.io/components/menu/overview) — item con icona+testo su surface-container, elevation 2; oppure FAB menu per 3+ azioni.
- Fix: menu M3 (container rounded-lg, item 48dp, state layer).

**M3-4 — Dialog senza pulsanti testuali a destra, con ×** *(Alta)*
- Posizione: `dialog.tsx`.
- Regola: [Dialogs] — headline 24sp, support text, pulsanti text a destra (max 2), scrim 32%, shape extra-large (28dp), niente close ×.
- Fix: rimuovere ×, footer con 2 text buttons allineati a destra; shape 28dp.

**M3-5 — Bottom sheet assente** *(Media)*
- Posizione: nessuno (tutto dialog centrato).
- Regola: [Bottom sheets](https://m3.material.io/components/bottom-sheets/overview) — contenuto modale contestuale (filtri, colori, dettagli card) su surface-container-low, drag handle.
- Fix: usare bottom sheet per pannello colori, minimi, filtri, dettagli card espansa.

**M3-6 — Snackbar/toast** *(Media)*
- Posizione: `sonner.tsx` + Toaster top-center.
- Regola: [Snackbar] — inverse-surface bottom, testo + azione opzionale, 4–10s; l'errore non ha colore semantico (testo inverse), il feedback di successo è un testo.
- Fix: mappare toast.success/info su snackbar bottom (inverse surface); toast.error può restare snackbar o dialog per errori bloccanti.

**M3-7 — Chips/filtri non M3** *(Media)*
- Posizione: filtri dashboard (`shift-list.tsx` chip periodi/interessi), sala (chip M/P/N, chip-selected), stats-page.
- Regola: [Chips](https://m3.material.io/components/chips/overview) — assist/filter/input chips con outline, state layer, selected = secondary-container + check; height 32dp.
- Fix: uniformare con chip M3 a 32dp, selected con check e colore container.

**M3-8 — Tabs** *(Media)*
- Posizione: `tabs.tsx` (pill bg-muted) usata dove? (verificare le pagine che usano Tabs — admin stats).
- Regola: M3 [Tabs] (dentro components) — primary tabs con underline indicator active; secondary = segmented button.
- Fix: variante line con indicator; segmented button per 2–5 scelte (M3 component) al posto della pill bar.

**M3-9 — Switch** *(Media)*
- Posizione: `switch.tsx` 32×18,4.
- Regola: [Switch] M3 — track 52×32dp, thumb 16→24dp checked, colore primary su selected, outline su unselected.
- Fix: variante Android 52×32 con thumb animato.

**M3-10 — Ripple e state layer assenti** *(Alta)*
- Posizione: `button.tsx`, chip, card, nav item.
- Regola: [State layers](https://m3.material.io/foundations/interaction/states/state-layers) — overlay colore on-* con opacità per stato; ripple su pointerdown ([Gestures](https://m3.material.io/foundations/interaction/gestures)).
- Fix: componente `M3Ripple`/state-layer applicato via classe condivisa o wrapper `PlatformPressable`.

**M3-11 — Top app bar assente** *(Media)*
- Posizione: header generico in `(app)/layout.tsx`.
- Regola: [Top app bar] — small/top con title, nav icon, action icons; large/flexible per le pagine di contenuto.
- Fix: top app bar con titolo di sezione + back dove serve + action (campanella, admin).

**M3-12 — Elevazione/tinta superficie** *(Media)*
- Posizione: `--card` unico livello; dialog usa `bg-popover`; bordi 1px ovunque.
- Regola: [Elevation](https://m3.material.io/styles/elevation/overview) — level 0–5 con surface tint (colori role con elevazione); i bordi 1px non sono idiomatici M3 (si preferisce contrasto di superficie).
- Fix: mappare i livelli: nav bar level 2, dialog level 3, sheet level 1, FAB level 3; ridurre i bordi a separatori.

**M3-13 — Typography scale** *(Alta)*
- Posizione: Geist ovunque + size arbitrarie.
- Regola: [Typography] — Roboto Flex/Google Sans, role: display/headline/title/body/label con weight 400/500.
- Fix: `font-family: Roboto, "Noto Sans", system-ui` per Android + token di scala.

**M3-14 — Badge** *(Bassa)*
- Posizione: `notification-badge.tsx`.
- Regola: [Badges](https://m3.material.io/components/badges/overview) — dot o count su primary/error, 6/16dp, posizionato sull'angolo dell'icona.
- Fix: usare error color pieno, contatore alto 16dp.

**M3-15 — Motion** *(Media)*
- Posizione: framer-motion espansioni card (height/opacity 200ms), `fab-mini-pop` spring, loading-bar shimmer, page transitions.
- Regola: [Motion](https://m3.material.io/styles/motion/overview) — easing emphasized, durata 200–500ms; transizioni di pagina coerenti (shared axis per nav, container transform per sheet).
- Fix: aggiustare curve (emphasized-decelerate) e durate; mantenere prefers-reduced-motion (già gestito per fab-mini-pop/month-pop).

**M3-16 — PWA Android specific** *(Media)*
- Posizione: `manifest.ts` (theme_color #0a0a0a, background #0a0a0a, display standalone, portrait), `pwa-guard.tsx`, `installa/page.tsx`.
- Regola: M3 — theme-color deve seguire il tema (chiaro/scuro) e la superficie; edge-to-edge in standalone.
- Fix: theme-color dinamico via ThemeColor provider (già esiste) per Android browser UI; verificare splash screen icona maskable (mancante nel manifest: aggiungere `purpose: 'maskable'`).

**M3-17 — Testo/codici lunghi con fit** *(Bassa)*
- Posizione: `.sala-fit-text`, `.cell-fit-text` (container query).
- Regola: M3 type scale non prevede fit dinamico, ma accessibile; ok tecnica, valutare min size.
- Fix: mantenere, abbassare soglia minima a 10–11sp dove possibile.

---

## 6. Accessibilità

**A1 — Contrast pill/pill text sotto AA in alcune tinte** *(Alta)*
- Dove: `--pill-pomeriggio-text #a14a06` su `--pill-pomeriggio-bg #fef3c7` ≈ 4.0:1 (calcolo manuale); `--cell-m-text #5c729a` su `--pill-mattina-bg #dbeafe` ≈ 3.4:1 (calcolo manuale); `--cell-avail-text #1d5568` su `#d6ecf5` ≈ 6:1 ok. In dark, tinte scure con testo chiaro ok.
- Regola: M3 [Accessible design] (4.5:1 testo normale) e HIG [Accessibility] (min leggibilità).
- Nota: valori da verificare con strumento di runtime; il progetto ha già `lib/color.ts` con `contrastRatio` — riusarlo per test automatizzati sulle tinte generate dall'utente (pannello colori).

**A2 — Touch target** *(Alta)* — vedi P1 (44pt iOS / 48dp Android).

**A3 — Dynamic Type / font scaling** *(Media)*
- Dove: dimensioni in px fissi (`text-[10px]`, `text-[7px]`, fit-text), layout a colonne fisse.
- Regola: HIG [Accessibility] (Dynamic Type), M3 (font scaling fino a 200%).
- Fix: passare a rem/sp e testare a scala 130–200%; il fit-text già protegge i codici lunghi.

**A4 — Screen reader su controlli custom** *(Media)*
- Dove: `ShiftItem` riga `role="button" tabIndex=0 aria-expanded` (buono), ma colonna data è `button` dentro un `role=button` (annidamento discutibile per VoiceOver), mini-FAB overlay ha solo aria-label sui bottoni e backdrop non trappo focus; dialog hanno DialogTitle (ben fatto in dialog.tsx) — verificare che tutti i dialog usino DialogTitle (alcuni come `card-color-panel` potrebbero non farlo).
- Regola: HIG [Accessibility], M3 [Accessible design].
- Fix: audit con VoiceOver/TalkBack; assicurare aria-label su tutti i controlli icon-only; focus trap nei dialog (Base UI lo fa).

**A5 — Stato conveyed by color alone** *(Media)*
- Dove: overlay pending/confirm sono tinte di sfondo (verde/rosso trasparente) senza icona o testo; is-pend è solo contorno ambra; differenza own/other è bordo.
- Regola: entrambe le guide richiedono simboli o testo oltre al colore.
- Fix: aggiungere icone (orologio per pending, check per confermato) accanto allo stato.

**A6 — Reduced motion** *(Bassa)*
- Dove: `@media (prefers-reduced-motion: reduce)` solo per `fab-mini-pop`/`month-pop`; framer-motion AnimatePresence non gestito; desk-card-flash volutamente attivo anche con reduced motion (scelta documentata nel codice, motion lento non lampeggiante).
- Fix: estendere a tutte le animazioni (framer `useReducedMotion`), rispettando la scelta documentata per il flash.

**A7 — Focus order e keyboard** *(Bassa)*
- Dove: row espandibile focusable con guard Enter/Space (buono); board dati non navigabile da tastiera (drag only).
- Fix: shortcut keyboard per azioni admin su board (non prioritario su mobile).

**A8 — Lang/labels** *(Bassa)*
- Dove: `lang="it"` ok; alert aria-label in italiano coerente; dialog Close sr-only è in inglese (`<span className="sr-only">Close</span>`).
- Fix: tradurre lo sr-only in italiano.

---

## 7. Architettura consigliata per le due versioni

### 7.1 Rilevamento piattaforma in PWA

Opzioni verificate nel codice oggi:
- CSS `@supports (-webkit-touch-callout: none)` (boot-splash) — affidabile per iOS Safari/standalone, non per iPadOS requestDesktop.
- UA sniffing (in `installa/page.tsx` e presumibilmente in `pwa-guard`) — fragile ma l'unica per distinguere Android Chrome da desktop Chrome senza feature detection.
- `matchMedia('(display-mode: standalone)')` — solo display mode, non OS.

Raccomandazione: **provider `PlatformProvider`** che calcola una volta `platform: 'ios' | 'android' | 'desktop'` combinando: UA data-driven (`navigator.userAgentData?.platform` dove esiste — Chromium; `iPad|iPhone|iPod` + `Macintosh && touch` per iOS), fallback UA regex, e override utente persistito in localStorage (`turni-platform-override`) per test/debug. Espone `usePlatform()` e aggiunge `data-platform="ios|android"` sul `<html>` per dirigere CSS (variabili e override).

Limiti da documentare: iPadOS desktop-mode mascherato, Firefox/Edge Android con UA standard Chrome ( userAgentData aiuta), PWA installate da browser minori; override utente come scappatoia.

### 7.2 Cosa condividere vs duplicare

**Condividere (tutto):**
- Logica dati: `lib/queries/*`, `hooks/*`, `stores/*`, `lib/sala-*`, `lib/shift-*`, parser PDF, push, cache IndexedDB.
- Contratti/props dei componenti di pagina (client.tsx restano gli stessi).
- Playwright tests (logica e flussi).
- `globals.css` livello base (spacing, container, safe-area, keyframes neutri).

**Duplicare (solo skin):**
- `components/ui/*` che restano nativi-visivi: Button, Dialog→(Alert/Sheet), Switch, Input, Tabs, Select, Badge, Snackbar, BottomNav, TopBar, FAB, Chip, Calendar skin.
- Token tipografici e colore per piattaforma.

### 7.3 Strategia raccomandata: design tokens + themed component layer (con wrapper per primitive strategiche)

Tre opzioni valutate:

1. **Solo token per piattaforma (CSS vars remapped)** — pro: minimo codice, già fattibile con `data-platform`; contro: non cambia la struttura dei componenti (dialog centrati restano centrati), non sufficiente per BottomNav/FAB/overlay che cambiano forma.
2. **Due set di componenti separati** (`components/ui-ios/*`, `components/ui-android/*`) — pro: massima fedeltà; contro: duplicazione totale (bug x2, manutenzione x2), esagerato per un'app di questa taglia.
3. **Tokens + componenti temizzati con wrapper per primitive strategiche** — pro: una sola API per le pagine, skin interna divisa per piattaforma dove serve (BottomNav, Dialog/Sheet, Switch, FAB, Snackbar), token per tutto il resto. Contro: componenti più complessi internamente.

**Raccomandazione: opzione 3.** Struttura proposta:

```
lib/platform.ts              → detectPlatform(), usePlatform(), override
components/platform/platform-provider.tsx  → setta data-platform su <html>
app/globals.css              → layer base + [data-platform='ios'] {...} + [data-platform='android'] {...}
components/ui/<primitive>/   → es. components/ui/button/{index.tsx, ios.tsx, android.tsx}
                                index sceglie in base a usePlatform()
```

Pagine e feature components importano solo `@/components/ui/button` ecc. e restano agnostici.

### 7.4 Componenti più difficili da dividere (per costo di rifattorizzazione)

| Componente | Difficoltà | Motivo |
|---|---|---|
| `bottom-nav.tsx` | Alta | contiene 5 overlay mini-FAB, logica ruoli, long-press, localStorage last-page, e cambia FAB per route: va smontato in BottomNav(skin) + ActionMenu(skin) + useNavActions(logica condivisa) |
| `sala-page-client.tsx` | Alta | orchestratore enorme (toolbar, dialog, upload, cronologia, minimi, drag): la logica va estratta in hook, la skin in componenti |
| `desk-board.tsx` / `desk-card.tsx` | Alta | dnd-kit + fit-text + highlight/flash: la geometria è sensibile, la skin tocca misure; testare con Playwright esistenti |
| `tuoturno-client.tsx` | Media/alta | griglia celle con override colori utente inline (style props) — il tema piattaforma deve convivere con override utente |
| `shift-item.tsx` | Media | expand + azioni manager inline + conferma elimina inline: da rifattorizzare verso alert/sheet condivisi |
| `calendar`/picker | Media | react-day-picker ha override CSS forti (.cal-panel): creare skin per piattaforma e mantenere il fix iOS `.ios-dialog-fix` |
| `sonner` Toaster | Bassa/media | wrapper per posizione/stile per piattaforma |

### 7.5 Piano di migrazione dallo stile unico

1. **Fondamenta** (pr senza cambiamenti visivi): platform provider, `data-platform` su html, doppio layer di token (base + piattaforma, con i valori attuali come default per entrambe le piattaforme), font system per piattaforma dietro flag. *Nessun impatto visivo.*
2. **Primitive switch**: migrare una primitive alla volta (Button → Switch → Input → Badge) con skin di default = stato attuale; poi skin iOS/Android reali.
3. **Overlay**: introdurre `Alert` e `Sheet` (iOS) e `Dialog M3` + `BottomSheet` (Android) come nuovi componenti; migrare i 15 dialog per casi (conferme→Alert/Dialog, form→Sheet/BottomSheet).
4. **Navigazione**: rifattorizzare BottomNav in useNavActions (logica) + TabBar(iOS)/NavigationBar(Android) + FAB Android/ToolBarButton iOS + ActionMenu/ActionSheet per i mini-FAB.
5. **Boards**: estrarre hook dati da desk-board/tuoturno; poi skin (spaziature, raggi, elevazione).
6. **PWA**: theme-color dinamico per piattaforma, splash, istruzioni install, push prompt skin.
7. **Pulizia**: rimuovere stili hardcoded, consolidare chips, uniformare raggi.

Ogni fase è rilasciabile; il flag di override permette QA su entrambe le skin da desktop.

---

## 8. Piano di lavoro a fasi con priorità e stima

| Fase | Contenuto | Priorità | Stima | Dipendenze |
|---|---|---|---|---|
| **F1 Fondamenta piattaforma** | PlatformProvider + `data-platform`, token a due livelli, font system per piattaforma, override utente | **Alta** | 3–5 gg | — |
| **F2 Touch target & accessibilità rapida** | Portare controlli a 44/48, contrasti pill, sr-only italiano, aria su icon-button | **Alta** | 3–4 gg | F1 |
| **F3 Navigazione** | TabBar iOS + NavigationBar M3 + TopBar per piattaforma; smistamento azioni (FAB Android, nav-bar button iOS, ActionSheet/Menu per admin); rimozione etichetta 7px | **Alta** | 4–6 gg | F1 |
| **F4 Overlay** | Alert iOS, Sheet iOS, Dialog M3, BottomSheet M3; migrazione dei 15+ dialog e conferme distruttive; Snackbar Android + feedback iOS | **Alta** | 4–6 gg | F1 |
| **F5 Controlli** | Button/Switch/Input/Chip/Tabs/Calendar a doppia skin; state layer/ripple; type scale; raggi tokenizzati | **Media** | 5–8 gg | F1, F2 |
| **F6 Board dati** | Desk board, cell grid, confronto: hook estratti + skin (elevazione, raggi, fit min) | **Media** | 6–10 gg | F5 |
| **F7 PWA specifics** | theme-color dinamico, splash skin, install flow iOS/Android, push prompt skin, maskable icon | **Media** | 2–3 gg | F1 |
| **F8 Motion & feedback** | Easing M3, transizioni pagina, haptics Android (vibrate), reduced-motion completo | **Bassa** | 2–3 gg | F5 |
| **F9 Iconografia** | PlatformIcon mapping Lucide → SF Symbols/Material Symbols | **Bassa** | 2–3 gg | F5 |
| **F10 Pulizia finale** | Rimozione stili inline hard-coded, consolidamento chips, audit contrasti automatizzato (lib/color.ts) | **Bassa** | 2–3 gg | tutte |

**Totale: 33–51 gg** (con sovrapposizione fasi: percorso critico ≈ 24–38 gg).

**Rischi:**
- Le board dati (/turnisala, /tuoturno) hanno comportamenti pixel-sensitive (fit-text, split, highlight, drag) protetti da test E2E: ogni cambio di geometria richiede rilancio suite (`bun run test:boards`, `test:logic`) — già previsto dal repository.
- iOS standalone: comportamento status bar/theme-color diverso tra Safari e standalone; verificare su device reali (non verificabile staticamente).
- UA sniffing su browser Android minori: mitigato da userAgentData + override utente.
- Contrasti indicati sono stime manuali: prima di F2 lanciare un audit con `lib/color.ts` sulle tinte generate anche dall'utente (pannello colori), che non è verificabile staticamente.

**Non verificabile staticamente (da testare a runtime):**
- Reale comportamento offline della PWA (SW + IndexedDB) e del prompt push su iOS ≥ 16.4 standalone vs Android.
- Effettiva resa della status bar (chiaro/scuro) su device.
- Contrasti reali percezionati con override colori utente attivi.
- Presenza/assenza di keyboard overlay issues sui form (nessun `visualViewport` handler nel codice).
