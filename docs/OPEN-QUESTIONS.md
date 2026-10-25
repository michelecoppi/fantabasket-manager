# Domande aperte

Aggiornato 2026-10-21 dopo le risposte dell'utente.

## Ancora da chiarire
0. **Pick 2026 da confermare** (decisione: si importano con `to_confirm = true` e si correggono dopo): giro 1 di Gabby (→ Spaccinos, dedotto dal Foglio2), giro 1 di CC (Foglio1: Farmers, Foglio2: Spaccinos), giro 2 di Amedeo (`ChS`, destinatario sconosciuto, proprietario vuoto). Quando si sanno, correggere dall'admin (fase 3) o in `scripts/lib/overrides.ts`. *(non blocca)*
1. **Soglia di sicurezza** (R-57): è un valore numerico, ma non è ancora stato comunicato. *(fase 3, non blocca le fasi 1-2)*
2. **Admin e ruoli del regolamento**: Scuti e Gabby sono admin dell'app; presidente (Serde) e moderatore (Amedeo) restano ruoli del regolamento. Gli scambi vanno ufficializzati dal moderatore: l'app deve registrare chi li approva anche se non è admin? *(fase 3)*
3. **Quota di iscrizione**: importo (serve per il campo `QUOTA PAGATA`; nel foglio è solo un flag SI/NO, tutti NO). *(fase 3)*
4. **Dettagli dei rookie al bivio**: `25` e `26` sono l'anno di draft (Hansen 25, Dybantsa 26); restano ignoti `26?` (Sorber, Barnhizer), `(24)` (Hinson, Holmes II) e il 100 di Rogkavopoulos, che sembra un refuso. Resta da definire come mostrare la scadenza della prelazione. *(fase 3)*
5. **Contratto e taglio sullo stesso giocatore** (R-42): un giocatore tagliato che rientra in rosa può avere nella stessa stagione sia una riga in `contracts` sia una in `cuts`? Oggi non succede (0 casi), ma finché non è chiaro non c'è un vincolo di esclusività nel database (`20261021214052_contracts_unique_player` vincola solo `contracts`). *(fase 3)*
6. **Durata dei contratti d'asta**: 17 ingaggi del foglio del 21/10 non hanno il prefisso degli anni (es. `Durant 35`, `Siakam 31`) perché gli anni **non sono ancora stati decisi** (confermato dall'utente, non è un'assunzione). L'import li scrive con `years_left = null` (mostrati come `?`); quando la lega decide, l'admin imposta la durata (fase 3) o si rilancia l'import sul foglio aggiornato. *(non blocca)*

7. **Classifica per il bonus e per la lottery** (R-60, R-32): è la stessa o ce ne sono due (regular season e finale dopo i playoff)? L'utente ha descritto la lottery (probabilità in base alla classifica, poi estrazione) ma non ha risposto; per ora l'app usa **una sola** classifica (`team_season.final_rank`). *(fase 3, non blocca)*
8. **Divisione della luxury tax** (R-12): come si dividono gli incassi tra le squadre sotto il cap («priorità ai primi in classifica»)? Per ora si fa a mano fuori dall'app, che calcola solo quanto deve ogni squadra. *(non blocca)*

## Assunzioni correnti
Cap effettivo, spazio riserve, righe delle riserve e monte ingaggi con i tagli (1/3 arrotondato a 0.5) sono verificati sul foglio su 8 squadre su 8, prima e dopo l'asta: formule e zone in [DATA-MODEL.md](DATA-MODEL.md), codice in `src/lib/cap.ts`.

