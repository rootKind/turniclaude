# Spec: Controllo compatibilità turni + indicatore ordinale

**Data:** 2026-04-13  
**Progetto:** Turni Sala C.C.C. PWA  

---

## Panoramica

Due feature collegate per ridurre le richieste duplicate nella dashboard e migliorare la leggibilità quando più richieste cadono nella stessa data.

---

## Feature 1 — Controllo compatibilità pre-pubblicazione

### Obiettivo

Quando un utente sta per pubblicare una nuova richiesta di scambio turno, il sistema controlla se esistono già nella dashboard turni compatibili per la stessa data. Se trovati, interrompe il flusso e mostra un modal informativo prima di procedere.

### Definizione di compatibilità

Due turni sono compatibili se, per la stessa `shift_date`:

```
myOfferedShift ∈ theirRequestedShifts
E
theirOfferedShift ∈ myRequestedShifts
```

Il controllo esclude i turni dell'utente stesso (o dell'utente impersonato in modalità admin).

### Logica — `findCompatibleShifts`

Funzione pura da aggiungere in `lib/queries/shifts.ts`:

```ts
function findCompatibleShifts(
  shifts: Shift[],
  date: string,           // YYYY-MM-DD
  offeredShift: ShiftType,
  requestedShifts: ShiftType[],
  excludeUserId: string
): Shift[]
```

- Filtra `shifts` per `shift_date === date`
- Esclude i turni di `excludeUserId`
- Ritorna i turni dove `offeredShift ∈ shift.requested_shifts` **e** `shift.offered_shift ∈ requestedShifts`
- I dati vengono dalla cache TanStack Query già disponibile in `ShiftDialog` — nessuna chiamata DB aggiuntiva

### Flusso UX in `ShiftDialog`

1. L'utente compila data, turno offerto, turni accettati
2. Click "Pubblica" → si chiama `findCompatibleShifts`
3. **Nessun match** → pubblicazione normale (comportamento attuale)
4. **Match trovati** → si mostra il modal di compatibilità (stato `compatibleMatches` non vuoto); la pubblicazione viene sospesa
5. Dal modal l'utente sceglie:
   - **"❤️ Interessati a [nome]"** su uno dei match → chiama `toggleInterest`, chiude il dialog
   - **"Pubblica comunque"** → procede con la pubblicazione normale e chiude il dialog

### UI del modal di compatibilità

Il modal è uno stato aggiuntivo dentro `ShiftDialog` (non un componente separato). Quando `compatibleMatches.length > 0` viene mostrato un overlay verde sopra il form esistente.

**Elementi:**
- Header: `⚡ Match compatibile trovato` / `⚡ N match compatibili trovati`
- Per ogni match (card):
  - Nome utente
  - Badge `MATCH ✓`
  - Pills turno offerto → turni richiesti
  - Stato interessi:
    - Se 0 interessati: `♡ Nessuno ancora — saresti il primo`
    - Se N > 0: lista degli interessati con posizione ordinale (1°, 2°…) e tempo relativo + `→ Saresti il (N+1)°`
  - Bottone `❤️ Interessati a [cognome]` per ciascun match
- Footer: `Pubblica comunque la mia richiesta` (tasto secondario, larghezza piena)

### Comportamento in modalità impersonazione (admin)

- `excludeUserId` = `impersonatingUserId` (non `loggedInUserId`)
- L'azione "Interessati" usa la route admin `/api/admin/interests` come già fa `ShiftItem`

---

## Feature 2 — Indicatore ordinale nella dashboard

### Obiettivo

Per le richieste successive alla prima in una stessa data, sostituire il numero giorno ripetuto (già semitrasparente) con l'ordinale `2°`, `3°`, ecc. nel blocco data a sinistra.

### Logica — `ShiftList`

`ShiftList` già calcola `isSameDateAsPrevious` per ogni shift. Estendere il calcolo con `dateIndex`:

```ts
// dateIndex = quante volte questa data è già apparsa prima nella lista filtrata
// 0 = primo turno per questa data, 1 = secondo, ...
```

`dateIndex` viene passato come prop a `ShiftItem`.

### Rendering — `ShiftItem`

Quando `dateIndex > 0`:
- Il blocco data (già semitrasparente via `opacity-20`) mostra `${dateIndex + 1}°` centrato al posto di giorno + mese
- Font: `text-[16px] font-extrabold text-muted-foreground`
- La struttura del blocco (width, padding, colori) rimane invariata

Quando `dateIndex === 0` (o non passato): comportamento attuale.

La prop `isSameDateAsPrevious` rimane per il controllo del border-radius (non viene rimossa).

---

## File coinvolti

| File | Modifica |
|------|----------|
| `lib/queries/shifts.ts` | Aggiunge `findCompatibleShifts` (export) |
| `components/shifts/shift-dialog.tsx` | Stato `compatibleMatches`, modal inline, logica pre-submit |
| `components/shifts/shift-list.tsx` | Calcolo `dateIndex`, passa prop a `ShiftItem` |
| `components/shifts/shift-item.tsx` | Nuova prop `dateIndex`, rendering ordinale nel blocco data |

---

## Vincoli e note

- Nessuna nuova chiamata al DB: il controllo compatibilità usa la cache `useShifts` già presente in `ShiftDialog`
- Nessun optimistic update (coerente con il resto del progetto)
- Supporto dark/light mode: il modal usa le stesse classi Tailwind del resto del progetto
- La logica di compatibilità è pura (no side effects) per facilitare eventuali test futuri
