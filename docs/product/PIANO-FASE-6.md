# Piano — Fase 6: la lega che si racconta

Quattro novità di sola lettura che trasformano i dati Dunkest già salvati ogni mattina in qualcosa da riaprire e da commentare nel gruppo: **Premi della giornata**, **Affari e flop**, **Rivalità**, **Andamento in classifica**. Scritto il 2026-10-29 su richiesta dell'utente; le proposte 5 e 6 (pagelle degli scambi, sondaggi) restano in [ROADMAP.md](ROADMAP.md) per dopo.

## Principi (valgono per tutte e quattro)

- **Solo lettura, nessuna regola di lega.** Niente tocca `cap.ts`, contratti, pick o permessi. Le soglie di presentazione (partite minime, numero di righe) sono costanti di visualizzazione nel modulo che le usa, commentate, non parametri di `league_settings`.
- **Solo dati che Dunkest dà.** Mai ricostruire il punteggio di squadra dai giocatori: il 2026-10-29 il punteggio di uno scontro **non** è la somma dei punti dei 10 schierati (es. 240,05 contro 275,88), perché Dunkest applica capitano e panchina con regole che non abbiamo. I premi usano i punti del giocatore e il punteggio di squadra così come arrivano.
- **Logica pura e testata** in `src/lib/` (un modulo per novità), pagine che chiamano funzioni e disegnano. Fixture tratte dai dati veri in forma ridotta, senza dati personali.
- **Nessuna voce di menu nuova** (decisione del 2026-10-27, tab bar corta): tutto vive in `/classifica`, nella pagina squadra, in `/giocatori` e in home, con `ViewSwitch` dove serve una seconda vista (come `/scadenze?vista=planner`).
- **Arena Night** ([DESIGN_SYSTEM.md](../design/DESIGN_SYSTEM.md)): token, stemmi e colori squadra da `team-colors.ts`, icone in `icons.tsx` (eventuali nuove da Tabler, MIT), niente librerie di grafici né di animazioni. Fonte dichiarata con `LeagueSource`/`DunkestSource`. Mobile-first, verificato a 390 e 1280 px, chiaro e scuro.
- **Ultima giornata = provvisoria.** Come oggi in `/classifica` e in `teamForm`: la giornata `latest` può essere ancora in corso, quindi i premi la marcano «provvisori» e rivalità e andamento contano solo le giornate `played`.

## Dati disponibili (verificati sul database il 2026-10-29)

| Dato | Tabella | Stato |
|---|---|---|
| Calendario e risultati | `dunkest_matches` | 100 giornate, 4 scontri ciascuna; giocate 1–3, la 4 appena iniziata (0,00–0,00) |
| Classifica | `dunkest_standings` | 8 squadre; ordine = vittorie, poi punti totali; `total_pts` = somma dei punti di squadra negli scontri |
| Formazioni con punti | `dunkest_lineups` | 10 giocatori per squadra e scontro (5 quintetto + 5 panchina, capitano e sesto uomo marcati), **solo giornate 2 e 3**: la 1 manca (vedi 6.0) |
| Punteggio medio giocatori | `dunkest_stats` | PDK e partite giocate per 417 giocatori |
| Stipendi | `contracts` | stagione corrente, titolari e riserve |
| Scambi | `trades` | 0 righe: per questo la proposta 5 aspetta |

Tutto è già letto da `loadLeagueDunkest()`, `loadLineups()`, `loadDunkest()` e `loadLeague()` in `src/lib/league-server.ts`: le novità 6.2, 6.3 e 6.4 non richiedono query nuove.

---

## 6.0 — Prerequisito: storico completo delle formazioni

**Problema.** Il job legge le formazioni solo per l'ultima giornata giocata ±1 (`windowAround` in `src/lib/dunkest-league-sync.ts`). Le righe salvate restano (l'apply cancella solo gli scontri riletti), ma una giornata saltata non si recupera più: la giornata 1 non ha formazioni perché il primo giro (27/10) le ha lette solo per 2–4, e lo stesso succederebbe se il cron saltasse due giorni di fila.