## Risolte
| # | Domanda | Risposta |
|---|---|---|
| 1 | Regolamento ancora valido? | **Sì**, quello del 28/09/2024 |
| 2 | Proprietari ↔ squadre | vedi tabella sotto |
| 3 | Sigle contratto | `2 Murphy III`: il numero è la durata, "Murphy III" è il nome. `r` = **rookie** (contratto rookie, R-26), `u` = **unrestricted** (R-23/R-24); confermato dall'utente il 2026-10-21 (prima era annotato `r` = restricted). `u` compare anche dopo un pareggio (Okongwu); i restricted non-rookie (Vucevic, Beal…) non hanno sigla e si riconoscono da `Restricted` in Foglio3, quindi la sigla da sola non basta |
| 4 | `ULTIMO CONTRATTO` | Data in cui il giocatore ha avuto l'ultimo contratto con quella squadra (base per R-25, metà prezzo per 1 anno). Colonne: anno.mese, giocatore (con `u`/`r` e ruolo), ultimo stipendio (= `Cr 26/27` per chi è nel listone), ex-squadra; le coppie "nome prezzo" sono i restricted della squadra con il loro `Cr 26/27` |
| 5 | Riserve | Sì, sono le 6 righe sotto la riga vuota |
| 6 | Rookie al bivio / talenti | Il suffisso è l'anno di draft; la riga 89 è vuota (vedi domanda 4 sopra) |
| 7 | Classifica | **L'app registra la classifica finale** (bonus, lottery, luxury tax) |
| 9 | Date (deposito contratti, scambi riserve, aste) | Calendario gestito dall'admin |
| 10 | Quota iscrizione e budget sforato | **Da tracciare nell'app**. Nel foglio sono solo flag SI/NO; oggi DAMIANO è sforato (monte 260 su cap effettivo 249) |
| 11 | Admin | **Scuti e Gabby** |
| 12 | Dati Dunkest | Import del listone, per ora. `Restricted` = squadra ex-proprietaria che può pareggiare (`r` se ex-rookie); dopo l'asta non ne resta nessuno (Foglio3 = giocatori liberi, 370 dopo il 20/10). Un export a stagione (`Cr 26/27`); le prime ~360 righe del foglio sono celle con soli spazi |
| 13 | Arrotondamento del taglio | 1/3 dello stipendio arrotondato allo 0.5 più vicino (5 → 1.5, 10 → 3.5); il costo conta nel monte ingaggi |

### Mappa proprietari ↔ squadre
| Proprietario (foglio) | Squadra |
|---|---|
| AMEDEO | Assago Farmers |
| LUGIU | CUS Cosenza |
| GABBY | Bol Bollerz |
| DAMIANO | Dame Time |
| SCUTI | Atlanto Non Vinco |
| SERDE | Spaccinos |
| CC | OKCC |
| ENTONY (Antonio) | San Antonio |

Gli alias di squadra usati nel foglio sono in `ALIASES` di `scripts/lib/names.ts`. Controllo sui dati: le scelte 2026 in "Squadra talenti" di ogni proprietario coincidono con l'ordine di `Foglio2` per tutte e 8 le squadre.

- Riga ULTIMO CONTRATTO `O.Toppin` → San Antonio (risolta 2026-10-21).

## ASSUNZIONI del simulatore di scambio (issue #13)
- **ASSUNZIONE** R-57: se una squadra è già sopra il cap, lo scambio è accettabile solo se non aumenta il suo monte ingaggi; altrimenti "non deve far sforare" = capienza ≥ 0 dopo lo scambio. Da confermare con il moderatore.
- **ASSUNZIONE**: un giocatore scambiato mantiene lo slot (titolare/riserva) che aveva; le riserve pesano sul budget riserve, non sul cap.
- **ASSUNZIONE**: la stagione di scadenza di un contratto è `stagione corrente + ceil(anni residui) - 1` (½ e 1 anno scadono a fine stagione corrente); la team option sposta la scadenza di una stagione.

