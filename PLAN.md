# PLAN — Fantabasket Manager

Documento vivo: spunta `[x]`, aggiungi note, riordina. Le AI devono aggiornarlo a fine lavoro.
Regole di lega: [docs/REGOLAMENTO.md](docs/REGOLAMENTO.md) · Dati: [docs/DATA-MODEL.md](docs/DATA-MODEL.md) · Dubbi: [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) · Stack: [docs/STACK.md](docs/STACK.md)

## Obiettivo
Sostituire il foglio Excel con un sito dove **admin** (Scuti e Gabby) gestiscono tutto e gli **8 proprietari** consultano in sola lettura rose, contratti, spazio salariale, pick e tagli.

## Fase 0 — Fondamenta (fatta)
- [x] Analisi del foglio Excel
- [x] Sintesi regolamento con ID regola
- [x] CLAUDE.md, PLAN.md, STACK, DATA-MODEL, OPEN-QUESTIONS
- [x] Regolamento confermato valido (28/09/2024) e mappa proprietari↔squadre
- [x] Repo GitHub pubblico

## Fase 1 — Progetto e dati
- [x] Creare progetto Next.js 16 + TS + Tailwind 4, lint, vitest
- [x] Schema SQL + RLS in `supabase/migrations/0001_init.sql` e `seed.sql` (eseguiti su Supabase)
- [x] Progetto Supabase creato, migrazioni 0001-0002 e seed applicati
- [ ] Testare le policy RLS con un utente viewer
- [x] `src/lib/cap.ts` + test: riproduce monte ingaggi, spazio salariale e spazio riserve di tutte e 8 le squadre del foglio, prima e dopo l'asta (40 test verdi in tutto)
- [x] `scripts/import-xlsx.ts`: report di verifica (8/8 squadre quadrano col foglio) e `--apply` su Supabase (provato); guida a nomi e fonti: [docs/IMPORT.md](docs/IMPORT.md)
- [x] Pick incerte importabili come `to_confirm` (migrazione 0002); report a 0 problemi
- [x] Migrazione 0002 applicata, `.env.local` creato, import `--apply` eseguito (2026-10-21): 123 contratti, 5 tagliati, 39 talenti, 120 pick, 40 rookie draft, 568 giocatori
- [x] Migrazioni 0003 (`unique (season_id, player_id)` su `contracts`) e 0004 (`years_left` nullable) applicate su Supabase il 2026-10-21 via MCP. L'import segnala come problema un giocatore in più contratti
- [x] Migrazione 0005 (`contracts.is_rookie`, `r` = rookie) applicata e dati del foglio post-asta importati su Supabase il 2026-10-21 (eseguito dall'utente nell'editor SQL, perché lo strumento MCP rifiuta i `delete`): 149 contratti, 7 tagliati, 51 talenti, 120 pick 2027-2029, 40 rookie draft, 532 giocatori; monte ingaggi delle 8 squadre uguale al foglio. Backup dei dati pre-asta nello schema `import_backup` (da eliminare con `drop schema import_backup cascade;` quando non serve più)
- [ ] Durata dei 17 ingaggi d'asta senza prefisso (es. Durant, Siakam): la lega non l'ha ancora decisa, import con `years_left = null` (si vede `?`); da impostare dall'admin (fase 3) o con un nuovo import
- [ ] UI admin: correggere le pick da confermare (fase 3)
- [ ] Export Dunkest completo per i giocatori in rosa (nome intero, squadra NBA, ruolo)
- [x] Seed squadre e stagione 2026 (`seed.sql`)
- [x] Seed giocatori Dunkest e contratti dal foglio (125 giocatori in rosa sono provvisori: solo cognome)

