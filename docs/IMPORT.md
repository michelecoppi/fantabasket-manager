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
Fa `matchPlayer` in `scripts/lib/parse.ts` (nomi in `scripts/lib/names.ts`). Il listone (`Foglio3`) contiene solo i free agent, quindi un cognome uguale non basta: un omonimo sarebbe un falso collegamento (es. Jahmir Young al posto di Trae Young).
1. Il nome breve si divide in prefisso puntato e cognome (`F.Wagner` → `f` + `wagner`; `Ke.George` → `ke` + `george`), con lettere minuscole senza accenti né punteggiatura.
2. Candidati = stesso cognome (e nome che inizia per il prefisso, se c'è).
3. Collegato solo se un candidato ha come proprietario (colonna `Restricted`) la squadra della riga, **oppure** se i suoi crediti sono uguali allo stipendio del contratto. Altrimenti (zero o più candidati) resta un giocatore provvisorio con il solo nome del foglio.

Non c'è una tabella di alias per i giocatori: abbreviazioni e refusi del foglio restano provvisori. Gli unici alias nel codice sono quelli delle squadre. `Foglio3` non contiene chi è già in rosa: per collegare anche quelli serve un export Dunkest completo (vedi PLAN).

### Proposte di abbinamento manuale (non implementate)
Abbreviazioni e refusi che un futuro alias potrebbe risolvere: `F.Wagner` Franz Wagner, `Ke.George` Keyonte George, `Ky.George` Kyshawn George, `Mk.Bridges` Mikal Bridges, `Mi.Bridges` Miles Bridges, `Au.Thompson` Ausar Thompson, `Am.Thompson` Amen Thompson, `Do.Mitchell` Donovan Mitchell, `La.Ball` LaMelo Ball, `Kneuppel` Kon Knueppel, `Poetl` Jakob Poeltl, `THE KING` LeBron James, `St.Curry` Stephen Curry, `SGA` Shai Gilgeous-Alexander, `Giannis` Giannis Antetokounmpo, `JJJ` Jaren Jackson Jr., `Vanvleet` Fred VanVleet, `Hartestein` Isaiah Hartenstein, `Withmore` Cam Whitmore, `C.Jonhson` Cameron Johnson.
Ambigui, in base al ruolo della riga: `Young` Trae Young, `J.Smith jr` Jabari Smith Jr., `Washington` PJ Washington, `Harper r` Dylan Harper, `Carter jr` Wendell Carter Jr. Da identificare: `A.Walker` (2+1, 6.5).

## Fonte dati Dunkest
Il sito ha una tabella statistiche pubblica, non documentata (può cambiare), che risponde con un JSON. Serve l'header `User-Agent`.
```
https://www.dunkest.com/api/stats/table?season_id=<id>&mode=nba&stats_type=avg
  &date_from=2000-01-01&date_to=2100-01-01&positions[]=1&positions[]=2&positions[]=3
  &player_search=&min_cr=0&max_cr=35&sort_by=pdk&sort_order=desc
```
`season_id`: 19 = 2024-25, 25 = 2025-26, 29 = 2026-27 (a inizio stagione ha pochi giocatori: 68 dopo le prime partite).
Campi utili: `first_name`, `last_name`, `team_code`, `team_name`, `position` (G/F/C), `pdk`, `gp`, `min`. Elenca solo chi ha giocato almeno una partita (527 giocatori nel 2025-26).
**I crediti non sono affidabili**: `cr` è 0.0 per 494 giocatori su 527 e i 33 valori diversi da zero non coincidono con `Cr 26/27` del foglio. I crediti restano dall'export del listone (`Foglio3`).
Può riempire `players` (squadra NBA, ruolo) e dare statistiche, non i crediti.
