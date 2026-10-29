# Import dal foglio: nomi e fonti dati

Per `scripts/import-xlsx` (fase 1): come trasformare i nomi del foglio in giocatori e da dove prendere i dati Dunkest. Verificato sul foglio del 21/10/2026 (149 nomi tra titolari e riserve).

## Nomi nei contratti
Formato `<anni>[+1] <Nome> [u|r]`. Per ottenere il nome:
```
^\d(\+\d)?\s+      // prefisso contratto: 1, 2, 1+1, 2+1
(\s+[ur])+\s*$     // sigle in coda
```
`1+1 Tatum u` → `Tatum`, `2 Flagg r` → `Flagg`, `1 THE KING u` → `THE KING`.
Altre sezioni portano roba in più nel nome: i tagliati lo stipendio originale (`1 Russel 5`, `1 J.Wilson r 4.5`), i talenti l'anno di draft (`Dybantsa 26`, `Hinson 25 (24)`). Vanno tolti prima. Occhio ai `\xa0` nelle celle.

## Abbinare il nome al giocatore
Fa `matchPlayer` in `scripts/lib/parse.ts` (nomi in `scripts/lib/names.ts`, alias in `scripts/lib/overrides.ts`). Il nome breve si divide in prefisso puntato e cognome (`F.Wagner` → `f` + `wagner`; `Ke.George` → `ke` + `george`), con lettere minuscole senza accenti né punteggiatura (`Porter jr` → `porterjr`, come `Porter Jr.` di Dunkest). Ordine dei tentativi:
1. **Alias** (`PLAYER_ALIASES`): chiave = nome del foglio ridotto a lettere (`sga`, `mkbridges`), valore = nome intero come lo scrive Dunkest. Per abbreviazioni che il prefisso non risolve (`Mk.Bridges`), soprannomi (`THE KING`, `JJJ`), refusi (`Poetl`, `Kneuppel`) e omonimi (`Holiday`, `J.Johnson`). Cerca nel listone e poi nello snapshot; un alias che non trova nessuno fa fallire `parse.test.ts`.
2. **Listone dei free agent** (`Foglio3`): collegato solo se il proprietario (colonna `Restricted`) è la squadra della riga, **oppure** se i crediti sono uguali allo stipendio. Un cognome uguale non basta: un omonimo (Jahmir Young al posto di Trae Young) sarebbe un falso collegamento.
3. **Snapshot Dunkest** (`scripts/data/dunkest-players.json`): cognome (e prefisso) uguali, esclusi i free agent del listone; se restano più candidati vale il ruolo della riga. Il report elenca ogni collegamento di questo tipo (`pool`): nello snapshot manca chi non ha giocato nelle ultime tre stagioni, quindi un cognome unico può dare un falso collegamento.

Chi non si abbina resta un giocatore provvisorio (solo il nome del foglio, `first_name` vuoto). Il ruolo resta sempre quello del foglio, anche se Dunkest ne scrive uno diverso (il report li elenca): `players.pos` entra nei controlli di rosa e monte ingaggi. Sul foglio del 21/10 l'unico nome non risolto è `A.Walker` (G, 6.5, riserva di Bol Bollerz).

### Snapshot
`npx tsx scripts/fetch-dunkest-players.ts` riscrive `scripts/data/dunkest-players.json` (665 giocatori) dall'API qui sotto, stagioni 2026-27, 2025-26 e 2024-25; per ogni giocatore vale la più recente (l'`id` Dunkest è lo stesso tra stagioni). Ruolo G/F/C → G/A/C. La squadra NBA è quella dell'ultima stagione giocata: per chi non ha ancora giocato nel 2026-27 può essere vecchia (il report lo segna), e lo snapshot va ripreso a stagione avanzata. I crediti non si prendono da qui (vedi sotto).

