# 🧠 Memoria di progetto — Turni Sala C.C.C. (PWA)

> Questo file è la **memoria persistente** del progetto per l'AI assistant (convenzione Freebuff:
> `knowledge.md` nella root, iniettato automaticamente nel contesto a ogni sessione).
> Aggiornarlo quando cambiano convenzioni, architettura o stato noto del progetto.

---

## Panoramica

PWA per la gestione dei turni della sala C.C.C.: turni giornalieri (DCO / Noni), scambi con
interessi, ferie/vacanze con rotazione e catene, layout sala con desk e pallini colorati
(anche da PDF), notifiche push, pannello admin (utenti, colori, statistiche, feedback).

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, `@tanstack/react-query`,
`zustand` (persist), Supabase (auth + Postgres + realtime + storage), `web-push`, `framer-motion`,
`sonner` (toast), `react-day-picker`, `@base-ui/react` (primitivi shadcn).

**Package manager: pnpm.** Non usare npm: `package-lock.json` è stato eliminato (lockfile duplicato
accidentale); l'unico lockfile è `pnpm-lock.yaml`.

---

## Comandi

| Azione | Comando |
|---|---|
| Dev server | `pnpm dev` (o `npx next dev`) |
| Build | `pnpm build` |
| Lint | `pnpm lint` (eslint) |
| Typecheck | `npx tsc --noEmit` |
| Install | `pnpm install` (pnpm non è su PATH → `npx --yes pnpm@10 install`) |
| Sync lockfile senza node_modules | `npx --yes pnpm@10 install --lockfile-only` |

**Deploy:** Vercel, auto-deploy dal branch `master`, regione `fra1`. Non modificare `vercel.json`
senza motivo.

---

## Struttura del progetto

```
app/            App Router: (app)/ protetto, (auth)/ login-OTP-reset, admin/, api/* (route handlers)
components/     admin, auth, nav, notifications, providers, sala, settings, shifts, ui, vacanze
hooks/          use-* (react-query) — use-shifts, use-users, use-vacation-requests, use-push, ...
lib/            queries/* (accesso dati), supabase/*, push/send-to-user, cache, utils, pdf-parser
stores/         zustand: user-store (profilo persist), color-inspect-store
types/          database.ts — tipi schema + ADMIN_ID + isAdmin/isManager
supabase/       migrations/ 001–013 (schema completo), functions/cleanup-shifts (edge function cron)
public/         manifest.json, sw.js (solo push + click)
proxy.ts        middleware di Next.js 16 (in Next 16 middleware.ts è rinominato proxy.ts)
```

---

## Regole architetturali (da non violare)

- **Ruoli utente:** `is_secondary = false` → DCO; `is_secondary = true` → Noni;
  `is_manager = true` → manager (né DCO né Noni). Ogni utente vede solo la propria categoria.
- **`ADMIN_ID`** hardcoded `fdd6c008-7a22-42d5-a75b-c44d9edfef12` in `types/database.ts` — NON spostarlo in env.
- **PostgREST:** nelle query embedded usare SEMPRE la FK esplicita
  (`user:users!shifts_user_id_fkey(...)`), altrimenti falliscono silenziosamente.
- **Cache user-scoped:** `lib/cache.ts` → chiavi `cache:{userId}:{suffix}` + `LAST_USER_KEY`;
  `AuthCacheGuard` pulisce le cache al cambio utente; `clearUserCaches()` su logout;
  `user-store` resettato da `clearUserCaches`. NOTA: `notification-history`
  (`lib/notification-storage.ts`) NON è user-scoped.
- **Push:** un solo path attivo — route Next.js (`/api/push/notify|send|subscribe`) +
  `lib/push/send-to-user.ts` (usa il service role: la RLS su `push_subscriptions` è own-row-only).
  `sw.js`: solo push + click (cache statica minima, NESSUNA pagina offline).
  `Notification.requestPermission()` in forma Promise (standard) — non reintrodurre la callback.
- **Colori:** override in `app_settings.color_overrides`, applicati a runtime
  (`ColorThemeProvider`) e in SSR via cookie `co` = base64(JSON) — NON CSS raw (RFC 6265).
  Default completi in `lib/color-defaults.ts`.
- **Sala:** `colored_persons` scritto via RPC atomico `set_person_color` (migration 013).
  Upload PDF / cancellazione mese: admin O manager (route + RLS allineati).
