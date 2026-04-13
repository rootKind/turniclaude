# Shift Compatibility Check + Ordinal Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avvisare l'utente di match compatibili prima di pubblicare un nuovo turno, e mostrare un indicatore ordinale (2°, 3°…) per i turni con la stessa data nella dashboard.

**Architecture:** La logica di compatibilità è una funzione pura client-side che opera sulla cache TanStack Query già presente in ShiftDialog. Il modal di compatibilità è uno stato aggiuntivo dentro ShiftDialog. L'indicatore ordinale è calcolato in ShiftList e passato come prop a ShiftItem.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, TanStack Query v5, Tailwind CSS v4, shadcn/ui

---

## File Map

| File | Tipo | Responsabilità |
|------|------|----------------|
| `lib/queries/shifts.ts` | Modifica | Aggiunge `findCompatibleShifts` (export) |
| `components/shifts/shift-item.tsx` | Modifica | Nuova prop `dateIndex`, rendering ordinale nel blocco data |
| `components/shifts/shift-list.tsx` | Modifica | Calcolo `dateIndexes` con useMemo, passa prop a ShiftItem |
| `components/shifts/shift-dialog.tsx` | Modifica | Stato `compatibleMatches`, pre-submit check, modal inline |

---

## Task 1: Aggiungere `findCompatibleShifts` in `lib/queries/shifts.ts`

**Files:**
- Modify: `lib/queries/shifts.ts`

- [ ] **Step 1: Aggiungere la funzione pura alla fine del file**

Aprire `lib/queries/shifts.ts` e aggiungere alla fine, dopo `toggleHighlight`:

```ts
export function findCompatibleShifts(
  shifts: Shift[],
  date: string,
  offeredShift: ShiftType,
  requestedShifts: ShiftType[],
  excludeUserId: string
): Shift[] {
  return shifts.filter(s =>
    s.shift_date === date &&
    s.user_id !== excludeUserId &&
    s.requested_shifts.includes(offeredShift) &&
    requestedShifts.includes(s.offered_shift as ShiftType)
  )
}
```

Aggiungere anche l'import del tipo `ShiftType` se non presente — controllare la riga 1: attualmente il file importa solo `Shift` da `@/types/database`. Aggiornare l'import:

```ts
import type { Shift, ShiftType } from '@/types/database'
```

- [ ] **Step 2: Verificare che TypeScript non abbia errori**

```bash
cd C:/Users/david/Downloads/pwa-v2
npx tsc --noEmit 2>&1 | head -20
```

Atteso: nessun errore relativo a `lib/queries/shifts.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/shifts.ts
git commit -m "feat: add findCompatibleShifts pure function"
```

---

## Task 2: Indicatore ordinale in `ShiftItem`

**Files:**
- Modify: `components/shifts/shift-item.tsx`

- [ ] **Step 1: Aggiungere `dateIndex` all'interfaccia Props**

In `components/shifts/shift-item.tsx`, trovare l'interfaccia Props (riga 15-22):

```ts
interface Props {
  shift: Shift
  currentUserId: string
  loggedInUserId: string
  isSecondary: boolean
  isSameDateAsPrevious?: boolean
  onEdit?: (shift: Shift) => void
}
```

Sostituire con:

```ts
interface Props {
  shift: Shift
  currentUserId: string
  loggedInUserId: string
  isSecondary: boolean
  isSameDateAsPrevious?: boolean
  dateIndex?: number
  onEdit?: (shift: Shift) => void
}
```

- [ ] **Step 2: Destrutturare `dateIndex` nella firma della funzione**

Trovare la riga della firma del componente (riga 24):

```ts
export function ShiftItem({ shift, currentUserId, loggedInUserId, isSecondary, isSameDateAsPrevious = false, onEdit }: Props) {
```

Sostituire con:

```ts
export function ShiftItem({ shift, currentUserId, loggedInUserId, isSecondary, isSameDateAsPrevious = false, dateIndex = 0, onEdit }: Props) {
```

- [ ] **Step 3: Aggiornare il blocco data per mostrare l'ordinale**

Trovare il blocco data (righe 98-102):

```tsx
        <div className={cn('w-[52px] flex-shrink-0 flex flex-col items-center justify-center py-3', dateBgClass)}>
          <span className={cn('text-[20px] font-extrabold leading-none', isOwn && hasInterest ? 'text-green-400 dark:text-green-300' : '')}>
            {day}
          </span>
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{month}</span>
        </div>
```

Sostituire con:

