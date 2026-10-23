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
Migrazioni in `supabase/migrations/`; in questo file e nei commenti del codice si usa la numerazione breve: 0001 `20261021214000_init`, 0002 `…214010_picks_to_confirm`, 0003 `…214052_contracts_unique_player`, 0004 `…214053_contracts_years_nullable`, 0005 `…214255_contracts_is_rookie`, 0006 `…220000_admin_rpc`, 0007 `…222924_admin_completamento`, 0008 `20261023130000_chiusura_stagione`.

- [x] Creare progetto Next.js 16 + TS + Tailwind 4, lint, vitest
- [x] Schema SQL + RLS in `supabase/migrations/20261021214000_init.sql` e `seed.sql` (eseguiti su Supabase)
- [x] Progetto Supabase creato, migrazioni 0001-0002 e seed applicati
- [x] Testare le policy RLS con un utente viewer (issue #3). Verifica manuale del 2026-10-22 (via psql in transazione `read only` con rollback, ruoli simulati con `set local role` e `request.jwt.claims`): `anon` non legge nulla, non scrive e non esegue nessuna RPC; un viewer (profilo finto creato nella transazione) legge tutto tranne `audit_log`, non riesce a INSERT/UPDATE/DELETE su nessuna tabella provata, non può cambiare `profiles.role` né `team_id` e riceve `FORBIDDEN` dalle RPC admin; un admin legge e scrive, ma nemmeno lui può modificare o cancellare `audit_log`. Ora automatica: `supabase/tests/rls.sql` prova anon, viewer e admin su tutte le tabelle e tutte le RPC `admin_*` (lette dal catalogo, quindi una tabella senza RLS o una RPC senza guardia fa fallire il test) e gira in CI nel job `rls` su `supabase/postgres:17.11.0.006`. Verificato che fallisce allentando una policy (19 varianti provate: audit_log leggibile, scrittura ai viewer, auto-promozione, anon in lettura, UPDATE/DELETE su audit_log, RPC senza guardia...). In locale: vedi l'intestazione del file. Hardening possibile: `anon` e `authenticated` hanno anche `TRUNCATE`, `REFERENCES` e `TRIGGER` su tutte le tabelle `public` (default di Supabase); la RLS non copre `TRUNCATE`, e PostgREST non lo espone, ma si può revocare con una migrazione (proposta nella PR #26, non applicata)
- [x] `src/lib/cap.ts` + test: riproduce monte ingaggi, spazio salariale e spazio riserve di tutte e 8 le squadre del foglio, prima e dopo l'asta (40 test verdi in tutto)
- [x] `scripts/import-xlsx.ts`: report di verifica (8/8 squadre quadrano col foglio) e `--apply` su Supabase (provato); guida a nomi e fonti: [docs/IMPORT.md](docs/IMPORT.md)
- [x] Pick incerte importabili come `to_confirm` (migrazione 0002); report a 0 problemi
- [x] Migrazione 0002 applicata, `.env.local` creato, import `--apply` eseguito (2026-10-21): 123 contratti, 5 tagliati, 39 talenti, 120 pick, 40 rookie draft, 568 giocatori
- [x] Migrazioni 0003 (`unique (season_id, player_id)` su `contracts`) e 0004 (`years_left` nullable) applicate su Supabase il 2026-10-21 via MCP. L'import segnala come problema un giocatore in più contratti
- [x] Migrazione 0005 (`contracts.is_rookie`, `r` = rookie) applicata e dati del foglio post-asta importati su Supabase il 2026-10-21 (eseguito dall'utente nell'editor SQL, perché lo strumento MCP rifiuta i `delete`): 149 contratti, 7 tagliati, 51 talenti, 120 pick 2027-2029, 40 rookie draft, 532 giocatori; monte ingaggi delle 8 squadre uguale al foglio. Il backup dei dati pre-asta (schema `import_backup`) risulta già eliminato (verificato il 2026-10-22 via psql)
- [ ] Durata dei 17 ingaggi d'asta senza prefisso (es. Durant, Siakam): la lega non l'ha ancora decisa, import con `years_left = null` (si vede `?`); da impostare dall'admin (strumento pronto: durate in blocco in `/admin/rose`) o con un nuovo import
- [x] UI admin: correggere le pick da confermare (`/admin/pick`, casella «da confermare»)
- [x] Nomi interi e squadra NBA per i giocatori in rosa: snapshot Dunkest (`scripts/fetch-dunkest-players.ts`) + `PLAYER_ALIASES` in `scripts/lib/overrides.ts`; sul foglio del 21/10 resta provvisorio solo `A.Walker`. Il report elenca i 146 collegamenti per cognome da controllare
- [x] Nomi applicati al database reale (2026-10-23, `import --apply` con `Dunkest-aggiornato.xlsx`, `audit_log` vuoto prima): giocatori 532 → 527, provvisori 162 → 1 (`A.Walker`), monte ingaggi delle 8 squadre uguale a prima, nessun giocatore con due contratti. Serviva `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` e `NEXT_PUBLIC_SUPABASE_URL` nella forma `https://<ref>.supabase.co` (non il link della dashboard)
- [ ] Capire se Dunkest permette di caricare le rose (la guida dice che il commissioner le inserisce a mano, uno per uno) e, se no, preparare la scheda per squadra da copiare
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
- [ ] **Verificare le pagine con dati su Vercel** (il login è provato in locale)

## Deploy
- [x] Vercel: sito online (dominio di produzione verificato: apre `/login`). Guida in [docs/DEPLOY.md](docs/DEPLOY.md). Nota: l'URL del singolo deploy (`...-michelecoppis-projects.vercel.app`) è protetto da Vercel SSO, va condiviso solo il dominio di produzione `fantabasket-manager.vercel.app`
- [ ] Creare gli altri 6 utenti (viewer)

## Fase 3 — Pannello admin
- [x] Ruolo admin + guardia su rotte e RLS (issue #6): `/admin` dà 404 ai viewer, ogni server action ricontrolla il ruolo, le RPC controllano `is_admin()`
- [x] Scritture atomiche (issue #6): migrazione `20261021220000_admin_rpc.sql` con RPC `admin_sign_contract`, `admin_update_contract`, `admin_cut_player`, `admin_execute_trade` (transazione + `audit_log` + versioni per la concorrenza). Regole in TS (`lib/cap.ts`: `evaluateTrade`, `evaluateSigning`, `cutShare`), server action in `src/app/(lega)/admin/actions.ts`. **Applicata su Supabase** (verificato il 2026-10-22: colonne `version`, 7 funzioni, permessi RPC solo per `authenticated`); aggiunge anche le chiavi `contract_max_years`, `max_picks_per_round` (senza, le pagine non si caricano)
- [x] UI admin: `/admin` (panoramica + ultime operazioni), `/admin/scambio` (con eccezione cap motivata), `/admin/firma`, `/admin/rose` (modifica durata/slot, taglio)
- [x] CRUD contratti (migrazione `20261021222924_admin_completamento.sql`, applicata su Supabase il 2026-10-22): rimozione senza quota (`admin_remove_contract`, ✕ in `/admin/rose`), durate in blocco (`admin_set_durations`), massimi di rosa bloccanti in firma/modifica/rientro (`rosterLimitErrors`: 13 titolari, 5G/5A/3C, 6 riserve, max 3 per ruolo; i minimi restano avvisi)
- [x] Taglio → asta tagliati → definitivo o rientro: `pending` → `cut` (`admin_finalize_cut`), `reinstated` (`admin_reinstate_cut`) o `awarded` (firmandolo in `/admin/firma` per un'altra squadra parte `admin_award_cut`, l'ex proprietario non può, R-41). Sezione «Tagliati» di `/admin/rose`. La migrazione marca come `cut` i tagli già presenti (vengono dal foglio)
- [ ] Squadra talenti e rookie: firma al valore d'ingresso max 2 stagioni, scadenza prelazione (non fatto: attende la risposta alla domanda 4 di OPEN-QUESTIONS)
- [x] Scambi: giocatori + pick, **controllo cap** (R-57) con override moderatore motivato
- [x] Gestione pick: `/admin/pick` (proprietario, «da confermare», apertura di un nuovo draft entro 3 anni; max 2 per giro come avviso). Parametri `pick_horizon_years` e `draft_rounds` in `league_settings`
- [x] Quota iscrizione e luxury tax pagate per squadra: `/admin/quote` (importo della quota ancora da definire, vedi OPEN-QUESTIONS); badge luxury tax nella home
- [x] Chiusura stagione (`/admin/chiusura`, migrazione 0008, `lib/season-close.ts`, RPC `admin_close_season`): l'admin inserisce classifica e ordine della lottery (estratta dal vivo) e spunta le team option esercitate; l'app calcola bonus (R-60, chiavi `rank_bonus_1..8` e `lottery_teams` in `league_settings`), ordine del draft (R-32), scadenze (R-23/R-24/R-26) e quote dei tagli, poi apre la stagione nuova con i contratti che continuano. I contratti in scadenza finiscono in `last_contracts` (nuova colonna `restricted`, mostrata in `/giocatori`). Fuori: squadra talenti e firma dei draftati (domanda 4), divisione della luxury tax (a mano), pesi della lottery (non in app). **Migrazione 0008 da applicare su Supabase prima del merge**: senza le chiavi nuove e la colonna le pagine non si caricano. Provata in locale su `supabase/postgres:17.11` (test RLS + prova della RPC con dati di esempio); non ancora applicata né vista nel browser. **Pulsante bloccato**: `SEASON_CLOSE_ENABLED = false` in `lib/season-close.ts` (UI e action rifiutano anche a piano valido); da portare a `true` con una PR quando la RPC è provata su dati veri. Ipotesi in OPEN-QUESTIONS. Sul database reale la chiusura oggi si rifiuta: i 7 tagli sono `pending` (l'import `--apply` del 2026-10-23 li scriveva senza stato; corretto in `scripts/import-xlsx.ts`, i dati si sistemano con «Taglio definitivo» in `/admin/rose` o con un UPDATE) e 17 contratti non hanno durata
- [x] `audit_log` visibile agli admin: ultime operazioni in `/admin` e storico completo con filtro e paginazione in `/admin/registro`

## Fase 4 — Rifiniture
- [ ] Storico stagioni e scambi
- [ ] Export CSV/Excel
- [x] Keep-alive Supabase (`.github/workflows/keepalive.yml`; i secret su GitHub si aggiungono come in [docs/DEPLOY.md](docs/DEPLOY.md))
- [ ] Backup periodico del database
- [ ] Notifiche (opzionale)

## Fuori scope per ora
Punteggi/formazioni settimanali (restano su Dunkest), staff fantasia, asta live in tempo reale (valutare in futuro).

## Prossimo passo
Pannello admin quasi chiuso: resta la squadra talenti/rookie (attende la domanda 4 di OPEN-QUESTIONS). Prima: applicare la migrazione 0008 e provare `/admin/chiusura` (a stagione chiusa non si torna indietro: provarla su un branch Supabase o su una copia). In parallelo: verificare le pagine su Vercel, creare gli altri 6 utenti, impostare le durate dei 17 ingaggi d'asta. Domande aperte: soglia di sicurezza, importo quota, `26?` e `(24)` nei talenti (vedi OPEN-QUESTIONS).

## Registro decisioni
- 2026-10-23: chiusura stagione. Stesso schema delle altre RPC: il piano (bonus, ordine del draft, contratti che continuano o scadono, tagli) si calcola in `lib/season-close.ts` e `admin_close_season` lo applica in una transazione, controllando che stagione, contratti e tagli siano ancora quelli visti dall'admin. Le righe della stagione chiusa restano come storico. Decisioni dell'utente: lottery estratta dal vivo fuori dall'app (l'admin inserisce le prime 4 posizioni), luxury tax solo calcolata (divisione a mano), restricted registrati e mostrati in `/giocatori`.
- 2026-10-23: feedback di caricamento e transizioni. Il `<Suspense>` del layout `(lega)` è sostituito da `loading.tsx` (scheletro mostrato subito alla navigazione, anche sotto `admin/`); `template.tsx` avvolge le pagine in `<ViewTransition>` (dissolvenza + salita di 6px, header fermo); i filtri di Lega/Giocatori/Scadenze usano `next/form` (prima ricaricavano la pagina intera) con `SubmitButton` che mostra lo spinner; nav e tab admin pulsano mentre la navigazione è in corso (`useLinkStatus`). Verificato a occhio nel browser dall'utente (2026-10-23).
- 2026-10-23: alias dei giocatori. Per le rose il listone dei free agent non basta (non contiene chi è in rosa), quindi l'import usa anche uno snapshot dei giocatori Dunkest (3 stagioni, committato per avere import ripetibili e senza rete). Il ruolo resta quello del foglio (`players.pos` entra in `teamFinance`/`rosterWarnings`); gli alias che risolvono omonimi o refusi con un'ipotesi sono commentati in `overrides.ts` (`Holiday` = Jrue, `J.Johnson` = Jalen, `Russel` = D'Angelo Russell, `Palle Larsson` = Pelle Larsson); `Thomas` = Cam Thomas e `B.Miller` = Brandon Miller confermati dall'utente. `A.Walker` resta provvisorio finché non si sa chi è.
- 2026-10-22: issue #3: test RLS in SQL puro (`supabase/tests/rls.sql`, transazione con rollback, id espliciti) invece di pgTAP: nessuna estensione da installare e il test controlla anche la forma del catalogo. Il job CI usa l'immagine `supabase/postgres` come service container (ruoli, schema auth e default privileges di Supabase già dentro, versione uguale a quella del progetto: 17.11) invece di `supabase start`, che richiederebbe `config.toml` e una decina di immagini. Se si aggiorna Postgres su Supabase, alzare anche il tag in `ci.yml`.
- 2026-10-22: pulizia del progetto. Eliminati i 12 branch remoti già mergiati (PR #1-#24, nessuna PR aperta) e il branch locale superseduto; `seed.sql` allineato (mancavano `pick_horizon_years` e `draft_rounds`, un DB nuovo non caricava le pagine); tolti `DEFAULT_RANK_BONUS` (R-60 resta in REGOLAMENTO, andrà in `league_settings` con la chiusura stagione) e il font Geist Mono mai usato; doc riallineati al codice (`DATA-MODEL` rimanda alle migrazioni invece di duplicare lo schema, `IMPORT` descrive l'abbinamento reale). «Automatically delete head branches» attivato su GitHub (confermato dall'utente il 2026-10-23).
- 2026-10-22: completamento pannello admin: stesso schema della 0006 (una RPC per operazione, regole in `lib/cap.ts`). I tagli hanno 4 stati e ricordano i termini del contratto; solo `pending` e `cut` pesano sul monte ingaggi.
- 2026-10-22: migrazioni rinominate `<timestamp>_nome.sql` e storico remoto allineato (righe 0001, 0002, 0006 inserite in `supabase_migrations.schema_migrations`): il check "Supabase Preview" falliva con "Remote migration versions not found in local migrations directory". Rinominata anche la 0007 (applicata come `20261021222924`).
- 2026-10-22: meno round-trip verso Supabase: `proxy.ts` e `loadProfile` usano `getClaims()` (JWT ES256 verificato in locale, nessuna chiamata ad Auth; una sessione revocata vale fino alla scadenza del JWT, come già per la RLS); `loadLeague` legge anche `version` e `loadVersions` ne deriva, la stagione corrente si legge una volta per richiesta. Da controllare a mano: regione delle funzioni Vercel (Supabase è in `eu-west-1`).
- 2026-10-22: issue #6 decisa: una RPC Postgres per operazione (security definer + `is_admin()`), regole di lega solo in `lib/cap.ts`, concorrenza ottimistica con colonna `version`, audit scritto dalle RPC (l'issue #5 potrà passare ai trigger).
- 2026-10-21: stack Next.js + Supabase + Vercel (tutto free tier).
- 2026-10-21: admin dell'app = Scuti e Gabby; Serde (presidente) e Amedeo (moderatore) restano ruoli del regolamento.
- 2026-10-21: `r` = rookie, `u` = unrestricted nei nomi contratto (corretto dall'utente: prima era `r` = restricted; colonna `contracts.is_rookie`, migrazione 0005); la classifica finale si registra nell'app.
- 2026-10-21: `Dunkest.xlsx` e il .docx restano fuori da git finché non si decide di pubblicarli (nomi/dati privati della lega).
- 2026-10-21: il monte ingaggi include le quote dei tagliati (verificato sul foglio); la soglia della luxury tax è assunta = cap effettivo.
- 2026-10-21: Next 16 con `cacheComponents`: i dati per-utente stanno dentro `<Suspense>` (layout del gruppo `(lega)`); `middleware` si chiama `proxy.ts`.
- 2026-10-21: grafica ispirata a NBA.com (token colore in `globals.css`, font Barlow Condensed per i titoli); `instantInsights.validationLevel: "manual-warning"` in `next.config.ts` per non far bloccare il dev overlay dalle letture di sessione.
