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
- **Listone**: prima di scrivere le statistiche, `findNewPlayers` cerca chi ha giocato su Dunkest e non ha un giocatore con lo stesso id o nome (omonimi dubbi esclusi) e `dunkest_sync_add_players` lo crea in `players` con nome, ruolo (F → A), squadra NBA e crediti di Dunkest (null se 0.0); è idempotente e si ferma a 100 per esecuzione. Chi è solo nella lista infortuni (nome abbreviato) non si aggiunge: resta nel report. Il report elenca gli aggiunti.
- **Report**: in `/admin/dunkest` (ultimo aggiornamento e ogni esecuzione dello storico): omonimi non risolti, giocatori in rosa senza dati Dunkest (né statistiche né infortuni), provvisori, infortunati senza giocatore nel listone.

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