```tsx
        <div className={cn('w-[52px] flex-shrink-0 flex flex-col items-center justify-center py-3', dateBgClass)}>
          {dateIndex > 0 ? (
            <span className="text-[16px] font-extrabold leading-none text-muted-foreground">{dateIndex + 1}°</span>
          ) : (
            <>
              <span className={cn('text-[20px] font-extrabold leading-none', isOwn && hasInterest ? 'text-green-400 dark:text-green-300' : '')}>
                {day}
              </span>
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{month}</span>
            </>
          )}
        </div>
```

- [ ] **Step 4: Verificare TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Atteso: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add components/shifts/shift-item.tsx
git commit -m "feat: shift-item renders ordinal badge for repeated dates"
```

---

## Task 3: Calcolo `dateIndex` in `ShiftList`

**Files:**
- Modify: `components/shifts/shift-list.tsx`

- [ ] **Step 1: Aggiungere il calcolo di `dateIndexes` con useMemo**

In `components/shifts/shift-list.tsx`, trovare il blocco degli `useMemo` esistenti (righe 32-42) e aggiungere dopo `filtered`:

```ts
  const dateIndexes = useMemo(() => {
    const count = new Map<string, number>()
    return filtered.map(s => {
      const idx = count.get(s.shift_date) ?? 0
      count.set(s.shift_date, idx + 1)
      return idx
    })
  }, [filtered])
```

- [ ] **Step 2: Passare `dateIndex` a ogni `ShiftItem`**

Trovare il blocco del map (righe 68-81):

```tsx
        {filtered.map((shift, index) => {
          const prev = filtered[index - 1]
          const isSameDateAsPrevious = !!prev && prev.shift_date === shift.shift_date
          return (
            <ShiftItem
              key={shift.id}
              shift={shift}
              currentUserId={effectiveUserId}
              loggedInUserId={loggedInUserId}
              isSecondary={isSecondary}
              isSameDateAsPrevious={isSameDateAsPrevious}
              onEdit={setEditingShift}
            />
          )
        })}
```

Sostituire con:

```tsx
        {filtered.map((shift, index) => {
          const prev = filtered[index - 1]
          const isSameDateAsPrevious = !!prev && prev.shift_date === shift.shift_date
          return (
            <ShiftItem
              key={shift.id}
              shift={shift}
              currentUserId={effectiveUserId}
              loggedInUserId={loggedInUserId}
              isSecondary={isSecondary}
              isSameDateAsPrevious={isSameDateAsPrevious}
              dateIndex={dateIndexes[index]}
              onEdit={setEditingShift}
            />
          )
        })}
```

- [ ] **Step 3: Verificare TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Atteso: nessun errore.

- [ ] **Step 4: Verifica visiva nel browser**

Avviare il dev server:
```bash
npm run dev
```

Aprire `http://localhost:3000`. Se in dashboard ci sono più turni nella stessa data, quelli successivi al primo devono mostrare `2°`, `3°` nel blocco data semitrasparente a sinistra, al posto del numero giorno ripetuto.

- [ ] **Step 5: Commit**

```bash
git add components/shifts/shift-list.tsx
git commit -m "feat: shift-list computes dateIndex and passes to ShiftItem"
```

---

## Task 4: Controllo compatibilità e modal in `ShiftDialog`

**Files:**
- Modify: `components/shifts/shift-dialog.tsx`

- [ ] **Step 1: Aggiornare gli import**

Trovare le righe di import (righe 1-16) e sostituire con:

```ts
'use client'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { cn, todayRome, formatDisplayName, formatRelativeTime, SHIFT_PILL_CLASSES } from '@/lib/utils'
import { createShift, findCompatibleShifts, toggleInterest } from '@/lib/queries/shifts'
import { SHIFTS_QUERY_KEY, useShifts } from '@/hooks/use-shifts'
import { useCurrentUser } from '@/hooks/use-current-user'
import { toast } from 'sonner'
import { it } from 'date-fns/locale'
import { format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import type { Shift, ShiftType } from '@/types/database'
```

- [ ] **Step 2: Aggiungere stato `compatibleMatches` e `effectiveUserId` nel componente**

Trovare il blocco degli state (righe 33-38):

```ts
  const [selectedDate, setSelectedDate] = useState<Date>()
  const [offeredShift, setOfferedShift] = useState<ShiftType | null>(null)
  const [requestedShifts, setRequestedShifts] = useState<ShiftType[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const queryClient = useQueryClient()
  const { profile } = useCurrentUser()
  const { data: shifts = [] } = useShifts(isSecondary)
```

Sostituire con:

```ts
  const [selectedDate, setSelectedDate] = useState<Date>()
  const [offeredShift, setOfferedShift] = useState<ShiftType | null>(null)
  const [requestedShifts, setRequestedShifts] = useState<ShiftType[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [compatibleMatches, setCompatibleMatches] = useState<Shift[]>([])
  const queryClient = useQueryClient()
  const { profile } = useCurrentUser()
  const { data: shifts = [] } = useShifts(isSecondary)

  const effectiveUserId = impersonatingUserId ?? profile?.id ?? ''
```

