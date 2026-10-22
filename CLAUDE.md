# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Gestionale web per una lega privata di fantabasket NBA (8 squadre). Lingua di UI, commenti utente e documenti: **italiano**. Codice e nomi di variabili/tabelle: **inglese**.

## Stato del progetto
Fasi 0-2 completate (dati importati, sito online in sola lettura). Fase 3 (pannello admin) quasi chiusa; restano squadra talenti/rookie e chiusura stagione. Leggi prima [PLAN.md](PLAN.md) per sapere cosa è fatto e cosa è il prossimo passo, e aggiornalo a fine lavoro (spunta le caselle, aggiungi note e voci al registro decisioni).

## Regole di lega
Sintesi con ID (R-xx) in [docs/REGOLAMENTO.md](docs/REGOLAMENTO.md); cita gli ID nei commenti/test. Il regolamento è datato 28/09/2024 ed è stato confermato ancora valido (2026-10-21). Dubbi aperti in [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md).

## Regola d'oro: non inventare regole
Tutti i valori del regolamento (cap 250, floor, budget riserve 80, tasso luxury tax, premi...) vanno in **`league_settings`/configurazione**, mai hardcodati. Se una regola è dedotta dal foglio Excel e non dal regolamento, marcala come `ASSUNZIONE` in OPEN-QUESTIONS.md. In caso di ambiguità chiedi all'utente invece di scegliere.

