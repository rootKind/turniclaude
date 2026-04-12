@AGENTS.md

# Turni Sala C.C.C. — PWA

## Cos'è questo progetto

PWA Next.js 16 (App Router) per la gestione degli scambi turni di un gruppo di lavoratori.
Deploy su Vercel, auto-deploy dal branch `master` di GitHub (`rootKind/turniclaude`).
Backend: Supabase (`zrbbzfingrdpdflkndgl`, progetto "turniclaude").

## Stack

- **Next.js 16** App Router, TypeScript
- **Supabase** — auth (GoTrue v2), database Postgres, Realtime, push subscriptions
- **TanStack Query v5** — data fetching e cache
- **Zustand** — stato globale (notification history)
- **Tailwind CSS v4** + shadcn/ui
- **Framer Motion** — animazioni
- **Sonner** — toast
- **next-themes** — dark/light mode (classe su `<html>`)
- **web-push** (VAPID) — notifiche push

## Struttura cartelle rilevanti

```
app/
  (app)/           ← layout con BottomNav; richiede auth
    dashboard/     ← lista turni
    vacanze/       ← placeholder "in arrivo"
    notifiche/     ← storico notifiche
    impostazioni/  ← settings utente
  admin/           ← pannello admin (solo ADMIN_ID)
  api/
    admin/create-user/   ← crea utente auth+profile
    admin/delete-user/   ← elimina utente auth
    admin/update-user/   ← aggiorna nome/cognome/password
    push/subscribe/      ← registra subscription push
    push/send/           ← invia notifica push a un utente
components/
  shifts/          ← ShiftList, ShiftItem, ShiftDialog, EditShiftDialog
  admin/           ← AdminPanel, FeedbackList, NotificationDialog, UserManagementDialog, EditUserDialog, CreateUserDialog
  settings/        ← SettingsPage, FeedbackDialog
  nav/             ← BottomNav
  auth/            ← LoginForm, OtpForm, ResetPasswordForm, UpdatePasswordForm
  providers/       ← QueryProvider, ThemeProvider, ThemeColor
hooks/
  use-shifts.ts    ← fetch turni + Realtime subscription
  use-current-user.ts
  use-push.ts      ← gestione permessi e subscription push
  use-notification-history.ts
lib/
  queries/shifts.ts
  queries/users.ts
  supabase/client.ts   ← singleton browser
  supabase/server.ts   ← server-side (cookies)
types/database.ts      ← tipi, ADMIN_ID, isAdmin(), isTurnista()
```

## Note importanti

### Admin
- `ADMIN_ID = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'`
- Il FAB centrale (lucchetto) nella BottomNav appare SOLO su `/impostazioni` quando loggato come admin

### Database — tabelle principali
- `public.users` — profili (nome, cognome, is_secondary, notification_enabled, notify_on_interest, notify_on_new_shift)
- `public.shifts` — turni (user_id, offered_shift, shift_date, requested_shifts[], highlight)
- `public.shift_interested_users` — interessi (shift_id, user_id)
- `public.feedback` — segnalazioni utenti
- `public.push_subscriptions` — endpoint push

### Query turni
Il campo `SHIFTS_SELECT` in `lib/queries/shifts.ts` usa la sintassi PostgREST con alias esplicito:
```
user:users!shifts_user_id_fkey(id, nome, cognome, is_secondary)
```
Senza il nome FK esplicito (`!fk_name`) le query embedded falliscono.

### Realtime
`hooks/use-shifts.ts` usa canali con nome univoco per istanza (`shifts-realtime-{isSecondary}-{random}`) per evitare il bug "cannot add callbacks after subscribe()".

### ThemeColor
`components/providers/theme-color.tsx` usa un `MutationObserver` sulla `<head>` per mantenere il meta `theme-color` corretto ad ogni navigazione (Next.js App Router riscrive la head).

### Push notifications
- Richiede `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` in `.env.local` / Vercel env
- Il SW è in `public/sw.js`
- `requestPermission` usa la forma callback per compatibilità Android Chrome

### Colori turni (CSS custom properties in globals.css)
```
pill-mattina    → blu
pill-pomeriggio → ambra/giallo
pill-notte      → viola
```

### Categorie utenti
- `is_secondary = false` → DCO
- `is_secondary = true` → Noni
I turni sono filtrati per categoria: ogni utente vede solo i turni della sua categoria.

## Cosa NON è implementato
- Pagina `/vacanze` (placeholder)
- Nessun optimistic update sulle mutazioni (ogni azione aspetta il refetch)
