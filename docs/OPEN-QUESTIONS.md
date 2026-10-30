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
9. ~~**Riserve schierate su Dunkest**~~ → risolta il 2026-10-27, vedi «Lega su Dunkest» in fondo.

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
| SERDE | Chicago Spaccinos |
| CC | OKCC |
| ENTONY (Antonio) | San Antonio Spurs |

Gli alias di squadra usati nel foglio sono in `ALIASES` di `scripts/lib/names.ts`. Controllo sui dati: le scelte 2026 in "Squadra talenti" di ogni proprietario coincidono con l'ordine di `Foglio2` per tutte e 8 le squadre.

- Riga ULTIMO CONTRATTO `O.Toppin` → San Antonio (risolta 2026-10-21).

## ASSUNZIONI del simulatore di scambio (issue #13)
- **ASSUNZIONE** R-57: se una squadra è già sopra il cap, lo scambio è accettabile solo se non aumenta il suo monte ingaggi; altrimenti "non deve far sforare" = capienza ≥ 0 dopo lo scambio. Da confermare con il moderatore.
- **ASSUNZIONE**: di default un giocatore scambiato mantiene lo slot (titolare/riserva) che aveva, ma lo scambio può indicare per ciascuno se arriva come titolare o riserva (proposta di un utente, 2026-10-28: altrimenti dare un titolare per una riserva sposta il peso dal cap al budget riserve senza poterlo sistemare). Cap e massimi di rosa si valutano sullo slot di arrivo; le riserve pesano sul budget riserve, non sul cap. **Da chiedere alla lega**: R-04 prevede lo scambio titolare↔riserva solo a date prestabilite, quindi scegliere lo slot in uno scambio lo aggira? Ogni scambio va rifatto anche su Dunkest.
- **Decisione dell'utente (2026-10-28)**: gli scambi possono coinvolgere più di due squadre (il regolamento parla solo di accordi tra proprietari, R-55/R-56). Ogni giocatore o pick ceduto va a una squadra precisa; ogni squadra deve cedere o ricevere qualcosa. Massimo **4 squadre** (parametro `trade_max_teams`, modificabile): in NBA gli scambi a 3 sono comuni, a 4 rari, il record è 7 (Durant, 2025) e prima 6 (Klay Thompson, 2024), ma sono accordi "gonfiati" per far quadrare gli stipendi; in una lega da 8, 4 squadre sono già metà lega. **Da confermare con la lega** il numero massimo. Cap, massimi di rosa e limite di pick valgono per ogni squadra, su ciò che riceve davvero.
- **ASSUNZIONE**: la stagione di scadenza di un contratto è `stagione corrente + ceil(anni residui) - 1` (½ e 1 anno scadono a fine stagione corrente); la team option sposta la scadenza di una stagione.

