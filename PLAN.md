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
- [x] Schema SQL + RLS in `supabase/migrations/0001_init.sql` e `seed.sql` (bozza, **non ancora eseguita**)
- [ ] Creare progetto Supabase (account dell'utente) e applicare migrazione + seed; testare RLS
- [x] `src/lib/cap.ts` + test: riproduce monte ingaggi, spazio salariale e spazio riserve di tutte e 8 le squadre del foglio (16 test verdi)
- [x] `scripts/import-xlsx.ts`: report di verifica (8/8 squadre quadrano col foglio) e `--apply` su Supabase (**scrittura non ancora provata**)
- [x] Pick incerte importabili come `to_confirm` (migrazione 0002); report a 0 problemi
- [x] Migrazione 0002 applicata, `.env.local` creato, import `--apply` eseguito (2026-10-21): 123 contratti, 5 tagliati, 39 talenti, 120 pick, 40 rookie draft, 568 giocatori
- [ ] UI admin: correggere le pick da confermare (fase 3)
- [ ] Export Dunkest completo per i giocatori in rosa (nome intero, squadra NBA, ruolo)
- [x] Seed squadre e stagione 2026 (`seed.sql`)
- [x] Seed giocatori Dunkest e contratti dal foglio (125 giocatori in rosa sono provvisori: solo cognome)

## Fase 2 — Sola lettura (utenti normali)
- [x] Login email+password e link via email (`/login`, `proxy.ts` protegge tutte le pagine). Richiede `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`; per il link: aggiungere `http://localhost:3000/auth/callback` (e poi l'URL Vercel) in Supabase → Authentication → URL Configuration
- [x] **Home lega**: 8 squadre con monte ingaggi, spazio, bonus, stato (sforato / sotto floor)
- [x] **Pagina squadra**: titolari, riserve, talenti, tagliati, pick possedute e cedute
- [x] **Draft**: pick scambiate 2026-2028 (con "da confermare") e ordine rookie draft 2026
- [ ] **Giocatori**: listone Dunkest filtrabile (ruolo, squadra NBA, libero/occupato)
- [x] Layout mobile-first, tema chiaro/scuro automatico
- [ ] **Verifica con login reale** (le pagine con dati non sono ancora state viste in un browser: manca la chiave anon)

## Fase 3 — Pannello admin
- [ ] Ruolo admin + guardia su rotte e RLS
- [ ] CRUD contratti: firma (durata 0.5/1/2/3, team option), modifica, rimozione; validazioni 13+3..6, 5G/5A/3C, max 3 riserve per ruolo
- [ ] Taglio giocatore → asta tagliati → taglio definitivo (1/3 stipendio) o rientro
- [ ] Squadra talenti e rookie: firma al valore d'ingresso max 2 stagioni, scadenza prelazione
- [ ] Scambi: giocatori + pick, **controllo cap** (R-57) con override moderatore motivato
- [ ] Gestione pick (max 2 per giro, solo 3 anni avanti)
- [ ] Tracciare quota iscrizione pagata e luxury tax pagata per squadra
- [ ] Chiusura stagione: inserimento classifica finale → bonus (R-60), lottery draft (R-32), luxury tax (R-12), nuova stagione con scadenze contratti e stato restricted/unrestricted (R-23/R-24)
- [ ] `audit_log` visibile agli admin

## Fase 4 — Rifiniture
- [ ] Storico stagioni e scambi
- [ ] Export CSV/Excel
- [ ] Backup periodico + keep-alive Supabase
- [ ] Notifiche (opzionale)

## Fuori scope per ora
Punteggi/formazioni settimanali (restano su Dunkest), staff fantasia, asta live in tempo reale (valutare in futuro).

## Prossimo passo
Aggiungere la chiave anon, provare il login e controllare le pagine; poi pagina Giocatori (listone) e deploy su Vercel. Gli altri 6 utenti si creano dopo. Aperte solo: soglia di sicurezza, importo quota, formato listone Dunkest (vedi OPEN-QUESTIONS).

## Registro decisioni
- 2026-10-21: stack Next.js + Supabase + Vercel (tutto free tier).
- 2026-10-21: admin dell'app = Scuti e Gabby; Serde (presidente) e Amedeo (moderatore) restano ruoli del regolamento.
- 2026-10-21: `r` = restricted, `u` = unrestricted nei nomi contratto; la classifica finale si registra nell'app.
- 2026-10-21: `Dunkest.xlsx` e il .docx restano fuori da git finché non si decide di pubblicarli (nomi/dati privati della lega).
- 2026-10-21: il monte ingaggi include le quote dei tagliati (verificato sul foglio); la soglia della luxury tax è assunta = cap effettivo.
- 2026-10-21: Next 16 con `cacheComponents`: i dati per-utente stanno dentro `<Suspense>` (layout del gruppo `(lega)`); `middleware` si chiama `proxy.ts`.