- [ ] **Step 3: Aggiornare `occupiedDates` per usare `effectiveUserId`**

Trovare (righe 41-45):

```ts
  const occupiedDates = new Set(
    shifts
      .filter(s => s.user_id === (impersonatingUserId ?? profile?.id))
      .map(s => s.shift_date)
  )
```

Sostituire con:

```ts
  const occupiedDates = new Set(
    shifts
      .filter(s => s.user_id === effectiveUserId)
      .map(s => s.shift_date)
  )
```

- [ ] **Step 4: Aggiornare `handleClose` per resettare `compatibleMatches`**

Trovare (righe 54-59):

```ts
  function handleClose() {
    onClose()
    setSelectedDate(undefined)
    setOfferedShift(null)
    setRequestedShifts([])
  }
```

Sostituire con:

```ts
  function handleClose() {
    onClose()
    setSelectedDate(undefined)
    setOfferedShift(null)
    setRequestedShifts([])
    setCompatibleMatches([])
  }
```

- [ ] **Step 5: Estrarre la logica di pubblicazione in `doPublish` e aggiornare `handleSubmit`**

Trovare l'intera funzione `handleSubmit` (righe 61-95) e sostituirla con:

```ts
  async function doPublish() {
    setIsSubmitting(true)
    try {
      if (impersonatingUserId) {
        const res = await fetch('/api/admin/shifts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            offered_shift: offeredShift,
            shift_date: format(selectedDate!, 'yyyy-MM-dd'),
            requested_shifts: requestedShifts,
            user_id: impersonatingUserId,
          }),
        })
        if (!res.ok) throw new Error('Admin shift create failed')
      } else {
        await createShift({
          offered_shift: offeredShift!,
          shift_date: format(selectedDate!, 'yyyy-MM-dd'),
          requested_shifts: requestedShifts,
        })
      }
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      toast.success('Turno pubblicato')
      handleClose()
    } catch {
      toast.error('Errore pubblicazione')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSubmit() {
    if (!selectedDate || !offeredShift || requestedShifts.length === 0) {
      toast.error('Compila tutti i campi')
      return
    }
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const matches = findCompatibleShifts(shifts, dateStr, offeredShift, requestedShifts, effectiveUserId)
    if (matches.length > 0) {
      setCompatibleMatches(matches)
      return
    }
    await doPublish()
  }

  async function handleInterest(shift: Shift) {
    try {
      if (impersonatingUserId) {
        const res = await fetch('/api/admin/interests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shift_id: shift.id, user_id: effectiveUserId }),
        })
        if (!res.ok) throw new Error('Interest failed')
      } else {
        await toggleInterest(shift.id, effectiveUserId, false)
      }
      queryClient.invalidateQueries({ queryKey: SHIFTS_QUERY_KEY(isSecondary) })
      toast.success('Interesse registrato')
      handleClose()
    } catch {
      toast.error('Errore')
    }
  }
```

- [ ] **Step 6: Aggiornare il JSX del dialog per mostrare il modal di compatibilità**

Trovare l'intera sezione JSX del `<div className="overflow-y-auto ...">` (riga 106 in poi) e sostituire il suo contenuto con:

```tsx
        <div className="overflow-y-auto max-h-[80vh] px-5 pb-5 pt-4 space-y-5">
          {compatibleMatches.length > 0 ? (
            <CompatibilityPanel
              matches={compatibleMatches}
              effectiveUserId={effectiveUserId}
              onInterest={handleInterest}
              onPublishAnyway={() => { setCompatibleMatches([]); doPublish() }}
            />
          ) : (
            <>
              {/* Date picker */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Data</p>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  locale={it}
                  disabled={(date) => {
                    const str = format(date, 'yyyy-MM-dd')
                    return str < todayRome() || occupiedDates.has(str)
                  }}
                  className="rounded-xl border w-full"
                />
              </div>

              {/* Offered shift */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Turno che offri</p>
                <div className="flex gap-2">
                  {SHIFT_TYPES.map(type => (
                    <ShiftTypeBtn
                      key={type}
                      type={type}
                      selected={offeredShift === type}
                      disabled={false}
                      onClick={() => {
                        setOfferedShift(type)
                        setRequestedShifts(prev => prev.filter(t => t !== type))
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Requested shifts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Turni che accetti</p>
                  <span className="text-[10px] text-muted-foreground">max 2</span>
                </div>
                <div className="flex gap-2">
                  {SHIFT_TYPES.map(type => (
                    <ShiftTypeBtn
                      key={type}
                      type={type}
                      selected={requestedShifts.includes(type)}
                      disabled={type === offeredShift}
                      onClick={() => toggleRequested(type)}
                    />
                  ))}
                </div>
              </div>

              {/* Summary */}
              {canSubmit && (
                <div className="rounded-xl bg-muted px-4 py-3 flex items-center gap-2 text-sm">
                  <span className="font-medium">{format(selectedDate!, 'd MMM', { locale: it })}</span>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className={cn('text-xs font-semibold', SHIFT_STYLES[offeredShift!].base.split(' ')[1])}>{offeredShift}</span>
                  <ArrowRight size={13} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {requestedShifts.join(' o ')}
                  </span>
                </div>
              )}

              <Button onClick={handleSubmit} disabled={isSubmitting || !canSubmit} className="w-full">
                {isSubmitting ? 'Pubblicazione...' : 'Pubblica'}
              </Button>
            </>
          )}
        </div>
```