## ASSUNZIONI del pannello admin (issue #6)
- **ASSUNZIONE** R-33: il massimo di 2 pick per giro è contato per anno di draft (parametro `max_picks_per_round`); in uno scambio avvisa, non blocca.
- **ASSUNZIONE** R-20/R-22: durate ammesse = ½ e gli interi fino a `contract_max_years` (3); la team option solo su 1 o 2 anni. La durata può restare "da fissare" (R-51).
- R-26: i contratti rookie durano al massimo `rookie_max_years` (2) stagioni, team option compresa (2+1 non ammesso, 1+1 sì).
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
- R-24 (confermato dall'utente il 2026-10-26): di un giocatore conta l'ultima riga di `last_contracts`. Alla prima firma successiva con un diritto restricted aperto — **qualunque squadra**, firma normale o asta dei tagliati — il contratto è **unrestricted** e il diritto si consuma (`restricted = false`, `consumed_by_contract_id`), nella stessa transazione (trigger). Nessun evento «fine asta»: senza firma il diritto resta visibile come prima. Se un contratto firmato per errore viene rimosso, il diritto non torna (va ripristinato a mano).
- **ASSUNZIONE** R-25 (da confermare): il minimo d'asta è metà dell'ultimo stipendio (`last_contract_min_fraction` 0.5) e vale 12 mesi (`last_contract_valid_months`) dalla data in `last_contracts`, anniversario escluso (il minimo cade il giorno dell'anniversario). Gli stipendi hanno al massimo un decimale, quindi i quarti di credito (metà di 5.5 = 2.75) si arrotondano **per eccesso** (offerta minima 2.8). Se la lega arrotonda allo 0.5 o conta "1 anno" in altro modo (stagione sportiva, 365 giorni), basta cambiare i parametri o `auctionFloor`. Vale per ogni ex-contratto, non solo con la squadra che firma, e per firma normale e asta dei tagliati. Il listone (`/giocatori`) non lo mostra ancora: i dati sono in `PlayerListItem.lastContract`.
- La squadra talenti e i rookie draftati non si toccano in chiusura (domanda 4): l'ordine del draft si registra in `rookie_draft` ma la firma dei draftati resta da fare.

## Planner del cap (issue #46, P3-03)
Scenari solo in pagina (`/scadenze?vista=planner`): niente si salva, nessuna regola nuova. Logica in `src/lib/cap-planner.ts`; ogni valore è etichettato come **nominale** (scritto nel contratto), **calcolato** (regole e `league_settings`) o **ipotesi** (scelta dell'utente nella pagina).
- **ASSUNZIONE**: il cap delle stagioni future è il `cap` della stagione corrente, come la chiusura che copia i parametri (R-60 sopra). Il bonus di classifica non si conosce: si mostra la forbice da `min(rank_bonus_*)` a `max(rank_bonus_*)`; il piazzamento ipotetico applica lo stesso posto a ogni stagione futura.
- **ASSUNZIONE** R-22/R-23: in uno scenario l'option esercitata vale un anno in più allo stesso stipendio e il giocatore esce unrestricted (come in chiusura); non esercitata, esce come in chiusura (`expiresRestricted`).
- **ASSUNZIONE** R-42: la quota di un taglio pesa finché dura il contratto (`years_left` del taglio); quella di un taglio senza durata pesa sulla stagione corrente e dopo è "da fissare". Un taglio in asta «preso da un'altra squadra» (assunzione R-41/R-42 sopra) sparisce dalla stagione successiva; la stagione corrente resta quella di oggi.
- Contratti senza durata: pesano oggi, nelle stagioni future sono mostrati a parte («da fissare») e restano fuori dal totale. Riserve: restano riserve. Firme, aste, scambi, pareggi dei restricted e squadra talenti non entrano negli scenari.
- **Da validare con la lega** (criterio della issue): se i totali di `/scadenze` e il planner servono davvero per l'asta, e se il piazzamento ipotetico uguale ogni anno è utile o va tolto.

## Lega su Dunkest (issue #72)
Classifica, calendario e formazioni dall'app della lega; nessuna regola nuova. Logica in `src/lib/dunkest-league.ts`.
- **ASSUNZIONE**: una formazione Dunkest che non torna con le rose dell'app (riserva schierata, giocatore di un'altra squadra o in nessuna rosa, non collegato) è un **avviso**, mai un errore e mai una correzione automatica: le rose su Dunkest le aggiornano i proprietari a mano. Il confronto usa le rose di adesso, non quelle del giorno della giornata. Vedi domanda 9.
- **Decisione dell'utente (2026-10-27)**: chi è nella rosa Dunkest di una squadra (13 giocatori: quintetto, panchina, tribuna) è un **titolare** nell'app; gli altri contratti sono riserve. Il 27/10 non tornavano 5 squadre su 8 (Spaccinos 4 scambi, Bol Bollerz 3, Assago Farmers, OKCC e San Antonio 2), tutti ruolo per ruolo. L'app non cambia da sola: `/admin/dunkest` propone lo scambio con l'effetto su cap e riserve e un admin conferma («Allinea» / «Allinea tutte», RPC `admin_swap_slots` con `audit_log`). Se dopo l'allineamento il cap o il budget riserve sforano, l'app avvisa e allinea lo stesso (decisione dell'utente). Bloccano invece, come nelle altre operazioni admin, i giocatori Dunkest non collegati o di un'altra squadra nell'app, una rosa Dunkest di dimensione diversa dai titolari previsti e i massimi per ruolo (R-01..R-03).
- «Tribuna» = in rosa su Dunkest e non schierati nello scontro (rosa letta da `fantasy-leagues/<lega>/fantasy-teams/<squadra>`); se la rosa non c'è, i titolari dell'app non schierati.
- **ASSUNZIONE**: l'ultima giornata con punti non si dichiara chiusa (Dunkest non lo dice): la pagina scrive «in testa» e non «vince», e la forma (V/P) conta solo le giornate prima.
- La classifica Dunkest **non** scrive `team_season.final_rank` (bonus R-60, lottery R-32): resta da decidere quale classifica conta (domanda 7) e se quella di Dunkest è la classifica ufficiale.

## Fase 6: la lega che si racconta
Novità di sola lettura sui dati Dunkest (piano in [product/PIANO-FASE-6.md](product/PIANO-FASE-6.md)); nessuna regola di lega, le soglie sono costanti di presentazione nei moduli.
- **ASSUNZIONE** (6.4, `src/lib/standings-history.ts`): nella classifica Dunkest un **pareggio vale mezza vittoria** (`DRAW_WEIGHT`); a pari vittorie decidono i punti totali (verificato sulla classifica del 2026-10-29, senza pareggi). Se Dunkest li conta diversamente, il controllo `checkOfficial` vede che la ricostruzione non torna con la classifica ufficiale e `/classifica` nasconde il grafico invece di mostrarlo sbagliato.
- **Chiusa** (6.1, 2026-10-30): i `pts` in formazione sono **grezzi**, senza il bonus del capitano. Verificato sul database vero (4 giornate, 32 formazioni): punteggio dello scontro = quintetto + sesto uomo + 1,5 × capitano + 0,5 × resto della panchina, al centesimo. L'app salva i punti grezzi e applica il ×1,5 del capitano in lettura (`countedPts` in `src/lib/dunkest-league.ts`; Dunkest scrive il moltiplicatore su ogni giocatore, `captain_multiplier`). **ASSUNZIONE**: il moltiplicatore è la costante 1,5; se Dunkest lo cambiasse il test sulla fixture e il controllo sul database non tornerebbero più.
- **Decisione dell'utente** (6.1, 2026-10-30): la panchina non titolare (sesto uomo escluso) conta la **metà** (stessa verifica), e l'app mostra i punti già dimezzati (`BENCH_WEIGHT`), così la somma dei 10 schierati torna col punteggio di squadra. Il valore non è scritto nella risposta di Dunkest: **ASSUNZIONE** dedotta dai dati.
- **Da confermare** (6.2, `src/lib/value.ts`): soglie di «Affari e flop» = almeno 3 partite giocate (`VALUE_MIN_GAMES`) e 10 righe per lista (`VALUE_LIST_SIZE`). Il 2026-10-29 entrano 125 giocatori a contratto (titolari e riserve).
- **ASSUNZIONE** (cambi di rosa): un giocatore schierato in una giornata che oggi non è più nella rosa Dunkest della sua squadra è stato sostituito dopo quella giornata, quindi non è un avviso («Sostituito dopo»). Se un proprietario schierasse una riserva e poi la togliesse dalla rosa Dunkest, l'avviso di quella giornata sparirebbe: il registro dei cambi (`dunkest_roster_moves`) resta come traccia.
- I premi di una giornata senza formazioni salvate (la 1) sono solo quelli di squadra e di scontro; la bacheca stagionale aspetta lo storico completo delle formazioni (6.0).

## Proposte di scambio (Fase 7)
Piano in [product/PIANO-PROPOSTE-SCAMBIO.md](product/PIANO-PROPOSTE-SCAMBIO.md). Non sono regole del regolamento ma funzionamento dell'app.
- **Decisione dell'utente (2026-10-29)**: il mercato degli scambi lo apre e chiude un admin dall'interfaccia; il regolamento non fissa finestre (R-55 dice solo «dopo l'asta estiva»). Se la lega fissa date, si aggiungono allora. Una proposta dura al massimo un giorno (`trade_proposal_hours` = 24). Può approvare qualunque admin, anche se la sua squadra è nello scambio.
- **ASSUNZIONE**: le 24 ore valgono per le risposte delle squadre; una proposta accettata da tutte resta in coda all'admin senza scadenza.
- **ASSUNZIONE**: chiudere il mercato ritira le proposte non ancora approvate; gli admin possono sempre eseguire uno scambio da `/admin/scambio` (R-55: il moderatore ufficializza).
- **ASSUNZIONE**: se una squadra ha più profili, risponde per la squadra il primo che accetta o rifiuta.
- **Decisione dell'utente (2026-10-29)**: sul canale Telegram vanno solo gli scambi eseguiti, con frasi divertenti che prendono in giro chi scambia; le proposte restano private.
- **ASSUNZIONE**: l'annuncio parte subito dopo l'esecuzione (il cron giornaliero riprova quelli falliti); gli scambi più vecchi di 72 ore e quelli registrati prima del bot non si annunciano.

## Scambio dei talenti (7.6)
Piano in [product/PIANO-SCAMBIO-TALENTI.md](product/PIANO-SCAMBIO-TALENTI.md). R-56 ammette i talenti negli scambi ma non dice come; **decisioni dell'utente del 2026-10-30**:
- R-35: il talento scambiato conserva anno di draft e valore d'ingresso, quindi la scadenza della prelazione (che l'app non gestisce ancora, domanda 4). Si scambia solo il proprietario (`talents.team_id`).
- Nessun massimo di talenti per squadra (il regolamento non lo fissa). Se la lega lo vuole, diventa un parametro di `league_settings`.
- Un talento non ha stipendio: non pesa su cap (R-57), budget riserve, massimi di rosa (R-01..R-03) né sul limite di pick (R-33).
- Uno scambio senza contratti (solo talenti e/o pick) non va rifatto su Dunkest, dove ci sono solo i titolari.
- L'import dal foglio non deve annullare gli scambi di talenti fatti nell'app: si ferma se un talento ha nel database una squadra diversa da quella del foglio (salvo `--force`).
- **ASSUNZIONE** (Fase 8): la «giornata» dei leader NBA è la settimana Dunkest (`weeks[]`, «M4») con lo stesso numero della giornata della lega. Verificata il 2026-10-30 sulle giornate 1-4; se Dunkest o la lega numerassero diversamente (giornate saltate, stagione nuova) i leader della giornata andrebbero ricollegati.