## Fase 2 — Sola lettura (utenti normali)
- [x] Login email+password e link via email (`/login`, `proxy.ts` protegge tutte le pagine). Richiede `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`; per il link: aggiungere `http://localhost:3000/auth/callback` (e poi l'URL Vercel) in Supabase → Authentication → URL Configuration
- [x] **Home lega**: 8 squadre con monte ingaggi, spazio, bonus, stato (sforato / sotto floor)
- [x] **Pagina squadra**: titolari, riserve, talenti, tagliati, pick possedute e cedute
- [x] **Draft**: pick scambiate 2026-2028 (con "da confermare") e ordine rookie draft 2026
- [x] **Giocatori**: listone Dunkest filtrabile (nome, ruolo, squadra NBA, libero/occupato, ordine) in `/giocatori`
- [x] Layout mobile-first, tema chiaro/scuro automatico; grafica ispirata a NBA.com (barra scura, rosso/blu, titoli condensed)
- [x] Strumenti per gli utenti (issue #13): griglia pick in `/draft`, contratti in scadenza in `/scadenze`, simulatore di scambio in sola lettura in `/scambio` (`tradeImpact` in `lib/cap.ts`, R-57), ordinamento/filtri sulla home, PWA installabile (`manifest.ts`, icone da `scripts/make-icons.mjs`; niente service worker, l'app è sempre online)
- [x] Logo della lega in header, login, favicon e icone PWA (`scripts/make-icons.mjs` lo ricava da `scripts/assets/logo-source.jpg`)
- [x] Pulizia (issue #11): tolti gli svg del template, `CLAUDE.md` e `docs/STACK.md` riallineati, commento residuo in `next.config.ts`
- [ ] **Verifica con login reale** (le pagine con dati non sono ancora state viste in un browser: manca la chiave anon)

## Deploy
- [x] Vercel: sito online (dominio di produzione verificato: apre `/login`). Guida in [docs/DEPLOY.md](docs/DEPLOY.md). Nota: l'URL del singolo deploy (`...-michelecoppis-projects.vercel.app`) è protetto da Vercel SSO, va condiviso solo il dominio di produzione `fantabasket-manager.vercel.app`
- [ ] Creare gli altri 6 utenti (viewer)

## Fase 3 — Pannello admin
- [x] Ruolo admin + guardia su rotte e RLS (issue #6): `/admin` dà 404 ai viewer, ogni server action ricontrolla il ruolo, le RPC controllano `is_admin()`
- [x] Scritture atomiche (issue #6): migrazione `0006_admin_rpc.sql` con RPC `admin_sign_contract`, `admin_update_contract`, `admin_cut_player`, `admin_execute_trade` (transazione + `audit_log` + versioni per la concorrenza). Regole in TS (`lib/cap.ts`: `evaluateTrade`, `evaluateSigning`, `cutShare`), server action in `src/app/(lega)/admin/actions.ts`. **Da applicare su Supabase prima del deploy** (aggiunge anche le chiavi `contract_max_years`, `max_picks_per_round`: senza, le pagine non si caricano)
- [x] UI admin: `/admin` (panoramica + ultime operazioni), `/admin/scambio` (con eccezione cap motivata), `/admin/firma`, `/admin/rose` (modifica durata/slot, taglio)
- [ ] CRUD contratti: restano la rimozione e le validazioni complete (firma e modifica fatte, vedi sopra); validazioni 13+3..6, 5G/5A/3C, max 3 riserve per ruolo
- [ ] Taglio giocatore → asta tagliati → taglio definitivo (1/3 stipendio) o rientro (il primo passo, taglio in stato `pending`, è fatto in `/admin/rose`; mancano asta, taglio definitivo e rientro)
- [ ] Squadra talenti e rookie: firma al valore d'ingresso max 2 stagioni, scadenza prelazione
- [ ] Scambi: giocatori + pick, **controllo cap** (R-57) con override moderatore motivato
- [ ] Gestione pick (max 2 per giro, solo 3 anni avanti)
- [ ] Tracciare quota iscrizione pagata e luxury tax pagata per squadra
- [ ] Chiusura stagione: inserimento classifica finale → bonus (R-60), lottery draft (R-32), luxury tax (R-12), nuova stagione con scadenze contratti e stato restricted/unrestricted (R-23/R-24)
- [~] `audit_log` visibile agli admin: ultime operazioni in `/admin`; storico completo da fare

## Fase 4 — Rifiniture
- [ ] Storico stagioni e scambi
- [ ] Export CSV/Excel
- [x] Keep-alive Supabase (`.github/workflows/keepalive.yml`, serve aggiungere i secret su GitHub)
- [ ] Backup periodico del database
- [ ] Notifiche (opzionale)

## Fuori scope per ora
Punteggi/formazioni settimanali (restano su Dunkest), staff fantasia, asta live in tempo reale (valutare in futuro).

## Prossimo passo
Login provato in locale; verificare le pagine anche su Vercel. Gli altri 6 utenti si creano dopo. Aperte solo: soglia di sicurezza, importo quota, `26?` e `(24)` nei talenti (vedi OPEN-QUESTIONS).

## Registro decisioni
- 2026-10-22: issue #6 decisa: una RPC Postgres per operazione (security definer + `is_admin()`), regole di lega solo in `lib/cap.ts`, concorrenza ottimistica con colonna `version`, audit scritto dalle RPC (l'issue #5 potrà passare ai trigger).
- 2026-10-21: stack Next.js + Supabase + Vercel (tutto free tier).
- 2026-10-21: admin dell'app = Scuti e Gabby; Serde (presidente) e Amedeo (moderatore) restano ruoli del regolamento.
- 2026-10-21: `r` = rookie, `u` = unrestricted nei nomi contratto (corretto dall'utente: prima era `r` = restricted; colonna `contracts.is_rookie`, migrazione 0005); la classifica finale si registra nell'app.
- 2026-10-21: `Dunkest.xlsx` e il .docx restano fuori da git finché non si decide di pubblicarli (nomi/dati privati della lega).
- 2026-10-21: il monte ingaggi include le quote dei tagliati (verificato sul foglio); la soglia della luxury tax è assunta = cap effettivo.
- 2026-10-21: Next 16 con `cacheComponents`: i dati per-utente stanno dentro `<Suspense>` (layout del gruppo `(lega)`); `middleware` si chiama `proxy.ts`.
- 2026-10-21: grafica ispirata a NBA.com (token colore in `globals.css`, font Barlow Condensed per i titoli); `instantInsights.validationLevel: "manual-warning"` in `next.config.ts` per non far bloccare il dev overlay dalle letture di sessione.
