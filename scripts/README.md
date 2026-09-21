# Strumenti da riga di comando (`scripts/`)

Strumenti riusabili: manutenzione DB, verifica della rotazione teorica, generazione icone,
sessioni E2E, misure di performance. Gli script di **analisi one-off** NON vanno committati
qui: i loro output (JSON/TXT) erano artefatti di studio e sono stati ripuliti (settembre 2026).

**Env:** gli script che toccano il DB leggono `.env.local` (cercandolo verso l'alto, i
worktree non ne hanno una copia). Serve `NEXT_PUBLIC_SUPABASE_URL` (+ chiavi) e, per la
Management API, `SUPABASE_ACCESS_TOKEN`. Il ref dev è `uokfixddsuqcjddbfkln`, produzione
`zrbbzfingrdpdflkndgl` (vedi knowledge.md).

## Database: migration e rotazione

| Script | A cosa serve | Uso |
|---|---|---|
| `apply-release-migrations.mjs` | Applica le migration alla history a timestamp della **produzione** via Management API (su prod `supabase db push` NON si usa). Verifica cosa manca, applica un file per volta in transazione registrando la versione, si ferma al primo errore; `--bundle` scrive il SQL da incollare nell'SQL editor. | `node scripts/apply-release-migrations.mjs` (sola lettura) · `--prod` (verifica su prod) · `--prod --apply` · `--prod --from 034 --to 034 --apply` (range) · `--bundle release-v5.sql` |
| `allinea-rotazione-prod.mjs` | Porta su **produzione** l'allineamento della rotazione teorica riparato su dev (anchor 2026-03-01, cicli 84gg, pattern turno+sezione). | `node scripts/allinea-rotazione-prod.mjs` (dry-run) · `--apply` · `--only=NOME` (un solo membro) |
| `apply-super-cycle.mjs` | Applica alle `shift_types` il ciclo «sup» dedotto dai PDF (cycle_days, anchor comune 2026-03-01, pattern turno+sezione) — su **dev**. | `node scripts/apply-super-cycle.mjs` (anteprima, NON scrive) · `--apply` (con backup JSON) · `--apply --only=NOME` · `--dump` |
| `ripara-riposi-pattern.mjs` | Ripara le posizioni riposo/disponibilità dei pattern (il teorico dei PDF dice RC dove il seed aveva dedotto D). | `node scripts/ripara-riposi-pattern.mjs` (dry-run) · `--apply` (scrive su dev E prod) |
| `generate-seed.mjs` | Rigenera `supabase/migrations/020_seed_shift_teams.sql` dai PDF di luglio 2026 (pattern per voto di maggioranza). | `node scripts/generate-seed.mjs [dir-pdf]` |
| `verify-seed.mjs` | Verifica il seed 020: token generati dal pattern vs riga reale del PDF (livello famiglia + token completi). | `node scripts/verify-seed.mjs [dir-pdf]` |
| `verify-tuoturno.mjs` | Verifica «Il tuo turno»: teorico calcolato vs reale PDF vs riga base, per un cognome. | `node scripts/verify-tuoturno.mjs [frase-cognome]` (default: minino) |
| `verify-scorte-fix.mjs` | Backtest del fix scorte: riposi teorici vs reali dell'ultimo PDF + coerenza dei riposi dentro ogni mini-squadra. | `node scripts/verify-scorte-fix.mjs [YYYY-MM]` |
| `analizza-scorte-semplici.mjs` | Analisi storica delle «scorte semplici» (sottogruppi, ciclo 28gg, pattern per fase). | `node scripts/analizza-scorte-semplici.mjs [dir-pdf] [mode] [targets]` |

## Notifiche e sala (sonde)

| Script | A cosa serve | Uso |
|---|---|---|
| `check-notif-templates.mjs` | **Contratto del registry notifiche**: chiavi uniche, override applicati/ripristinati, variabili, legame registry↔route (nessun titolo hardcoded). Da rilanciare quando si tocca `lib/notification-templates.ts` o un route push. | `node scripts/check-notif-templates.mjs` |
| `check-motion.mjs` | **Contratto del moto** (M7): le molle nei blocchi di piattaforma devono essere ESATTAMENTE quelle calcolate da `lib/motion.ts` (una molla è ~400 caratteri di numeri: l'unico modo di sbagliarla è copiarla), le durate `--motion-duration-enter/exit` devono essere il tempo di assestamento della molla che governano, le famiglie `effects` non devono rimbalzare (un'alpha sopra il bersaglio si vede come sfarfallio) e l'easing osservato deve coincidere con `--motion-ease-standard`. Da rilanciare quando si tocca `lib/motion.ts` o i blocchi di moto in `globals.css`; con `--write` riscrive i valori generati nei due blocchi di piattaforma. | `node scripts/check-motion.mjs` · `--print` (mostra i valori) · `--write` (li scrive) |
| `check-design-tokens.mjs` | **Contratto del design system duale** (M1–M5): stesse chiavi token nei blocchi di piattaforma, chiavi DEVONO-DIFFERIRE, utility tipografiche collegate, contrasti AA misurati con la matematica di `lib/color.ts`, ratchet delle regex UA. Da rilanciare quando si toccano `globals.css` o `lib/platform.ts`. | `node scripts/check-design-tokens.mjs` |
| `sala-gialli-mese.mjs` | Sonda manuale d'emergenza: dice quanto è ricco di celle gialle il mese caricato (i test E2E dei gialli sono tarati su un mese ricco: se cambia il DATO, le loro guardie diventano rosse). | `node scripts/sala-gialli-mese.mjs [YYYY-MM]` |

## Test E2E, icone e misure

| Script | A cosa serve | Uso |
|---|---|---|
| `make-auth-state.mjs` | Genera `tests/.auth-state.json` (storageState Playwright) da `tests/.sb-session.json` (sessione copiata dal browser, git-ignored). Riscrive il cookie nel formato `@supabase/ssr`. | `node scripts/make-auth-state.mjs [percorso-sessione]` |
| `make-dev-icons.mjs` | Genera le icone PWA «Turni DEV» (banda gialla/nera «lavori in corso») dalle icone di produzione. **Rilanciare se cambia il logo.** | `node scripts/make-dev-icons.mjs` |
| `measure-nav-prod.mjs` | Misura click→contenuto e richieste/byte di rete su `next build && next start` con throttling Fast 3G (catena deterministica di navigazione). | `node scripts/measure-nav-prod.mjs [baseURL] [out.json]` |
| `measure-cache-first.mjs` | Misurazione A/B cache-first: click→contenuto del cambio mese su /turnisala (prima visita = rete, rivisita = cache IndexedDB). | `node scripts/measure-cache-first.mjs [variant] [baseURL] [out.json]` |

## Note

- `verify-tuoturno.mjs` e gli altri che leggono `.env.local` lo cercano **verso l'alto**:
  nel worktree funziona comunque (trova quello del progetto principale).
- `allinea-rotazione-prod.mjs`, `ripara-riposi-pattern.mjs` e `apply-super-cycle.mjs`
  SCRIVONO su dev e/o prod: leggere l'header dello script prima di usare `--apply`.
- Gli artefatti (JSON/TXT) degli script di misura vanno tenuti fuori da git.