## Comandi
- `npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` (fa `next typegen && tsc --noEmit`) · `npm test` (vitest, nessun config: prende ogni `*.test.ts`, in `src/lib/` e `scripts/lib/`).
- Un solo file: `npx vitest run src/lib/cap.test.ts`; un solo test: `npx vitest run -t "parte del nome"`.
- La CI (`.github/workflows/ci.yml`) esegue lint, typecheck, test e build su ogni PR e su `main`, più il job `rls` che applica migrazioni e seed su un Postgres Supabase e lancia `supabase/tests/rls.sql`. Prima di dire "fatto" esegui test, typecheck e lint. Una nuova tabella o RPC `admin_*` deve passare il test RLS (la tabella ha bisogno di una riga di prova in `rls.sql`).
- Import dal foglio: `npx tsx scripts/import-xlsx.ts` fa solo il report; `npx tsx --env-file=.env.local scripts/import-xlsx.ts --apply` **cancella e riscrive** i dati importati su Supabase (serve `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, si ferma se il report ha problemi salvo `--force`). Non lanciarlo senza conferma dell'utente. Dettagli in [docs/IMPORT.md](docs/IMPORT.md).
- SQL sul database reale: `SUPABASE_DB_URL` in `.env.local` (Supabase → Connect → Session pooler; mai su Vercel). Senza psql installato, via Docker: `export SUPABASE_DB_URL="$(grep '^SUPABASE_DB_URL=' .env.local | cut -d= -f2- | tr -d '\r')"; docker run --rm -i -e SUPABASE_DB_URL postgres:17-alpine sh -c 'psql "$SUPABASE_DB_URL" -X' < query.sql`. Scrivere sul DB reale solo dopo conferma dell'utente.
- Env: `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (vedi `.env.example`); la `service_role` serve solo agli script locali, mai su Vercel.
- Next.js è una versione recente con breaking changes: leggi `node_modules/next/dist/docs/` e [AGENTS.md](AGENTS.md) prima di scrivere codice Next.

## Architettura
**Stack** (docs/STACK.md): Next.js App Router + TypeScript + Tailwind 4, Supabase (Postgres + Auth + RLS), Vercel. Tutto su piani gratuiti, ~8 utenti.

**Lettura dati.** `loadLeague()` in `src/lib/league-server.ts` (memoizzata con `cache`) legge le righe come l'utente loggato (RLS) e le passa a `buildLeague()` in `src/lib/league.ts` (pura, testata) che produce `LeagueView`: rose, finanze per squadra, pick. Le chiavi di `league_settings` sono tutte obbligatorie (`settingsFromRows` lancia se ne manca una): un nuovo parametro di regolamento = riga in `league_settings` via migrazione + campo in `LeagueSettings` + `settingsFromRows` + `DEFAULT_SETTINGS`.

**Regole in un solo posto.** `src/lib/cap.ts` contiene tutta la logica di lega, pura e con test: `teamFinance`, `tradeImpact`, `evaluateTrade`, `evaluateSigning`, `contractTermsErrors`, `cutShare`. La usano sia il simulatore di scambio in sola lettura (`/scambio`) sia le server action admin. Non duplicare regole nel SQL né nei componenti.

**Percorso di scrittura (admin).** Componente client `admin/*/desk.tsx` → server action in `src/app/(lega)/admin/actions.ts` (`requireAdmin()`, validazione con `cap.ts`, poi `db.rpc(...)`) → funzione Postgres in `supabase/migrations/20261021220000_admin_rpc.sql` (`security definer`, `admin_guard()`/`is_admin()`, una transazione, scrive `audit_log`). Le RPC garantiscono solo coerenza dei dati (esistenza, proprietà, concorrenza), non le regole di lega. Concorrenza ottimistica: `contracts`, `cuts`, `draft_picks` hanno `version` (trigger `bump_version`); la UI la legge con `loadVersions()` e la rimanda, la RPC fallisce con `CONFLICT:` se è cambiata. Gli errori RPC hanno prefisso `FORBIDDEN|CONFLICT|INVALID` e `rpcError()` li traduce. Ogni nuova operazione admin segue questo schema e chiama `revalidatePath("/", "layout")`.

**Auth.** `src/proxy.ts` (in Next 16 `middleware` si chiama `proxy`) rinnova la sessione Supabase e manda a `/login` chi non è autenticato; `src/lib/supabase/server.ts` crea il client con la chiave anon e i cookie. `admin/layout.tsx` risponde 404 ai viewer, ma i permessi veri sono RLS + RPC.

**Next 16 `cacheComponents`.** I dati per-utente devono stare dentro `<Suspense>` (lo fa `src/app/(lega)/layout.tsx`, con `export const instant = false`). Le pagine già viste restano 5 minuti nella cache del router (`staleTimes` in `next.config.ts`): per questo c'è il pulsante "Aggiorna" e le action fanno `revalidatePath`. I tipi `LayoutProps<"/route">` / `PageProps` sono globali, generati da `next typegen`.

**Database.** Migrazioni in `supabase/migrations/` con nome `<timestamp>_nome.sql` (formato Supabase; il nome deve coincidere con la versione in `list_migrations`, altrimenti il check "Supabase Preview" fallisce) (+ `seed.sql`), senza `config.toml`: si applicano a mano su Supabase (MCP o editor SQL) e l'applicazione si annota in PLAN.md. Una migrazione nuova non è "fatta" finché non è applicata sul progetto reale.

**Trabocchetti sui dati.**
- PostgREST taglia a 1000 righe per richiesta, anche con `.limit()`: paginare come `fetchAllPlayers`.
- `contracts.years_left` null = durata da fissare (mostrata `?`); `0.5` = mezza stagione. `players.pos` può essere null e molti giocatori in rosa sono provvisori (solo cognome, `first_name` vuoto).
- `contracts` ha `unique (season_id, player_id)`; un giocatore tagliato sta in `cuts`. Sigle del foglio: `r` = rookie (`is_rookie`), `u` = unrestricted (`restriction`).
- Il monte ingaggi include le quote dei tagliati.

## Ruoli e permessi
- `admin`: scrive su tutto (Scuti e Gabby). `viewer`: sola lettura.
- I permessi vanno applicati **nel database con Row Level Security**, non solo nascondendo bottoni nella UI. Ogni tabella: SELECT per utenti autenticati, INSERT/UPDATE/DELETE solo se `is_admin()`.
- Ogni modifica admin a contratti/pick/budget scrive una riga in `audit_log` (oggi lo fanno le RPC).

## Fonte dati
`Dunkest.xlsx` (solo in locale, ignorato da git) ha 3 fogli: `Foglio1` rose/contratti/pick, `Foglio2` ordine rookie draft, `Foglio3` listone giocatori Dunkest con crediti 26/27. Struttura e significato in [docs/DATA-MODEL.md](docs/DATA-MODEL.md). L'import è lo script ripetibile `scripts/import-xlsx.ts` (parsing in `scripts/lib/parse.ts`, alias squadra e normalizzazione nomi in `scripts/lib/names.ts`, correzioni alle pick in `scripts/lib/overrides.ts`), non a mano.
Attenzione: il file ha encoding sporco (`1°` appare come `1�`, `Traoré` come `Traor�`) e celle con `\xa0`; l'import normalizza.

## Convenzioni
- TypeScript strict, niente `any` senza motivo.
- Valori numerici dei crediti: `numeric(5,1)` nel DB (ci sono mezzi crediti, es. 3.5).
- Stagione corrente come entità (`seasons`, `is_current`), mai come costante.
- UI mobile-first: gli utenti la useranno da telefono.
- Commit piccoli, messaggi in italiano o inglese ma coerenti. Non committare `.env*` né chiavi Supabase `service_role`.

## Flusso di lavoro (persone e agenti, tutti uguali)
- Lavori non banali: un branch, `tipo/nome-breve` (`feat`, `fix`, `chore`, `docs`, `perf`, `test`), poi PR su GitHub; si mergia solo con la CI verde.
- Piccole modifiche (doc, PLAN.md, typo, ritocchi minimi) si possono committare e pushare direttamente su `main`. Il push su `main` fa partire CI e deploy: prima test, typecheck e lint.
- Crea i branch senza upstream: `git switch -c tipo/nome --no-track origin/main`. Con l'upstream su `main` un `git push` finirebbe su `main` anche quando non vuoi. Upstream solo sul branch omonimo (`git push -u origin tipo/nome`).
- Commit, push e PR solo su richiesta esplicita dell'utente, anche per `main`: la regola sopra dice dove si può andare, non autorizza da sola.
- Messaggi di commit: `tipo(scope): oggetto`, in italiano, brevi, senza firme o trailer di assistenti.
- Prima di dire "fatto": `npm test`, `npm run typecheck`, `npm run lint` (e il test RLS se tocchi tabelle o RPC). A fine lavoro aggiorna [PLAN.md](PLAN.md).
- Dopo il merge: cancella il branch locale e il worktree. Un worktree vive in `.claude/worktrees/` (ignorato da git).
- Non committare file locali degli agenti (worktree, impostazioni, skill installate in locale).
- Regola di lega dubbia o non scritta nel regolamento: chiedi, non scegliere.

## Cosa NON fare
- Non aggiungere servizi a pagamento o che richiedano carta di credito.
- Non scrivere regole di lega nel codice senza averle messe in OPEN-QUESTIONS/PLAN.
- Non dare permessi di scrittura ai viewer "per comodità".
- Non pushare/pubblicare senza che l'utente abbia confermato.
