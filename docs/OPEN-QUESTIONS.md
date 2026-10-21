# Domande aperte

Aggiornato 2026-10-21 dopo le risposte dell'utente.

## Ancora da chiarire
0. **Pick 2026 da confermare** (decisione: si importano con `to_confirm = true` e si correggono dopo): giro 1 di Gabby (→ Spaccinos, dedotto dal Foglio2), giro 1 di CC (Foglio1: Farmers, Foglio2: Spaccinos), giro 2 di Amedeo (`ChS`, destinatario sconosciuto, proprietario vuoto). Quando si sanno, correggere dall'admin (fase 3) o in `scripts/lib/overrides.ts`. *(non blocca)*
1. **Soglia di sicurezza** (R-57): è un valore numerico, ma non è ancora stato comunicato. *(fase 3, non blocca le fasi 1-2)*
2. **Foglio3**: è la lista dei **free agent** (anche allenatori) e non contiene i giocatori in rosa. La colonna `Restricted` contiene la squadra con diritto di pareggio (es. Durant → Farmers). Conferma? Per i giocatori in rosa servirebbe un export Dunkest completo per avere nome intero, squadra NBA e ruolo. *(fase 1)*
3. **Admin e ruoli del regolamento**: Scuti e Gabby sono admin dell'app; presidente (Serde) e moderatore (Amedeo) restano ruoli del regolamento. Gli scambi vanno ufficializzati dal moderatore: l'app deve registrare chi li approva anche se non è admin? *(fase 3)*
4. **Quota di iscrizione**: importo (serve per il campo `QUOTA PAGATA`). *(fase 3)*
5. **Dettagli dei rookie al bivio**: il significato del suffisso anno (`25`, `26?`) è confermato come anno di draft/esordio; resta da definire come mostrare la scadenza della prelazione. *(fase 3)*

## Assunzioni correnti
- Cap effettivo = 250 + bonus campionato (verificato sul foglio).
- `SPAZIO S. RISERVE` = 80 − stipendi riserve.
- Le 6 righe sotto la riga vuota di ogni squadra sono le riserve.

## Risolte
| # | Domanda | Risposta |
|---|---|---|
| 1 | Regolamento ancora valido? | **Sì**, quello del 28/09/2024 |
| 2 | Proprietari ↔ squadre | vedi tabella sotto |
| 3 | Sigle contratto | `2 Murphy III`: il numero è la durata, "Murphy III" è il nome. `r` = **restricted**, `u` = **unrestricted** (stato alla scadenza, R-23/R-24) |
| 4 | `ULTIMO CONTRATTO` | Data in cui il giocatore ha avuto l'ultimo contratto con quella squadra (base per R-25, metà prezzo per 1 anno) |
| 5 | Riserve | Sì, sono le 6 righe sotto la riga vuota |
| 6 | Rookie al bivio / talenti | Confermato (anno di draft/esordio) |
| 7 | Classifica | **L'app registra la classifica finale** (bonus, lottery, luxury tax) |
| 9 | Date (deposito contratti, scambi riserve, aste) | Calendario gestito dall'admin |
| 10 | Quota iscrizione e budget sforato | **Da tracciare nell'app** |
| 11 | Admin | **Scuti e Gabby** |
| 12 | Dati Dunkest | Import del listone, per ora |

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

Alias usati nel foglio: Farmers, Cosenza/CUS, Bollerz/BOL, Dame/DAME, Atlanto/ATLANTO, Spaccinos/SPACC, OKCC/Thunders (Foglio2), Spurs/ST. ANT (Foglio2 e ultimo contratto). `cckers` in Foglio3 = OKCC.

- Riga ULTIMO CONTRATTO `O.Toppin` → San Antonio (risolta 2026-10-21).