**Soluzione.**
1. Verifica preliminare: una `GET` a `fantasy-matches/<id>` di uno scontro della giornata 1 con il token, per sapere se Dunkest restituisce ancora le formazioni delle giornate vecchie. Se non le dà, la 6.0 si riduce a «la giornata 1 resta senza premi» e il resto vale per il futuro.
2. `dunkest_league_source` restituisce per ogni giornata anche `has_lineups` (almeno una formazione salvata). Migrazione nuova che sostituisce la funzione (stessa firma, un campo in più nel JSON).
3. Funzione pura `lineupBackfill(known, window, max)` in `src/lib/dunkest-league.ts`: giornate giocate senza formazioni, fuori dalla finestra, dalla più recente, al massimo `max` per giro (proposta: 3 giornate = 12 chiamate, per non allungare il cron). Il job aggiunge quegli scontri ai dettagli da leggere; l'apply non cambia.
4. Il report del job dice quante giornate ha recuperato; `/admin/dunkest` le mostra nello storico.

**Test.** Unità per `lineupBackfill` (buchi, tetto, nessun buco); `rls.sql` gira da solo perché la funzione cambia. **Da applicare sul progetto reale** dopo il merge.
**Sforzo:** piccolo. **Dipende da:** niente. **Serve a:** completezza di 6.1 (la bacheca stagionale).

---

## 6.1 — Premi della giornata

**Dove.** In `/classifica`, sotto gli scontri della giornata scelta, una sezione «Premi della giornata». In home, nella sezione «Il campionato», una riga col premio MVP dell'ultima giornata chiusa. Più avanti (dopo 6.0) una «Bacheca» stagionale.

**Premi** (solo da punti dati da Dunkest; a parità di valore il premio è condiviso):

| Premio | Regola | Fonte |
|---|---|---|
| MVP | giocatore schierato con più punti nella giornata | `dunkest_lineups.pts` |
| Capitano d'oro / di latta | capitano con più / meno punti | `is_captain` |
| Sesto uomo | sesto uomo con più punti | `is_sixth_man` |
| Colpo dalla panchina | panchinaro (non sesto uomo) con più punti | `role = 'bench'` |
| Squadra della giornata / Cucchiaio di legno | punteggio di squadra più alto / più basso | `dunkest_matches` |
| Goleada / Al fotofinish | scontro col margine più largo / più stretto | `dunkest_matches` |

**Esclusi di proposito.** «Punti lasciati in panchina» e qualunque premio che richieda il calcolo del punteggio di squadra: servono le regole di Dunkest su capitano e panchina, che non abbiamo (vedi principi). I punti del capitano si mostrano come li dà Dunkest, senza dire se includono il bonus.

**Logica.** `src/lib/awards.ts`: `matchdayAwards(matches, lineups)` → lista di premi `{ kind, winners: { teamId, name?, playerId?, value }[] }`; giocatori con `pts` null esclusi; giocatori non collegati ammessi (il nome viene dalla formazione). Per la bacheca: `seasonAwards(perMatchday)` conta i premi per squadra.
**Dati.** In `/classifica` le formazioni della giornata scelta sono già caricate (`loadLineups`): zero query in più. In home una `loadLineups` sull'ultima giornata chiusa. Per la bacheca serve una lettura di tutte le formazioni della stagione: ~80 righe a giornata, quindi oltre 1000 righe dalla tredicesima giornata → paginare come `fetchAllPlayers`.
**UI.** Griglia di «trofei» (2 colonne su telefono, 4 da `lg`): icona (`trophy`, `crown`, `flame`, `badge`; eventuali nuove da Tabler), etichetta, nome del giocatore, stemma squadra, valore in `tnum`; ingresso con `rise` e `stagger`. Badge «provvisori» sull'ultima giornata. Il premio della mia squadra ha il bordo oro, come gli scontri che mi riguardano. Nessun premio se la giornata non ha formazioni: `Empty` con il perché.
**Test.** Fixture ricavate dalle giornate 2 e 3: un premio per tipo, pareggi di valore, pts null, giornata senza formazioni.
**Accettazione.** Sulla giornata 3 i premi corrispondono a una verifica in SQL sui dati veri; la giornata 1 mostra lo stato vuoto (o i premi, dopo 6.0); niente sbordo orizzontale a 390 px.
**Sforzo:** piccolo (la bacheca: piccolo-medio, dopo 6.0).

