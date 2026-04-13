# Admin Impersonation & Full Shift Control — Design Spec
**Data:** 2026-04-13  
**Progetto:** PWA Turni Sala C.C.C.

---

## Obiettivo

Aggiungere al pannello admin tre cluster di funzionalità:

1. **Impersonazione utente** — l'admin può vedere la dashboard esattamente come la vede un utente scelto, e agire per conto suo (creare/eliminare turni, segnalare interesse).
2. **Azioni admin su turni altrui** — l'admin può sempre modificare/eliminare qualsiasi turno; il bottone Zap (fulmine) viene riusato come trigger per questo menu contestuale; la feature di colorazione gialla (highlight) viene rimossa.
3. **Stat card cliccabile** — la card "Utenti registrati" nel pannello admin apre direttamente la gestione utenti.

---

## 1. Impersonazione Utente

### Tre entry point (tutti implementati)

**A — Tile nel pannello admin**  
Nuova ActionTile "Visualizza come utente" in `AdminPanel`. Al click apre un nuovo `ImpersonateDialog`: lista di tutti gli utenti (dal `/api/admin/users`) con nome e categoria. Al click su un utente → `router.push('/dashboard?as=USER_ID')`.

**B — Dropdown nell'header della dashboard**  
Accanto al badge DCO/Noni, un elemento di selezione utente solo per admin. Voci: "Io (admin)" + lista completa utenti. Cambiando voce → `router.push('/dashboard?as=USER_ID')` oppure rimuove il param.

**C — Bottone "Vedi" nella gestione utenti**  
In `EditUserDialog`, accanto ai campi di ogni utente, pulsante 👁 "Vedi dashboard" → `router.push('/dashboard?as=USER_ID')`.

### Stato impersonazione

- Memorizzato nel **query param URL** `?as=USER_ID` (sopravvive al refresh, navigabile con back/forward).
- Dashboard legge `searchParams.get('as')`, carica il profilo dell'utente target tramite `/api/admin/users` (già esistente).
- Quando `as` è valorizzato: `effectiveUserId = impersonatedUser.id`, `effectiveIsSecondary = impersonatedUser.is_secondary`.
- Il badge DCO/Noni mostra il nome dell'utente impersonato (non più cliccabile per switchare categoria — è determinato dall'utente).
- **Banner arancione** fisso in cima alla dashboard: `"👁 Stai vedendo come Mario Rossi — Esci"`. Click su "Esci" → `router.push('/dashboard')`.

### Azioni per conto dell'utente

