@AGENTS.md

## Navigazione codebase

Se esiste `graphify-out/GRAPH_REPORT.md`, leggilo **sempre** prima di
qualsiasi Glob, Grep o apertura di file. Questa regola vale anche per
i subagent Explore lanciati da Superpowers — consultare il grafo è
il primo tool call obbligatorio di qualsiasi sessione di esplorazione.

---

# Turni Sala C.C.C. — PWA

## Gotcha critici

### PostgREST — FK esplicito obbligatorio
Le query embedded in `lib/queries/shifts.ts` usano FK esplicito:
`user:users!shifts_user_id_fkey(id, nome, cognome, is_secondary)`
Senza `!fk_name` le query falliscono silenziosamente.

### Realtime — canali con nome univoco
`hooks/use-shifts.ts` usa `shifts-realtime-{isSecondary}-{random}` per
evitare il bug "cannot add callbacks after subscribe()" di Supabase.

### ThemeColor — MutationObserver su `<head>`
Next.js App Router riscrive la `<head>` ad ogni navigazione.
`components/providers/theme-color.tsx` usa un MutationObserver per
mantenere il meta `theme-color` corretto. Non rimuovere questo workaround.

### Push — forma callback su Android Chrome
`requestPermission` usa la forma callback (non Promise) per compatibilità
Android Chrome. Non convertire in async/await.

### Admin
- `ADMIN_ID = 'fdd6c008-7a22-42d5-a75b-c44d9edfef12'` in `types/database.ts`
- Il FAB (lucchetto) in BottomNav appare SOLO su `/impostazioni` da admin

### Categorie utenti
- `is_secondary = false` → DCO
- `is_secondary = true` → Noni
I turni sono filtrati per categoria: ogni utente vede solo la sua.

## Non implementato
- `/vacanze` è placeholder, non toccare
- Nessun optimistic update — ogni mutazione aspetta il refetch (intenzionale)

## Deploy
Vercel auto-deploy da branch `master`. Non modificare `vercel.json` senza motivo.