---

## 6.2 — Affari e flop

**Dove.** In `/giocatori` una seconda vista con `ViewSwitch` («Listone» / «Affari e flop», `?vista=affari`). Nella pagina squadra una riga «Il tuo affare» e «Il tuo flop» sotto i titolari.

**Metrica.** Due classifiche dei giocatori a contratto (titolari e riserve della stagione corrente, talenti esclusi perché senza stipendio): posizione per **stipendio** e posizione per **PDK medio**. L'**affare** è chi rende molto più di quanto è pagato, il **flop** il contrario; la differenza tra le due posizioni è il voto. In pagina si legge così: «pagato da 41° · rende da 6°». È più intuitivo e più robusto del rapporto PDK/crediti, che premierebbe ogni contratto da 1 credito.
**Soglie di presentazione** (costanti commentate in `src/lib/value.ts`, da confermare con l'utente in fase di sviluppo): almeno 3 partite giocate per entrare in classifica; top 10 per lista; un infortunato resta in lista con il chip infortunio (è un flop vero, ma si vede perché).
**Logica.** `src/lib/value.ts`: `valueBoard(contracts, stats)` → `{ deals, flops }` con posizioni, delta e squadra. Pura, con test su pareggi di stipendio o PDK (posizione condivisa), soglia partite, stipendio mancante.
**Dati.** `loadLeague()` + `loadDunkest()`, già usati da `/giocatori`: zero query in più.
**UI.** Due colonne da `lg` (affari a sinistra con accento blu, flop a destra con accento rosso), una sotto l'altra su telefono. Riga giocatore come `PlayerRow` con stemma, `PdkCell` e una piccola barra a due tacche (posizione stipendio vs posizione PDK). La riga apre la `PlayerSheet` già esistente. Filtro a chip per squadra (stessi parametri del listone).
**Accettazione.** I primi 3 affari e flop coincidono con una verifica in SQL; un giocatore con 1 partita non compare; la vista si raggiunge e si condivide via URL.
**Sforzo:** il più piccolo dei quattro.

---

## 6.3 — Rivalità

**Dove.**
- Pagina squadra, sezione nuova «Rivalità»: una riga per ogni avversaria con bilancio V–N–P, punti fatti e subiti, ultimo risultato; in testa due badge, **Bestia nera** (l'avversaria contro cui hai perso di più) e **Vittima preferita** (quella che hai battuto di più).
- `/classifica`: sotto ogni scontro, anche da giocare, una riga «Precedenti: 2–1 per Bol Bollerz».

**Regole.** Contano solo le giornate `played` (stessa scelta di `teamForm`). Spareggio dei badge: più sconfitte (o vittorie), poi differenza punti; badge mostrati solo da 2 sfide in su con la stessa avversaria (con 100 giornate e 7 avversarie si arriva a ~14 sfide a testa). Solo la stagione corrente: quando ci saranno più stagioni su Dunkest si aggiunge un filtro.
**Logica.** `src/lib/rivalries.ts`: `headToHead(view, teamId)` → riga per avversaria; `rivalryBadges(rows)`; `meetings(view, a, b)` per i precedenti. Test su pareggi, giornata `latest` esclusa, nessuna sfida.
**Dati.** `loadLeagueDunkest()` ha già tutti gli scontri: zero query in più.
**UI.** Lista compatta con stemma e mini barra divisa nel colore delle due squadre (vittorie mie / loro); badge con `Badge`. Sulla mia pagina squadra il testo è in seconda persona («la tua bestia nera»), sulle altre in terza.
**Accettazione.** Bilanci uguali a una verifica in SQL sui dati veri; nessun badge con una sola sfida.
**Sforzo:** piccolo. Diventa interessante col passare delle giornate.

---

## 6.4 — Andamento in classifica

**Dove.** `/classifica`, sezione «Andamento» sotto la classifica (colonna sinistra da `lg`). Nella pagina squadra una mini-linea (sparkline) della posizione, accanto al badge di classifica.

**Ricostruzione.** Dagli scontri `played`, giornata per giornata: vittorie, pareggi, sconfitte e punti totali cumulati, ordinati come Dunkest (vittorie, poi punti totali; verificato sulla classifica di oggi). Il peso del **pareggio** non è noto (finora nessun pareggio): **ASSUNZIONE** da annotare in OPEN-QUESTIONS (proposta: un pareggio vale mezza vittoria). Controllo a runtime: se la ricostruzione dell'ultima giornata giocata non dà le stesse posizioni di `dunkest_standings`, la sezione lo dice invece di mostrare un grafico sbagliato.
**Logica.** `src/lib/standings-history.ts`: `standingsByMatchday(view)` → per giornata la posizione e i punti di ogni squadra; `matchesOfficial(history, standings)` per il controllo. Test: ricostruzione uguale alla classifica di oggi, pareggi, giornate senza punti.
**Grafico.** SVG scritto a mano, disegnato dal server (nessuna libreria): *bump chart* con una linea per squadra nel suo colore, posizione 1 in alto, stemma a fine linea. La mia squadra spessa e piena, le altre più tenui; tocca la legenda (link con `?evidenzia=<squadra>`) per evidenziarne un'altra, senza JavaScript. Interruttore a chip «Posizione / Punti totali» (`?andamento=punti`). Su telefono le ultime 12 giornate con scorrimento orizzontale dentro la carta (mai della pagina). Tabella `sr-only` con gli stessi dati per l'accessibilità. In fase di sviluppo seguire la skill `dataviz` per colori, assi ed etichette.
**Dati.** `loadLeagueDunkest()`: zero query in più.
**Accettazione.** L'ultima colonna del grafico coincide con la classifica ufficiale; leggibile a 390 px; chiaro e scuro.
**Sforzo:** piccolo-medio (il grafico è la parte lunga).

---

## Ordine di lavoro e PR

Le quattro novità sono indipendenti; 6.1, 6.3 e 6.4 toccano tutte `src/app/(lega)/classifica/page.tsx`, quindi conviene farle una dopo l'altra (o separare le sezioni in componenti prima). Ordine proposto, una PR per voce, branch da `origin/main` senza upstream:

1. `feat/premi-giornata` — 6.1 senza bacheca. Funziona già con le giornate 2, 3 e le prossime.
2. `feat/affari-flop` — 6.2. Tocca solo `/giocatori` e la pagina squadra: si può fare in parallelo alla 1.
3. `feat/rivalita` — 6.3.
4. `feat/andamento-classifica` — 6.4.
5. `feat/storico-formazioni` — 6.0 e bacheca dei premi. Unica con una migrazione: va applicata sul progetto reale dopo il merge.

Per ogni PR: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; verifica nel browser a 390 e 1280 px, chiaro e scuro. Con i dati veri la verifica la fa l'utente: il browser integrato non ha la sessione. A fine lavoro: caselle in [PLAN.md](../../PLAN.md), note nel [DESIGN_SYSTEM.md](../design/DESIGN_SYSTEM.md) per i componenti nuovi, assunzioni in [OPEN-QUESTIONS.md](../OPEN-QUESTIONS.md).

## Domande da chiudere durante lo sviluppo

1. **Pareggio in classifica Dunkest** (6.4): quanto vale rispetto a una vittoria? Finché non capita resta un'ASSUNZIONE con controllo a runtime.
2. **Punti del capitano** (6.1): i `pts` della formazione includono già il bonus del capitano? Cambia solo l'etichetta, non il calcolo.
3. **Soglie di 6.2** (partite minime, quante righe): valori proposti sopra, da confermare guardando i dati veri.
4. **Formazioni vecchie** (6.0): Dunkest le restituisce ancora per la giornata 1? Una `GET` lo dice.