- [ ] **Step 7: Aggiungere il componente `CompatibilityPanel` in fondo al file**

Aggiungere dopo la funzione `ShiftTypeBtn` esistente, alla fine del file:

```tsx
function CompatibilityPanel({
  matches,
  effectiveUserId,
  onInterest,
  onPublishAnyway,
}: {
  matches: Shift[]
  effectiveUserId: string
  onInterest: (shift: Shift) => void
  onPublishAnyway: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-green-600/40 bg-green-950/20 dark:bg-green-950/30 p-4 space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-green-400">
          ⚡ {matches.length === 1 ? 'Match compatibile trovato' : `${matches.length} match compatibili trovati`}
        </p>

        {matches.map(shift => {
          const interested = shift.shift_interested_users ?? []
          const alreadyCount = interested.length
          return (
            <div key={shift.id} className="rounded-lg bg-black/20 dark:bg-black/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold">{formatDisplayName(shift.user)}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-900/50 text-green-400">MATCH ✓</span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', SHIFT_PILL_CLASSES[shift.offered_shift])}>
                  {shift.offered_shift}
                </span>
                <ArrowRight size={11} className="text-muted-foreground flex-shrink-0" />
                {shift.requested_shifts.map((r, i) => (
                  <span key={r} className="flex items-center gap-1">
                    {i > 0 && <span className="text-muted-foreground text-[10px]">o</span>}
                    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', SHIFT_PILL_CLASSES[r as ShiftType])}>
                      {r}
                    </span>
                  </span>
                ))}
              </div>

              {alreadyCount === 0 ? (
                <p className="text-[11px] text-green-300">♡ Nessuno ancora — saresti il primo</p>
              ) : (
                <div className="rounded bg-black/20 px-2.5 py-2 space-y-1">
                  <p className="text-[11px] font-semibold text-amber-400">❤️ {alreadyCount} già {alreadyCount === 1 ? 'interessato' : 'interessati'}</p>
                  {interested
                    .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
                    .map((i, idx) => (
                      <div key={i.user_id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{idx + 1}° {i.user.cognome ?? i.user.nome}</span>
                        <span className="text-[10px]">{formatRelativeTime(i.created_at!)}</span>
                      </div>
                    ))}
                  <p className="text-[11px] font-semibold text-lime-400">→ Saresti il {alreadyCount + 1}°</p>
                </div>
              )}

              <Button
                size="sm"
                className="w-full h-8 text-[12px] bg-green-700 hover:bg-green-600 text-white"
                onClick={() => onInterest(shift)}
              >
                ❤️ Interessati a {shift.user.cognome ?? shift.user.nome}
              </Button>
            </div>
          )
        })}
      </div>

      <Button
        variant="outline"
        className="w-full text-[12px]"
        onClick={onPublishAnyway}
      >
        Pubblica comunque la mia richiesta
      </Button>
    </div>
  )
}
```

- [ ] **Step 8: Verificare TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Atteso: nessun errore.

- [ ] **Step 9: Verifica visiva nel browser**

Con il dev server attivo (`npm run dev`), aprire `http://localhost:3000`:

1. Creare un primo turno: es. Mattina → Pomeriggio il giorno X
2. Aprire di nuovo il dialog, selezionare **lo stesso giorno X**, offerta **Pomeriggio**, richiesta **Mattina**
3. Premere "Pubblica" — deve apparire il panel verde con il match trovato, nome dell'utente, pills, e bottone "Interessati a..."
4. Premere "Pubblica comunque" — il turno viene pubblicato normalmente
5. Ripetere il test con 2 turni compatibili nella stessa data per verificare il caso multi-match

- [ ] **Step 10: Commit**

```bash
git add components/shifts/shift-dialog.tsx
git commit -m "feat: shift-dialog checks compatibility before publishing and shows match panel"
```
