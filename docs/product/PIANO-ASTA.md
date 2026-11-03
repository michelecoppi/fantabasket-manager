# Piano: l'asta nell'app (issue #104)

Stato al 2026-11-03: **playground** in `/asta` (sala d'asta in locale con avversari simulati, niente si salva) da far provare alla lega. L'asta vera in tempo reale si costruisce dopo, sulle risposte degli admin e dei proprietari.

## Cosa ha deciso l'utente (2026-11-02)

- **Asta di riparazione**: data da stabilire (l'anno scorso circa alla pausa dell'All-Star Game). Partecipano tutti, 8-9 persone collegate insieme. All'asta tutti i giocatori senza contratto. Base d'asta **metà del valore Dunkest**, come all'asta di inizio stagione. Limiti di cap e di rosa: i soliti.
- **Svolgimento**: a turno uno propone (chiama) un giocatore; **rilancio minimo 0,5**; in asta sta chiunque voglia partecipare; il tempo per rilanciare lo propone lo sviluppo (non troppo lungo, non troppo corto).
- **Chiusura**: la decide un admin («l'asta è finita»).
- **Durata dei contratti**: di solito si sceglie dopo (R-51), come oggi (`years_left = null`, «da fissare»).
- **Tagliati e restricted**: proposta dello sviluppo, decidono gli admin (sotto).
- **Tempo reale**: verificare che Supabase Realtime gratuito regga 9 persone insieme (fatto, sotto).

## Regole del playground (proposte)

Logica pura e testata in `src/lib/auction.ts` (lotto, limiti di spesa, turni), `auction-room.ts` (la sala come reducer), `auction-playground.ts` (scenari), `auction-bots.ts` (avversari simulati, solo per il playground).

| Regola | Proposta | Dove |
|---|---|---|
| Base d'asta | metà dei crediti Dunkest, **per eccesso al mezzo credito** (7,5 → 3,75 → 4), almeno 0,5. Un ex-contratto non parte mai sotto il minimo R-25 (metà dell'ultimo stipendio, anche lui al mezzo credito) | `auctionBase` |
| Chiamata | a turno, ordine **sorteggiato** all'inizio; chi chiama apre alla base o più su; chi non ha posto o non vuole **passa**. Se passano tutti di fila la sala è ferma e chiude l'admin | `nextCaller`, `roomReducer` |
| Rilancio | almeno +0,5 sull'offerta in testa (R-51: il pareggio non vince); si può saltare. Le offerte restano sul mezzo credito | `bidErrors` |
| Cronometro | **15″** dopo la chiamata, poi ogni rilancio lo riporta a **10″** (se ne restavano di più resta com'era). «E uno, e due, e tre» negli ultimi tre secondi. Nel playground si prova anche «Calmo» 20/15 e «Veloce» 10/6 | `PROPOSED_RULES`, `placeBid` |
| Quanto si può offrire | titolare: spazio salariale **più la zona della luxury tax fino al massimo tassabile** (R-12, 270 con cap 250); riserva: budget riserve rimasto (R-03). Contano i massimi di rosa (R-01..R-03) | `bidLimit` |
| Dove entra chi vince | titolare se ci sta nel cap, altrimenti riserva se ci sta nel budget riserve, altrimenti titolare in luxury tax. Da confermare: forse lo sceglie il vincitore insieme alla durata | `landingSlot` |
| Admin | pausa (alla ripresa almeno 3″), annulla l'ultima offerta (ridà 10″), aggiudica subito, chiudi l'asta (un lotto aperto va a chi è in testa) | `pauseLot`, `undoLastBid`, `closeNow`, azione `end` |

Perché 15″/10″: un lotto conteso ha 5-15 rilanci, con 2-4″ di reazione a persona fa circa un minuto; con 30-40 lotti l'asta di riparazione dura 40-60 minuti. Sotto i 10″ chi è al telefono con la rete lenta perde lotti; sopra i 15″ il ritmo cala. Sui giocatori cari, a mezzo credito per volta, i rilanci sono tanti: il playground serve anche a capire se la lega vuole un rilancio minimo più alto sopra una certa cifra.

## Proposta per tagliati e restricted (da decidere tra gli admin)

**Tagliati** (R-40..R-42, R-50):
- Aprono la sala, prima dei free agent, uno dopo l'altro e **chiamati dall'app** (nessun turno consumato).
- Base: metà del valore, mai sotto metà dell'ultimo stipendio (R-25).
- L'ex proprietario non offre (R-41).
- Nessuna offerta entro i 15″: l'ex proprietario sceglie **taglio definitivo** (1/3 dello stipendio, R-42) o **rientro**, come oggi in `/admin/rose`.
- Chi lo prende firma un contratto nuovo e l'ex proprietario non paga più la quota (ASSUNZIONE già in OPEN-QUESTIONS, R-41/R-42).

**Restricted** (R-23, R-24):
- Si chiamano come gli altri, da chiunque, anche da chi ha il diritto.
- Chi ha il diritto **non rilancia**: allo scadere ha **15″ per pareggiare** l'offerta più alta, senza replica; se lascia, il giocatore va a chi era in testa.
- Se nessuno offre, chi ha il diritto può tenerlo **alla base**.
- Senza spazio per pareggiare, il diritto salta.
- Il contratto che ne esce è unrestricted e il diritto si consuma (R-24, trigger `contracts_consume_right` già in produzione).

## Supabase Realtime regge? Sì (prova del 2026-11-03)

Prova sul progetto reale con la chiave anon, solo messaggi Broadcast su un canale temporaneo (nessuna scrittura nel database): 9 client nello stesso canale, ognuno rilancia ogni 1-4″ per 45″, poi 5 raffiche con tutti e 9 nello stesso istante.

| Misura | Risultato |
|---|---|
| Ingresso dei 9 client | 2,6″ in tutto, tutti `SUBSCRIBED` |
| Rilanci inviati / consegne | 218 / 1962 su 1962 attese, **nessun messaggio perso** |
| Latenza di consegna (normale) | mediana 45 ms, 95% entro 53 ms, massimo 236 ms |
| Latenza nelle raffiche | mediana 48 ms, 95% entro 55 ms |
| Messaggi contati | ~2.200 in un minuto di asta accesissima |

Limiti del piano gratuito ([docs Supabase](https://supabase.com/docs/guides/realtime/limits)): 200 connessioni contemporanee, 100 messaggi al secondo, 2 milioni di messaggi al mese, 100 ingressi in canale al secondo, payload Broadcast 256 KB. Un'asta vera di 9 persone fa al massimo 20-30 messaggi al secondo nei picchi e qualche decina di migliaia in tutto: margine ampio. La prova è partita da un PC in Italia su rete fissa; dai telefoni in 4G la latenza sarà più alta (decine o qualche centinaio di ms), comunque piccola rispetto ai 10″ del cronometro.

## Come sarà l'asta vera (prossimo passo, da progettare)

- **Il database decide**: tabelle `auctions` (stato, regole, ordine, chi chiama), `auction_lots` (giocatore, tipo, base, scadenza, versione), `auction_bids`. Nuove chiavi in `league_settings` per base, rilancio e tempi (oggi `PROPOSED_RULES`).
- **Offerte dei proprietari**: RPC `auction_bid(lot, amount)` con `my_team_id()` (nuova eccezione alla sola lettura dei viewer, come le `trade_*`), che controlla tempo (`now()` del server), minimo, esclusioni e spazio con la stessa logica di `auction.ts`, e allunga la scadenza. La concorrenza la risolve la riga del lotto (`for update`): di due rilanci uguali nello stesso istante passa il primo, l'altro riceve «il pareggio non vince».
- **Tempo reale**: le pagine ascoltano il lotto (Broadcast dal database o Postgres Changes); il cronometro si disegna sul telefono con lo scarto dall'ora del server. Niente cron al secondo: il lotto si chiude quando qualcuno (client o admin) chiama `auction_settle`, che controlla `now() >= deadline` ed è idempotente.
- **Aggiudicazione**: crea il contratto con durata da fissare (come `admin_sign_contract`), scrive `audit_log`; tagliati e restricted come sopra.
- **Riconnessione**: chi perde la rete rientra e rilegge lo stato dal database; nessuna offerta passa solo dal canale.
- Test RLS per tabelle e RPC nuove, `concurrency.sh` per i rilanci simultanei.

## Domande per la lega (dopo la prova)

1. Il ritmo 15″/10″ va bene, o meglio «Calmo» o «Veloce»?
2. Rilancio minimo sempre 0,5, anche sui giocatori da 30 crediti in su?
3. All'asta si può andare in luxury tax (fino a 270) o ci si ferma allo spazio salariale?
4. Lo slot (titolare o riserva) lo sceglie chi vince, o va da sé come nel playground?
5. Proposta tagliati e restricted: va bene così?
6. L'ordine di chiamata: sorteggiato, inverso della classifica come il draft, o altro?
7. Serve un tempo massimo per chiamare (es. 30″, poi si passa il turno)?