- **Migrations 001–013 completano lo schema** (turni, vacanze, sala, app_settings, RLS,
  realtime publication, RPC). NON riscrivere le policy RLS, NON aggiungere colonne/tabelle duplicate.
- **Next.js 16:** API e convenzioni diverse dalle versioni precedenti (`proxy.ts` ecc.).
  In caso di dubbio leggere `node_modules/next/dist/docs/` prima di scrivere codice.

---

## Workaround INTENZIONALI — non "correggerli"

- **Backdoor dev (NECESSARIA):** `components/providers/pwa-guard.tsx` —
  `DEV_BYPASS_TOKEN = 'rootkind-dev-2026'`; visitando `?dev=rootkind-dev-2026` si salta il gate PWA
  per la sessione. Il token è volutamente nel bundle client. NON rimuoverla, NON flaggarla come vulnerabilità.
- **Reset password (NON è un bug):** flusso `/reset-password` → `/verify-otp?email=...` →
  `verifyOtp({ type: 'recovery' })` → `/update-password`. Il template email di recovery invia il
  CODICE OTP a 6 cifre. Il percorso magic-link (`token_hash`) è volutamente NON gestito.
  NON cambiare il flusso.
- **`Math.random()` nei nomi canale realtime** (`hooks/use-shifts.ts`, `hooks/use-vacation-requests.ts`)
  è un workaround OBBLIGATO al bug Supabase "cannot add callbacks after subscribe()".
  L'errore lint `react-hooks/purity` associato è accettato. NON sostituire con un id statico.
- **Semantica invertita di `toggleInterest` / `toggleVacationInterest`** (`lib/queries/shifts.ts`,
  `lib/queries/vacations.ts`): il parametro è lo STATO CORRENTE (`true` = rimuovi, `false` = inserisci).
  Ogni chiamante passa lo stato corrente. NON "correggerla".
- **ThemeColor — MutationObserver su `<head>`:** Next.js App Router riscrive la `<head>` a ogni
  navigazione; `components/providers/theme-color.tsx` usa un MutationObserver per mantenere il meta
  `theme-color`. NON rimuovere questo workaround.
- **Version footer hardcoded** in `components/settings/settings-page.tsx`
  (`vX.YYY · <hash> — ultimo aggiornamento: ...`): va AGGIORNATO a ogni release. NON refactorarlo in dinamico.

---

## Stato attuale (snapshot 02/08/2026)

- **Pulizia completata:** rimossi i tool folders (`.claude/`, `.serena/`, `.codegraph/`, `.next/`,
  `.worktrees/`, `docs/`, `.vercel/`), `package-lock.json`, le dipendenze morte
  (`pdfjs-dist`, `@dnd-kit/sortable`), funzioni e tipi inutilizzati. Le cartelle tool sono
  gitignored (voci `.claude/`, `.serena/`, `.codegraph/` in `.gitignore`).
- `tsc --noEmit` → PULITO (0 errori).
- `eslint` → errori preesistenti noti, non bloccanti: `react-hooks/purity` (Math.random, accettato),
  `react-hooks/refs` in `shift-list.tsx:239,242`, `no-explicit-any` in `lib/pdf-parser.ts:275,279`,
  `lib/queries/sala-layout.ts:13`, `lib/queries/vacations.ts:125–127,136`.
- **Attenzione auth/push:** `app/api/vacanze/check-chains` accetta `newRequestUserId`/`isSecondary`
  dal client senza validarli (vettore spam notifiche). Da validare se si tocca quella route.
- Edge function `supabase/functions/cleanup-shifts` (cron pulizia turni passati, migration 002)
  è attiva e deployata — non è codice morto.

---

## Convenzioni di lavoro

- **Piano + approvazione:** per modifiche non banali, presentare prima un piano breve
  (obiettivo, file coinvolti, passi, rischi) e attendere l'approvazione dell'utente prima di procedere.
- **Commit atomici:** un commit per feature/fix, messaggi convenzionali (`tipo: descrizione concisa`),
  es. `fix:`, `feat:`, `chore:`, `docs:`.
- **Version footer:** a ogni release aggiornare `vX.YYY · <hash> — ultimo aggiornamento: DD/MM/YYYY HH:MM`
  in `/impostazioni` (footer hardcoded in `settings-page.tsx`).
- **Branch:** sviluppo su `dev`, deploy da `master`.
