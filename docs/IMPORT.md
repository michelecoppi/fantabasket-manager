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