## ASSUNZIONI del pannello admin (issue #6)
- **ASSUNZIONE** R-33: il massimo di 2 pick per giro è contato per anno di draft (parametro `max_picks_per_round`); in uno scambio avvisa, non blocca.
- **ASSUNZIONE** R-20/R-22: durate ammesse = ½ e gli interi fino a `contract_max_years` (3); la team option solo su 1 o 2 anni. La durata può restare "da fissare" (R-51).
- **ASSUNZIONE** R-10: firmare un contratto che porta sopra il cap avvisa ma non blocca (nel foglio Dame Time è già sforato dopo l'asta). Gli scambi invece bloccano (R-57) salvo eccezione del moderatore con motivazione.
- **ASSUNZIONE** R-42: il taglio crea una riga `cuts` in stato `pending` (asta dei tagliati); la quota è 1/3 arrotondato a 0,5 (`cutShare`). Taglio definitivo e rientro sono implementati nel completamento admin (vedi sotto).
- Lo scambio registra "approvato da" come testo libero (domanda 2: il moderatore può non essere admin).

## ASSUNZIONI del completamento admin (migrazione `20261021222924_admin_completamento`)
- **ASSUNZIONE** R-41/R-42: se un tagliato viene preso da un'altra squadra all'asta dei tagliati, l'ex proprietario **non paga più la quota** (il regolamento prevede il 1/3 solo se nessuno lo prende). Da confermare.
- **ASSUNZIONE** R-42: finché il taglio è «in asta» (`pending`) la quota conta già nel monte ingaggi, come i tagli definitivi.
- **ASSUNZIONE** R-41: «ex proprietario non può partecipare» = non può essere la squadra che firma il giocatore tagliato in attesa.
- **ASSUNZIONE** R-01..R-03: i massimi di rosa (13 titolari, 5G/5A/3C, 6 riserve, 3 per ruolo) bloccano firma, modifica, rientro e scambi solo se l'operazione li fa superare; i minimi restano avvisi perché in estate la rosa può essere incompleta. Giocatori senza ruolo noto contano solo nei totali.
- **ASSUNZIONE** R-34: si possono aprire le pick dei prossimi `pick_horizon_years` draft (3) dopo la stagione corrente; `draft_rounds` = 5 (R-31).
- Un rientro dal taglio ricorda lo stipendio di partenza; i tagli importati dal foglio no, e lo stipendio si inserisce a mano.

## ASSUNZIONI della chiusura stagione (migrazione `20261023130000_chiusura_stagione`)
- **ASSUNZIONE** (domanda 7): una sola classifica per bonus e lottery. Se sono due, serve una colonna in più in `team_season`.
- **ASSUNZIONE** R-32: la lottery si estrae dal vivo fuori dall'app. L'admin inserisce l'ordine delle ultime `lottery_teams` (4) squadre; le altre vanno in ordine inverso di classifica (la 4ª della classifica sceglie 5ª, la 1ª sceglie 8ª), stesso ordine in tutti i giri. I pesi 4/3/2/1 non sono nell'app.
- **ASSUNZIONE** R-60: il bonus va al cap della stagione nuova (`team_season.bonus`) e si legge da `rank_bonus_1..8` in `league_settings`; la stagione nuova copia tutti i parametri di lega della vecchia.
- **ASSUNZIONE** R-22/R-23: la team option si decide nell'ultimo anno di contratto e l'admin la spunta in chiusura (di default non esercitata). Esercitata: un anno in più allo stesso stipendio, `restriction = unrestricted`. Non esercitata: scade restricted.
- **ASSUNZIONE** R-23/R-24/R-26: a fine contratto un giocatore è restricted salvo mezza stagione (0.5) o contratto già marcato `unrestricted` (secondo contratto dopo un pareggio); i contratti rookie scadono restricted. Con più di un anno residuo il contratto passa alla stagione nuova con un anno in meno.
- **ASSUNZIONE** R-23: il diritto di pareggio si registra in `last_contracts` (`restricted = true`, `team_id` = squadra con il diritto) e si mostra in `/giocatori` finché il giocatore non firma: l'app non sa quando l'asta finisce, quindi il segno non scade da solo.
- **ASSUNZIONE** R-42: la quota di un taglio continua a pesare finché dura il contratto (anni residui meno uno a ogni chiusura). La chiusura si blocca con tagli ancora in asta (`pending`), contratti senza durata, pick del draft mancanti o senza proprietario. Pick con proprietà «da confermare» e luxury tax non pagata avvisano soltanto.
- **ASSUNZIONE** R-12: la luxury tax non pagata alla chiusura non si traccia più in `/admin/quote`, che lavora sulla stagione corrente; l'importo per squadra resta nel registro (`audit_log.after.teams[].tax_eur`).
- **ASSUNZIONE** R-33: `rookie_draft` registra proprietario e squadra originale (`original_team_id`) alla chiusura; `/draft` legge il proprietario di adesso da `draft_picks`, quindi gli scambi di pick fatti dopo si vedono. Per i draft importati dal foglio (`original_team_id` null) vale la riga com'è.
- **ASSUNZIONE** R-24: di un giocatore conta l'ultima riga di `last_contracts`; se è unrestricted, il diritto di pareggio precedente non c'è più.
- La squadra talenti e i rookie draftati non si toccano in chiusura (domanda 4): l'ordine del draft si registra in `rookie_draft` ma la firma dei draftati resta da fare.