## Fonte dati Dunkest
Il sito ha una tabella statistiche pubblica, non documentata (può cambiare), che risponde con un JSON. Serve l'header `User-Agent`.
```
https://www.dunkest.com/api/stats/table?season_id=<id>&mode=nba&stats_type=avg
  &date_from=2000-01-01&date_to=2100-01-01&positions[]=1&positions[]=2&positions[]=3
  &player_search=&min_cr=0&max_cr=35&sort_by=pdk&sort_order=desc
```
`season_id`: 19 = 2024-25, 25 = 2025-26, 29 = 2026-27 (a inizio stagione ha pochi giocatori: 345 dopo le prime partite).
Campi utili: `id`, `first_name`, `last_name`, `team_code`, `team_name`, `position` (G/F/C), `pdk`, `gp`, `min`. Elenca solo chi ha giocato almeno una partita (527 giocatori nel 2025-26). `team_name` scrive `LA Clippers`, il listone `Los Angeles Clippers`: lo snapshot usa il secondo.
**I crediti non sono affidabili**: `cr` è 0.0 per 494 giocatori su 527 e i 33 valori diversi da zero non coincidono con `Cr 26/27` del foglio. I crediti restano dall'export del listone (`Foglio3`).
Riempie `players` (squadra NBA, nome intero) e può dare statistiche, non i crediti.
Verificato il 2026-10-27: con `season_id=29` risponde con 408 giocatori; il più caro vale 29,5 crediti, quindi `max_cr=35` non taglia nessuno.

