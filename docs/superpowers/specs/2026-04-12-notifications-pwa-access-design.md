# Design Spec: Notifications, PWA Access Control, Feedback List Swipe

**Date:** 2026-04-12  
**Status:** Approved

---

## 1. Notifiche — fix dinamico + guida stato `denied`

### Problema
Il permesso notifiche non si aggiornava in tempo reale dopo che l'utente concedeva/revocava dall'OS. Il listener `navigator.permissions.query().onchange` non si attiva in tutti i browser/PWA.

### Soluzione

**`hooks/use-push.ts`**
- Aggiungere listener `visibilitychange` che chiama `checkSubscription()` + aggiorna `Notification.permission` ogni volta che la pagina torna visibile (l'utente è uscito dalle impostazioni OS e rientra nell'app)
- Dentro `requestAndSubscribe`: dopo `setPermission(result)`, chiamare anche `checkSubscription()` esplicitamente

**`components/settings/settings-page.tsx`**
- Stato `'default'`: pulsante "Abilita notifiche push" → chiama `requestAndSubscribe()` (già presente, invariato)
- Stato `'denied'`: sostituire il banner rosso con un bottone "Come abilitare le notifiche" che apre un dialog
- Stato `'granted' && isSubscribed`: sezione toggle invariata

**Nuovo componente `components/settings/notification-help-dialog.tsx`**
- Dialog con due tab: **Android** / **iOS**
- Il tab selezionato di default viene rilevato automaticamente da `navigator.userAgent`
- Contenuto Android:
  1. Tieni premuta l'icona dell'app sulla home
  2. Tocca "Info app"
  3. Tocca "Notifiche"
  4. Abilita "Tutte le notifiche"
- Contenuto iOS:
  1. Apri l'app Impostazioni di iOS
  2. Scorri fino a "Turni" (o cerca il nome dell'app)
  3. Tocca "Notifiche"
  4. Attiva "Consenti Notifiche"
- Nessun link esterno, solo testo step-by-step

---

## 2. Admin Feedback List — swipe migliorato

### Problema
`animate={{ x: 0 }}` causava uno snap scattoso dopo il drag. Il background era statico, non reattivo al trascinamento.

### Soluzione

**`components/admin/feedback-list.tsx`**

Usare `useMotionValue` + `useTransform` per ogni card:

```
x (MotionValue)
  → background: da transparent a green-500/20 (x > 0) o red-500/20 (x < 0)
  → opacità icona Check: interpolata da 0 a 1 per x in [0, 56]
  → opacità icona Trash: interpolata da 0 a 1 per x in [-56, 0]
```

**Threshold action (>40px):**
- Drag destra (x > 40): anima card a x=300, poi chiama `markRead(id)` e rimuove dalla lista
- Drag sinistra (x < -40): anima card a x=-300, poi chiama `deleteFeedback(id)` e rimuove dalla lista

**Snap-back (≤40px):**
```js
transition: { type: 'spring', stiffness: 500, damping: 30 }
```

**Struttura per card:** ogni card usa il proprio `useMotionValue(0)` — non condiviso tra card.

---

## 3. Controllo accesso: browser vs PWA

### Regola

| Contesto | Pagina richiesta | Comportamento |
|----------|-----------------|---------------|
| Browser (non PWA) | qualsiasi | → redirect `/installa` |
| PWA | `/installa` | → redirect `/login` |
| PWA | qualsiasi altra | comportamento normale |

### Rilevamento PWA (client-side)

```ts
const isPWA =
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true
```

Questo non è disponibile lato server: il guard deve essere un Client Component.

### Implementazione

**`components/providers/pwa-guard.tsx`** (nuovo)
- Client Component
- Al mount: calcola `isPWA` e `pathname`
- Se non-PWA e pathname !== `/installa`: `router.replace('/installa')`
- Se isPWA e pathname === `/installa`: `router.replace('/login')`
- Mentre verifica: renderizza `null` (nessun flash di contenuto)
- Dopo verifica: renderizza `children`

**`app/layout.tsx`**
- Wrappa `{children}` con `<PwaGuard>`

### Pagina `/installa`

**`app/installa/page.tsx`** (nuovo)
- Nessuna autenticazione richiesta
- Titolo: "Installa l'app"
- Sottotitolo: "Apri questa pagina da Safari (iOS) o Chrome (Android) per installare l'app"
- Due tab: **Android** / **iOS** con istruzioni step-by-step
- Tab selezionata di default rilevata da `navigator.userAgent`
- Android:
  1. Apri Chrome e vai su [URL del sito]
  2. Tocca il menu ⋮ in alto a destra
  3. Tocca "Aggiungi a schermata Home" o "Installa app"
  4. Conferma toccando "Installa"
- iOS:
  1. Apri Safari e vai su [URL del sito]
  2. Tocca il pulsante di condivisione (□↑) in basso
  3. Scorri e tocca "Aggiungi a schermata Home"
  4. Tocca "Aggiungi"
- Nessun link al login (gli utenti browser non devono accedere all'app)
- L'URL del sito viene letto da `window.location.host` a runtime

---

## File coinvolti

| File | Azione |
|------|--------|
| `hooks/use-push.ts` | Modifica: fix dinamico visibilitychange |
| `components/settings/settings-page.tsx` | Modifica: sostituire banner denied con bottone + dialog |
| `components/settings/notification-help-dialog.tsx` | Nuovo: dialog istruzioni Android/iOS |
| `components/admin/feedback-list.tsx` | Modifica: swipe reattivo con MotionValue |
| `components/providers/pwa-guard.tsx` | Nuovo: guard client-side browser vs PWA |
| `app/layout.tsx` | Modifica: wrappa children con PwaGuard |
| `app/installa/page.tsx` | Nuovo: pagina guida installazione |

---

## Non incluso in scope

- Notifiche push in-app (già funzionanti)
- Modifica alla logica di autenticazione Supabase
- Animazioni elaborate nella pagina /installa
