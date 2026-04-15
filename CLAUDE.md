@AGENTS.md

## Navigazione codebase

Se esiste `graphify-out/GRAPH_REPORT.md`, leggilo **sempre** prima di
qualsiasi Glob, Grep o apertura di file. Usa il grafo per identificare
i nodi coinvolti, poi apri solo quei file specifici.
Per ricerche ampie su più moduli, usa un subagent isolato e ricevi
solo il report — non aprire file nel thread principale.
Questa regola vale anche per i subagent — consultare il grafo è
il primo tool call obbligatorio di qualsiasi esplorazione.

## Workflow obbligatorio

### 1. ESPLORA (subagent isolato)
Prima di qualsiasi codice, lancia un subagent read-only che:
- Legge `graphify-out/GRAPH_REPORT.md`
- Identifica i file coinvolti dal grafo
- Riporta al thread principale solo i file rilevanti e le dipendenze a rischio

Non aprire file nel thread principale durante questa fase.

### 2. DOMANDE (proporzionali alla complessità)
Valuta la difficoltà del task su scala 1-3:

- **Difficoltà 1** (bug UI, testo, stile): 0 domande — vai direttamente al piano
- **Difficoltà 2** (nuova logica, hook, query): 1-2 domande mirate, poi piano
- **Difficoltà 3** (architettura, auth, realtime, push): brainstorming con
  opzioni e tradeoff prima del piano

Non fare mai più di 3 domande totali. Se hai dubbi, scegli tu e documenta
la decisione nel piano.

### 3. PIANO
Scrivi il piano in `docs/superpowers/plans/YYYY-MM-DD-nome-feature.md`.
Formato:
Obiettivo
File coinvolti
Passi di implementazione (checklist)
Test necessari (solo logica critica)
Rischi
Mostrami il piano e aspetta la mia approvazione prima di procedere.
Un piano approvato non si cambia in corsa — se emerge qualcosa di nuovo,
fermati e aggiorna il piano.

### 4. IMPLEMENTA
- Lavora un passo alla volta seguendo la checklist
- Spunta ogni step completato nel file del piano
- Scrivi test solo per: logica di business critica, query Supabase complesse,
  funzioni pure con edge cases. Non testare UI, routing, o wrapper banali.
- Se un passo richiede più di ~30 min di lavoro, fermati e proponi
  di spezzarlo

### 5. COMMIT E AVANTI
Dopo ogni feature o bug fix completato:
```bashgit add -A
git commit -m "tipo: descrizione concisa"```
Usa Conventional Commits: `feat:`, `fix:`, `refactor:`, `style:`, `chore:`.
Non chiedere conferma per il commit — vai avanti automaticamente.
Dopo il commit:
1. Leggi lo short hash dell'ultimo commit con `git rev-parse --short HEAD`
2. Aggiorna la versione mostrata nella pagina `/impostazioni` con quel valore
   (cerca la stringa di versione nel componente della pagina impostazioni e sostituiscila)
3. Aggiorna la checklist nel file del piano e passa al prossimo step.
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

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