## Job giornaliero Dunkest
Issue #68. Punteggio medio (`pdk`), partite giocate (`gp`, più minuti, punti, rimbalzi, assist) e infortuni si aggiornano **una volta al giorno**: le pagine leggono solo il database, mai Dunkest.
- **Quando**: cron di Vercel `0 8 * * *` (UTC) su `/api/dunkest` = 9:00 italiane in ora solare, 10:00 in ora legale. Sul piano gratuito Vercel parte entro l'ora indicata, non al minuto. A mano: `/admin/dunkest` → «Aggiorna ora» (stessa procedura, con la sessione admin).
- **Fonti**: le statistiche dall'endpoint sopra (`season_id` = `seasons.dunkest_season_id` della stagione corrente); gli infortuni dalla pagina HTML `https://www.dunkest.com/it/nba/infortuni` (nessun JSON): si legge solo la vista «per squadra» (`injuries__wrapper` con `data-target="by-team"`), una riga per giocatore con link `/it/giocatore/<id>/<slug>`, data (`data-date`), infortunio e descrizione. Lo stato si ricava dalla descrizione: «Indisponibile fino al 20 Nov» = fuori (con rientro), «GTD: da valutare…» = in dubbio, «…per tutta la stagione» = stagione finita. Parser e test con campioni salvati: `src/lib/dunkest.ts`, `src/lib/fixtures/`.
- **Collegamento** (`linkPlayers`): prima `players.dunkest_id` già salvato, poi nome intero ridotto con `lettersOnly` (lo stesso dell'import, ora in `src/lib/text.ts`), poi nome senza suffisso (Jr., III). Più candidati: decide la squadra NBA; se non basta il caso va nel report, mai indovinato. I provvisori (solo cognome) non si collegano. Per gli infortuni il nome intero viene dallo slug del link (la tabella lo abbrevia, «M. Gueye»). Primo giro sul database reale (2026-10-27): 405 collegati, 357 giocatori con statistiche, 79 infortunati, nessun omonimo dubbio.
- **Scrittura**: `dunkest_sync_source` (giocatori e stagione) e `dunkest_sync_apply` (id nuovi, statistiche e infortuni sostituiti, stato e storico) in una transazione. Se Dunkest non risponde, cambia formato o le statistiche arrivano vuote non si scrive nulla: `dunkest_sync_fail` registra il motivo e le pagine mostrano gli ultimi dati validi con l'avviso «aggiornamento fallito».
- **Autorizzazione**: la `service_role` non va su Vercel. Il job usa la chiave anon e passa alle RPC lo stesso `CRON_SECRET` che Vercel manda come Bearer; le RPC lo confrontano con l'hash in `private.job_secrets` (un admin con sessione passa anche senza). Per attivarlo: impostare `CRON_SECRET` su Vercel (almeno 16 caratteri) e salvarne l'hash, come scritto in testa alla migrazione. Senza, il cron risponde 401/500 e il pulsante admin resta l'unico modo di aggiornare.
- **Listone**: prima di scrivere le statistiche, `findNewPlayers` cerca chi ha giocato su Dunkest e non ha un giocatore con lo stesso id o nome (omonimi dubbi esclusi) e `dunkest_sync_add_players` lo crea in `players` con nome, ruolo (F → A), squadra NBA e crediti di Dunkest (null se 0.0); è idempotente e si ferma a 100 per esecuzione. L'import `--apply` non li toglie (gli orfani senza id Dunkest sì). Chi è solo nella lista infortuni (nome abbreviato) non si aggiunge: resta nel report. Il report elenca gli aggiunti.
- **Report**: in `/admin/dunkest` (ultimo aggiornamento e ogni esecuzione dello storico): omonimi non risolti, giocatori in rosa senza dati Dunkest (né statistiche né infortuni), provvisori, infortunati senza giocatore nel listone.

### Lega privata: classifica, calendario, formazioni (issue #72)
Stesso job, dopo statistiche e infortuni (le due parti sono indipendenti: se una fallisce l'altra scrive lo stesso). Codice: `src/lib/dunkest-league.ts` (parser, payload, confronto, puri e testati) e `src/lib/dunkest-league-sync.ts` (richieste).
- **Fonte**: l'API dell'app della lega (`fantasy.dunkest.com`, motore Fantaking), non documentata, verificata il 2026-10-27. Chiede il token personale di un membro della lega (`Authorization: Bearer`), che sta **solo** nella variabile `DUNKEST_TOKEN` di Vercel (Production, Sensitive): mai nel repository, nel database o nei log. Il login all'app è con Apple, quindi il job non può rifarlo: il token si rinnova a mano. Il logout dall'app Dunkest lo revoca.
  - `GET /api/v1/tournaments/<torneo>/standings`: classifica (`id` squadra, `position`, `total_pts`, `wins`, `draws`, `losses`).
  - `GET /api/v1/tournaments/<torneo>` → `starting_matchday_id` (prima giornata).
  - `GET /api/v1/tournaments/<torneo>/matchdays/<giornata>/fantasy-matches`: scontri di una giornata (`home_team`/`away_team` con `pts`, `winner_id`); `{"data": []}` prima dell'inizio, 404 dopo l'ultima giornata (il 2026-27 ne ha 100, id 1858-1957).
  - `GET /api/v1/fantasy-matches/<scontro>`: formazioni (`players.starters` e `players.bench`, 5+5, con `is_captain`, `is_sixth_man`, `court_position`, `pts`); `players: null` se la giornata non è iniziata. La tribuna non c'è.
  - `GET /api/v1/fantasy-leagues/<lega>/fantasy-teams/<squadra>`: rosa completa (13 giocatori, tribuna compresa) di qualsiasi squadra della lega, salvata ogni giorno in `dunkest_rosters`. (`fantasy-teams/<squadra>/matchdays/<giornata>/roster` invece risponde 403 per le squadre degli altri.)
  - Lega e torneo stanno in `seasons.dunkest_league_id` / `dunkest_tournament_id` (2026: 164491 «DUNKESTARS», 252941 «KD FOTO PIEDI»); squadre in `dunkest_teams` (esplicito, mai dal nome; dal 2026-10-29 i nomi coincidono con quelli di Dunkest). Una squadra Dunkest senza riga ferma il job con l'errore che lo dice. **A ogni stagione nuova vanno inseriti i nuovi id.**
- **Quanto si legge**: classifica ogni giorno; il calendario completo al primo giro e poi ogni 7 giorni (`dunkest_sync.calendar_at`, ~100 richieste a gruppi di 6, ~2 s); negli altri giorni solo l'ultima giornata con punti, quella prima e quella dopo, più le formazioni degli scontri iniziati (~12 richieste).
- **Giocatori**: gli id dell'app della lega non sono quelli di dunkest.com (Doncic 3 contro 127), quindi c'è `players.dunkest_fantasy_id`, trovato con lo stesso `linkPlayers` delle statistiche (nome intero, poi senza suffisso; mai indovinato). Chi non si collega si scrive col solo nome e va nel report (il 27/10 «Alex Sarr» e «Nicolas Claxton», collegati a mano nelle migrazioni).
- **Token**: un 401 diventa «token da rinnovare» (`league_error_code = token_rejected`), i dati restano quelli di prima e `token_ok_since` si azzera; `/admin/dunkest` mostra da quanti giorni il token funziona, per capire se scade. Variabile mancante = `token_missing` (succede in locale e nei preview: il token è solo in Production).
- **Confronto con le rose**: si fa nelle pagine con le rose di adesso (`checkLineup`), non nel job: schierato ma riserva nell'app, di un'altra squadra, in nessuna rosa, non collegato. È un avviso.
- **Titolari e riserve**: chi è nella rosa Dunkest è titolare (decisione dell'utente). `rosterAlignment` calcola per ogni squadra chi sale e chi scende, con l'effetto su cap e riserve (`cap.ts`); in `/admin/dunkest` un admin conferma e l'action `alignToDunkest` chiama `admin_swap_slots` (una transazione per squadra, versione e revisione della rosa controllate, `audit_log`). Il job non tocca mai i contratti.
- **Prova in locale**: con `DUNKEST_TOKEN` anche in `.env.local` (mai committato) «Aggiorna ora» dal sito locale scrive sul database reale come in produzione.

## Scrittura sul database (`--apply`)
`npx tsx --env-file=.env.local scripts/import-xlsx.ts --apply [--season=AAAA] [--force]`. Prima il report (stesso di sempre; si ferma se ci sono problemi, salvo `--force`), poi il controllo del payload (`payloadErrors` in `scripts/lib/payload.ts`: contratti senza giocatore, squadre sconosciute, foglio senza contratti), poi **una sola chiamata** alla RPC `import_replace_season` (migrazione `20261026201951`). Eseguibile solo con la `service_role`; la transazione è unica, quindi un errore in qualunque punto non lascia nessuna modifica (provato in `supabase/tests/import.sql`).

Cosa viene sostituito, per la stagione `--season` (default 2026, deve esistere in `seasons`):

| Dati | Regola |
| --- | --- |
| `contracts`, `cuts`, `rookie_draft`, `team_season` | sostituiti per quella stagione; le altre stagioni non si toccano |
| `draft_picks` | sostituiti solo gli anni presenti nel foglio (es. 2027-2029) |
| `talents` | non legata a una stagione: sostituita per intero con quella del foglio |
| `last_contracts` | sostituite le righe dei giocatori presenti nel foglio; le altre (scadenze di `admin_close_season`) restano |
| `players` | non si svuota: si aggiornano ruolo e crediti, si creano i nuovi, si tolgono solo quelli che nessuna tabella referenzia più |

Il foglio è la fonte della stagione che si importa: dopo una chiusura di stagione non rilanciare l'import sulla stagione nuova senza un foglio aggiornato, perché ne sostituirebbe contratti e tagli. Il backup resta a carico di chi lancia `--apply` (copia delle tabelle o dump prima di scrivere sul database reale).

### Provare l'import in locale (mai sul database reale)
Stessa procedura di `supabase/tests/rls.sql`: Postgres `supabase/postgres:17.11.0.006` con migrazioni e seed, poi `psql -X -v ON_ERROR_STOP=1 -f supabase/tests/import.sql` (stagioni fittizie 2098/2099, tutto in una transazione annullata alla fine). In CI gira dopo il test RLS.
