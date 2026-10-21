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
1. Normalizzare: ASCII senza accenti, minuscolo, via `. , ' -`, via `jr sr ii iii`.
2. Nome intero uguale → fatto.
3. Se il foglio ha un prefisso puntato (`F.Wagner`, `Ke.George`): stesso cognome e nome che inizia per il prefisso.
4. Più candidati: scegliere con il **ruolo della riga** (A/C/G contro G/F/C di Dunkest) e poi con le partite giocate; i casi sotto restano da confermare a mano.
5. Abbreviazioni e refusi: tabella di alias.

Sul foglio del 21/10: 107 nomi si abbinano da soli, 29 vogliono un alias, 5 sono ambigui, 8 non si trovano. I "non trovati" mancano perché la tabella statistiche contiene solo chi ha giocato almeno una partita: per l'abbinamento serve la lista completa dei giocatori, non le statistiche. `Foglio3` ha solo i free agent, quindi per quelli in rosa serve un export Dunkest completo (vedi PLAN).

### Alias (nome nel foglio → giocatore)
| Foglio | Giocatore | | Foglio | Giocatore |
|---|---|---|---|---|
| F.Wagner | Franz Wagner | | Do.Mitchell | Donovan Mitchell |
| Ke.George | Keyonte George | | La.Ball | LaMelo Ball |
| Ky.George | Kyshawn George | | Kneuppel | Kon Knueppel (refuso) |
| Mk.Bridges | Mikal Bridges | | J.Brown | Jaylen Brown |
| Mi.Bridges | Miles Bridges | | THE KING | LeBron James |
| Au.Thompson | Ausar Thompson | | St.Curry | Stephen Curry |
| Am.Thompson | Amen Thompson | | N.Powell | Norman Powell |
| Edwards | Anthony Edwards | | D.White | Derrick White |
| Irving | Kyrie Irving | | Dr.Green | Draymond Green |
| Poetl | Jakob Poeltl (refuso) | | J.Collins | John Collins |
| Giannis | Giannis Antetokounmpo | | Nembhard, A.Nembhard | Andrew Nembhard |
| SGA | Shai Gilgeous-Alexander | | R.Nembhard | RJ Nembhard |
| De.Murray | Dejounte Murray | | Thomas | Cam Thomas |
| J.Murray | Jamal Murray | | Holiday | Jrue Holiday |
| Zion | Zion Williamson | | Ja.Williams | Jalen Williams |
| J.Johnson | Jalen Johnson | | C.Jonhson | Cameron Johnson (refuso) |
| K.Johnson | Keldon Johnson | | | |

### Da confermare a mano
Ambigui, proposta in base al ruolo della riga: `Young` → Trae Young, `J.Smith jr` → Jabari Smith Jr., `Washington` → PJ Washington, `Harper r` → Dylan Harper, `Carter jr` → Wendell Carter Jr.
Non trovati, proposta: `Lillard` → Damian Lillard, `Haliburton` → Tyrese Haliburton, `JJJ` → Jaren Jackson Jr., `Vanvleet` → Fred VanVleet, `Hartestein` → Isaiah Hartenstein, `Withmore` → Cam Whitmore, `Murray-Boyeles` → Collin Murray-Boyles. Resta da identificare `A.Walker` (2+1, 6.5).

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
