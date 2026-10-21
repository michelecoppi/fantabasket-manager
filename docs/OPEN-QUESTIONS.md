# Domande aperte

Chiudere queste prima (o durante) la fase indicata. Aggiornare con la risposta e spostare in "Risolte".
Le risposte in "Risolte" sono dedotte dal foglio aggiornato del 21/10/2026 (dopo l'asta) e dal regolamento: dove non lo dice il regolamento sono assunzioni, da confermare con l'organizzatore.

## Da chiarire
1. **Validità del regolamento** — *(quasi chiusa)* Il testo è sempre quello del 28/09/2024 e il foglio lo applica: i bonus 2026 coincidono con R-60 e la colonna `Restricted` con R-23/R-26. Cap 250, budget riserve 80 e bonus tornano su tutte e 8 le squadre. Restano da confermare floor (200: nessuna squadra è sotto, quindi oggi non vincola) e tasso/uso della luxury tax. *(fase 0)*
6. **Suffissi nei talenti** — *(parziale)* `25` e `26` sono l'anno di draft. Restano da spiegare `26?` (Sorber, Barnhizer), `(24)` (Hinson, Holmes II) e il valore 100 di Rogkavopoulos (GABBY), che sembra un refuso. La riga 89 "ROOKIE DAVANTI A UN BIVIO" è vuota: serve solo sapere se nel DB è uno stato (`talent` a fine permanenza) o una vista. *(fase 1)*
8. **Soglia di sicurezza** (R-57) — valore numerico? Non compare in nessun file. *(fase 3)*
9. **Date** — *(parziale)* Le fissa il moderatore: l'asta pre-stagione è stata il 20/10/2026 (R-50) e la data del prossimo scambio titolari↔riserve va chiesta a lui. Manca la data di deposito contratti. Confermare che l'admin le gestisce come calendario libero. *(fase 3)*
10. **Quota di iscrizione e luxury tax** — Nel foglio `QUOTA PAGATA` è un flag SI/NO (tutti NO) e `BUDGET SFORATO` un SI/NO calcolato: non ci sono importi in euro. Oggi DAMIANO è sopra il cap (monte 260 su cap effettivo 249, spazio −11). Serve: importo della quota e se la tassa va tracciata nell'app. *(fase 3)*

## Assunzioni correnti
- Cap effettivo = 250 + bonus campionato (verificato aritmeticamente su tutte e 8 le squadre del foglio, anche dopo l'asta).
- `SPAZIO S. RISERVE` = 80 − stipendi riserve (verificato su 8 squadre su 8).
- Mappa proprietari ↔ squadre (vedi Risolte #2): dedotta dai dati del foglio, non scritta da nessuna parte.

## Risolte
2. **Mappa proprietari ↔ squadre** — dedotta: le scelte 2026 in "Squadra talenti" di ogni proprietario coincidono con l'ordine di `Foglio2` (tornano tutti i casi).

   | Proprietario | Squadra | Altri nomi nel foglio |
   |---|---|---|
   | LUGIU | Cosenza | CUS |
   | AMEDEO | Farmers | |
   | DAMIANO | Dame | |
   | ENTONY | Spurs | ST. ANT |
   | SCUTI | Atlanto | |
   | SERDE | Spaccinos | SPACC |
   | GABBY | Bollerz | BOL |
   | CC | Thunders | OKCC, cckers (Foglio3) |

3. **Sigle nei nomi contratto** — il numero sono le stagioni di contratto; `+1` = team option; `r` = contratto rookie (a fine contratto restricted, R-26); `u` = alla scadenza sarà unrestricted (R-23/R-24). Compare anche sui contratti firmati dopo un pareggio (Okongwu, tornato a Spaccinos). Attenzione: la sigla non basta per dedurre lo stato. Tra gli ex-contratti i 12 con `u` non sono mai restricted, ma 2 senza `u` e non rookie neanche lo sono (P.George, mezza stagione 2026.02; Fultz). Nel DB serve il campo esplicito, vedi `restricted_rights`.
4. **Foglio `ULTIMO CONTRATTO`** — colonne: anno.mese di scadenza (2026.02, 2026.09), giocatore con `u`/`r` e ruolo tra parentesi, ultimo stipendio, ex-squadra. Lo stipendio coincide con `Cr 26/27` per tutti i presenti nel listone. Le coppie "nome prezzo" a destra sono i restricted della squadra con il loro `Cr 26/27` (Durant 35, Siakam 31.5, Poole 20, Lopez 7.5, Vassell 6, Williams 4, Phillips 2: coincidono tutti). Che la data sia l'inizio dell'anno di R-25 è coerente ma non verificabile.
5. **Riserve nel foglio** — confermato: righe 18-23 (6 slot). `SPAZIO S. RISERVE = 80 − Σ righe 18-23`.
7. **Classifica e punteggi** — il foglio non contiene classifiche: il `BONUS CAMPIONATO` è digitato a mano, senza formula. L'admin inserisce la classifica finale a fine stagione e da lì si ricavano bonus (R-60) e lottery (R-32). I punteggi settimanali restano su Dunkest. Classifica 2025-26 ricavata dai bonus: GABBY, CC, SCUTI, SERDE, ENTONY, DAMIANO, AMEDEO, LUGIU.
11. **Chi è admin** — il regolamento affida gestione e regole a Serde (presidente) e Amedeo (moderatore), e gli scambi li ufficializza il moderatore. Che gli altri 6 siano viewer è una scelta di progetto.
12. **Dati Dunkest (`Foglio3`)** — `Restricted` = squadra ex-proprietaria che può pareggiare l'offerta (con `r` se ex-rookie). Sono i giocatori ancora liberi: prima dell'asta 24 restricted su 443, dopo l'asta 370 giocatori e nessun restricted, quindi il diritto vale solo per l'asta. I crediti hanno la stagione nel nome (`Cr 26/27`): un export a stagione. Le prime ~360 righe del foglio sono celle con soli spazi: l'import le scarta.
13. **Arrotondamento del taglio** (emersa dal foglio) — costo = 1/3 dello stipendio arrotondato allo 0.5 più vicino: 5 → 1.5, 4.5 → 1.5, 10 → 3.5, 27 → 9. Il costo è già diviso nella colonna prezzo e **conta nel monte ingaggi**: `monte = Σ titolari + Σ costo tagli`, verificato su 8 squadre su 8.
