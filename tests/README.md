# Test E2E (Playwright)

Smoke test del Confronto di `/tuoturno`: nessun testo di card troncato e nessuna
barra di scorrimento orizzontale, a 320px e 390px.

```bash
npx playwright test
```

## Prerequisiti

- **Dev server su porta 3000** per il test «app reale» (`.freebuff/run.md`):
  `npm run dev` in questo worktree. I due test sui MOCKUP invece sono file
  statici (`file://`): girano anche senza server.
- **Browser**: `npx playwright install chromium` (una volta per macchina).

## Cosa copre

| Test | Bersaglio | Copre |
|---|---|---|
| mockup 320px (peggior caso) | `mockups/confronta-320px.html` | sezioni larghe (TUTOR, DCIF, F.E., Trasf), cap colonne, zero overflow |
| mockup dashed + due righe | `mockups/confronta-dashed-e-due-righe.html` | card split/strike (bordo 0 + tratteggio sulle metà), card sm due righe |
| app reale | `http://localhost:3000/tuoturno` | tabella Confronto dal vivo: apertura FAB → dialog → selezione 2 persone, zero clipping, zero scroll |

## Autenticazione del test «app reale»

Il test carica `/tuoturno?dev=rootkind-dev-2026`: il parametro è la backdoor
ufficiale del PwaGuard (un browser non-PWA verrebbe altrimenti rimandato a
`/installa`). Il bypass viene salvato in localStorage dal guard stesso; oltre a
quello serve una **sessione Supabase**, in uno di due modi:

1. **Credenziali E2E (raccomandato in CI)**: crea `.env.e2e` (git-ignored) con
   `E2E_EMAIL=...` / `E2E_PASSWORD=...` e lancia
   `npx playwright test --project=auth --project=chromium`: il progetto «auth»
   fa il login dal form reale e salva `tests/.auth-state.json`.
2. **Export della sessione da un browser già autenticato**: apri l'app, copia
   il cookie `sb-<ref>-auth-token` (valore `base64-<base64url(JSON)>`), decodificalo
   in `tests/.sb-session.json` (oggetto sessione di supabase-js), poi:
   `node scripts/make-auth-state.mjs` (legge il ref da `.env.local` e riscrive
   il cookie nel formato esatto di `@supabase/ssr`, bypass PWA incluso).

`tests/.auth-state.json` è LOCALE e git-ignored (contiene token validi). Senza
sessione il test «app reale» si AUTOSALTA (skip, non fallimento); i mockup sono
la rete di regressione affidabile perché replicano lo stesso markup/classi.

## Limitazioni note

- La sessione esportata SCENDE (exp di ~1h, standard Supabase): se il test
  «app reale» salta improvvisamente, rigenera `tests/.auth-state.json`.
- Il mockup «320px» scarica le colonne oltre il cap con la STESSA formula
  dell'app (`compareChunks.maxByWidth`): se cambi la formula in
  `tuoturno-client.tsx`, aggiorna anche lo script nel mockup.
