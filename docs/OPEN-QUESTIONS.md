# Domande aperte

Aggiornato 2026-10-21 dopo le risposte dell'utente.

## Ancora da chiarire
0. **Pick 2026 da confermare** (decisione: si importano con `to_confirm = true` e si correggono dopo): giro 1 di Gabby (→ Spaccinos, dedotto dal Foglio2), giro 1 di CC (Foglio1: Farmers, Foglio2: Spaccinos), giro 2 di Amedeo (`ChS`, destinatario sconosciuto, proprietario vuoto). Quando si sanno, correggere dall'admin (fase 3) o in `scripts/lib/overrides.ts`. *(non blocca)*
1. **Soglia di sicurezza** (R-57): è un valore numerico, ma non è ancora stato comunicato. *(fase 3, non blocca le fasi 1-2)*
2. **Admin e ruoli del regolamento**: Scuti e Gabby sono admin dell'app; presidente (Serde) e moderatore (Amedeo) restano ruoli del regolamento. Gli scambi vanno ufficializzati dal moderatore: l'app deve registrare chi li approva anche se non è admin? *(fase 3)*
3. **Quota di iscrizione**: importo (serve per il campo `QUOTA PAGATA`; nel foglio è solo un flag SI/NO, tutti NO). *(fase 3)*
4. **Dettagli dei rookie al bivio**: `25` e `26` sono l'anno di draft (Hansen 25, Dybantsa 26); restano ignoti `26?` (Sorber, Barnhizer), `(24)` (Hinson, Holmes II) e il 100 di Rogkavopoulos, che sembra un refuso. Resta da definire come mostrare la scadenza della prelazione. *(fase 3)*
5. **Contratto e taglio sullo stesso giocatore** (R-42): un giocatore tagliato che rientra in rosa può avere nella stessa stagione sia una riga in `contracts` sia una in `cuts`? Oggi non succede (0 casi), ma finché non è chiaro non c'è un vincolo di esclusività nel database (la migrazione 0003 vincola solo `contracts`). *(fase 3)*
6. **Durata dei contratti d'asta**: 17 ingaggi del foglio del 21/10 non hanno il prefisso degli anni (es. `Durant 35`, `Siakam 31`) perché gli anni **non sono ancora stati decisi** (confermato dall'utente, non è un'assunzione). L'import li scrive con `years_left = null` (mostrati come `?`); quando la lega decide, l'admin imposta la durata (fase 3) o si rilancia l'import sul foglio aggiornato. *(non blocca)*

## Assunzioni correnti
- Cap effettivo = 250 + bonus campionato (verificato sul foglio).
- `SPAZIO S. RISERVE` = 80 − stipendi riserve.
- Le 6 righe sotto la riga vuota di ogni squadra sono le riserve (righe 18-23, verificato su 8 squadre su 8).
- Il monte ingaggi include i tagli: `Σ titolari + Σ costo tagli`, con costo = 1/3 dello stipendio arrotondato allo 0.5 più vicino (5 → 1.5, 10 → 3.5). Verificato su 8 squadre su 8 prima e dopo l'asta.

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

Alias usati nel foglio: Farmers, Cosenza/CUS, Bollerz/BOL, Dame/DAME, Atlanto/ATLANTO, Spaccinos/SPACC, OKCC/Thunders (Foglio2), Spurs/ST. ANT (Foglio2 e ultimo contratto). `cckers` in Foglio3 = OKCC. Controllo sui dati: le scelte 2026 in "Squadra talenti" di ogni proprietario coincidono con l'ordine di `Foglio2` per tutte e 8 le squadre.

- Riga ULTIMO CONTRATTO `O.Toppin` → San Antonio (risolta 2026-10-21).

## ASSUNZIONI del simulatore di scambio (issue #13)
- **ASSUNZIONE** R-57: se una squadra è già sopra il cap, lo scambio è accettabile solo se non aumenta il suo monte ingaggi; altrimenti "non deve far sforare" = capienza ≥ 0 dopo lo scambio. Da confermare con il moderatore.
- **ASSUNZIONE**: un giocatore scambiato mantiene lo slot (titolare/riserva) che aveva; le riserve pesano sul budget riserve, non sul cap.
- **ASSUNZIONE**: la stagione di scadenza di un contratto è `stagione corrente + ceil(anni residui) - 1` (½ e 1 anno scadono a fine stagione corrente); la team option sposta la scadenza di una stagione.