Tutte le operazioni che coinvolgono `user_id` devono usare `effectiveUserId` anziché l'ID admin. Poiché l'RLS di Supabase lega ogni operazione a `auth.uid()` (che è sempre l'admin), le azioni impersonated vanno attraverso API route admin con service role:

| Azione | Implementazione |
|--------|----------------|
| Creare turno | `POST /api/admin/shifts` — payload `{ ...shift, user_id: effectiveUserId }` |
| Segnalare interesse | `POST /api/admin/interests` — payload `{ shift_id, user_id: effectiveUserId }` |
| Rimuovere interesse | `DELETE /api/admin/interests` — payload `{ shift_id, user_id: effectiveUserId }` |
| Eliminare turno | `DELETE /api/admin/shifts/[id]` (già necessario per feature 2) |
| Modificare turno | `PATCH /api/admin/shifts/[id]` (già necessario per feature 2) |

Tutte le route admin verificano `user.id === ADMIN_ID` e usano `SUPABASE_SERVICE_ROLE_KEY`.

### Propagazione dell'effectiveUserId

`effectiveUserId` e `effectiveIsSecondary` vengono passati in cascata:  
`DashboardPage` → `ShiftList` → `ShiftItem` e `EditShiftDialog`  
`DashboardPage` → `ShiftDialog`

`ShiftList` riceve anche `effectiveUserId?: string` (quando assente, usa `profile?.id`).

---

## 2. Admin — Azioni su Turni Altrui + Rimozione Highlight

### Rimozione highlight (Zap come highlight toggle)

- Il campo `highlight` sulla tabella `shifts` rimane nel DB ma non viene più usato dalla UI.
- La funzione `toggleHighlight` in `lib/queries/shifts.ts` viene rimossa.
- L'importazione di `toggleHighlight` e la logica relativa in `ShiftItem` vengono eliminate.
- `canSeeHighlight`, `isHighlight`, e l'icona Zap nell'header del turno spariscono.

### Nuovo uso del Zap: menu admin su turni altrui

Nei turni NON propri (o di altri utenti quando in impersonazione), l'admin vede nel pannello espanso i bottoni **Modifica** e **Elimina** — gli stessi che vede già per i turni propri. Il Zap non è più necessario come separato trigger; il pannello espanso è già aperto via click sulla riga.

Quindi:
- **Per turni propri** (admin o impersonato): Modifica + Elimina (invariati), senza Zap highlight.
- **Per turni altrui** (in modalità admin/impersonazione): stesso pannello espanso con Modifica + Elimina + lista interessati (già mostrata).
- Le operazioni delete/edit sui turni altrui usano le route admin (`DELETE /api/admin/shifts/[id]`, `PATCH /api/admin/shifts/[id]`).

### Logica `isOwn` estesa

```ts
const isOwn = shift.user_id === currentUserId || (isAdmin(loggedInUserId) && !isImpersonating)
```
No — meglio lasciare `isOwn = shift.user_id === effectiveUserId` e aggiungere `canAdminAct = isAdmin(loggedInUserId)`. Quando `canAdminAct` è true, il pannello espanso mostra sempre Modifica+Elimina, anche se `!isOwn`.

### Route admin per shift mutations

**`DELETE /api/admin/shifts/[id]/route.ts`**  
- Verifica admin, usa service role, cancella il turno per ID.

**`PATCH /api/admin/shifts/[id]/route.ts`**  
- Verifica admin, usa service role, aggiorna `requested_shifts` (e opzionalmente altri campi).

---

## 3. Stat Card "Utenti registrati" → Gestione Utenti

In `AdminPanel`, la `StatCard` "Utenti registrati" diventa un pulsante che al click imposta `setUsersOpen(true)`. Stile invariato, aggiunta di `cursor-pointer` e `hover:bg-accent`.

---

## Componenti nuovi/modificati

| File | Tipo | Cambiamento |
|------|------|-------------|
| `components/admin/impersonate-dialog.tsx` | NUOVO | Picker utente per impersonazione |
| `components/admin/admin-panel.tsx` | MODIFICA | Tile impersonazione + stat card cliccabile |
| `app/(app)/dashboard/page.tsx` | MODIFICA | Legge `?as`, banner, dropdown utente, passa effectiveUserId |
| `components/shifts/shift-list.tsx` | MODIFICA | Accetta `effectiveUserId` prop |
| `components/shifts/shift-item.tsx` | MODIFICA | Rimuove highlight, admin vede Modifica+Elimina su tutti, usa effectiveUserId |
| `components/shifts/shift-dialog.tsx` | MODIFICA | Crea turno via admin route se impersonating |
| `components/shifts/edit-shift-dialog.tsx` | MODIFICA | Edita turno via admin route se admin |
| `components/admin/edit-user-dialog.tsx` | MODIFICA | Bottone "Vedi dashboard" per ogni utente |
| `app/api/admin/shifts/route.ts` | NUOVO | POST (create) |
| `app/api/admin/shifts/[id]/route.ts` | NUOVO | PATCH + DELETE |
| `app/api/admin/interests/route.ts` | NUOVO | POST + DELETE (toggle interesse impersonato) |
| `lib/queries/shifts.ts` | MODIFICA | Rimuove `toggleHighlight`, aggiunge helpers admin |

---

## Vincoli e note

- La impersonazione è solo lato client/UI — non c'è un vero "token swap". Il service role bypassa RLS per le mutazioni.
- L'admin non può impersonare se stesso (il dropdown esclude il proprio ID).
- In impersonazione, il banner arancione è sempre visibile e ha sempre il bottone Esci.
- La navigazione "Esci" dalla impersonazione riporta a `/dashboard` senza param, mostrando la vista admin normale.
- Le notifiche push generate dalle azioni impersonated (nuovo turno, interesse) vengono inviate normalmente dall'edge function: il DB non sa che è stata l'admin ad agire.
