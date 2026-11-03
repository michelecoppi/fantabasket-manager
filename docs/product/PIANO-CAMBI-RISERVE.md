# Piano: richieste di cambio titolari ↔ riserve

Un proprietario chiede dall'app di spostare giocatori tra titolari e riserve della **sua** squadra (R-04); un admin fa il cambio su Dunkest, poi lo approva nell'app, che aggiorna la rosa e lo annuncia col bot. Oggi lo stesso cambio passa solo da Dunkest e da «Allinea» in `/admin/dunkest`. Proposta di un utente della lega, decisioni dell'utente del 2026-11-03.

## Decisioni dell'utente (2026-11-03)
- **Chi chiede:** solo il proprietario, dalla pagina della propria squadra (`/squadre/[id]`, controllo con `my_team_id()`). Sulle altre squadre il pannello non c'è. Può muovere più giocatori in una richiesta.
- **Avviso agli admin:** il **badge** in app sulla voce «Admin» (come le proposte di scambio da approvare) e, dal 2026-11-03, un messaggio privato del bot agli admin di `TELEGRAM_ADMIN_ALERT` (id separati da virgola; ognuno deve aver premuto Avvia sul bot).
- **Quando (R-04, «una volta ogni due settimane in data prestabilita»):** una **finestra aperta da un admin** con un interruttore «Cambi titolari/riserve aperti/chiusi», come quello del mercato. A finestra chiusa non si inviano richieste; chiuderla ritira quelle in attesa.
- **Budget riserve (R-03, 80):** se dopo il cambio le riserve lo superano, la richiesta **è bloccata** (R-04: «solo se fattibile in crediti»).
- **Cap dei titolari (R-10/R-12):** sopra il cap effettivo (cap + bonus) l'app mostra un **alert** ma lascia inviare; sopra il cap effettivo più il massimo tassabile (`taxMaxOver`, oggi 20: 270 con cap 250) **blocca**. Valori da `league_settings`.
- **Bot:** il messaggio sul canale della lega parte quando l'admin approva (dopo aver fatto il cambio su Dunkest).

## Regole (in `src/lib/cap.ts`, nuova `evaluateSlotSwap`)
- **R-04 ruolo per ruolo:** per ogni ruolo, quanti salgono = quanti scendono. Un giocatore senza ruolo noto (`pos` null) non si può spostare (errore: va prima sistemato il ruolo).
- Massimi di rosa (`rosterLimitErrors`, R-01..R-03) come nelle altre operazioni.
- Budget riserve: errore se dopo il cambio `reserveSpace < 0` e peggiora rispetto a prima. **ASSUNZIONE**: una rosa importata già oltre il budget può fare un cambio che lo riduce.
- Cap: avviso se dopo il cambio `overCap`; errore se il monte supera `effectiveCap + taxMaxOver` ed è salito. **ASSUNZIONE**: come per il budget riserve, un cambio che abbassa il monte passa sempre.
- Solo contratti titolari o riserve della squadra; la squadra talenti non c'entra.

## Flusso
```
proprietario: sceglie chi sale e chi scende → vede l'effetto (cap-line, alert) → «Invia richiesta»
      └─► in attesa (una sola per squadra) ── ritirata dal proprietario
                │                          └─ ritirata alla chiusura della finestra
                ├─► respinta dall'admin (con motivo)
                └─► approvata: l'admin l'ha già fatta su Dunkest → l'app sposta i contratti + annuncio del bot
```
Se nel frattempo un contratto è cambiato (scambio, taglio, modifica) l'approvazione fallisce con `CONFLICT:` e l'admin la respinge con il motivo; il proprietario ne manda una nuova. Il giorno dopo il cron confronta le rose Dunkest: se l'admin si è dimenticato Dunkest, `/admin/dunkest` lo segnala come oggi.

## Database (una migrazione)
- `seasons.slot_swap_open boolean not null default false` + `admin_set_slot_swap_window(p_open)` (audit; chiudendo ritira le richieste in attesa).
- `slot_swap_requests`: `id`, `season_id`, `team_id`, `requested_by`, `items jsonb` (`[{id, version, slot}]`, lo stesso formato di `admin_swap_slots`, con `label`), `roster_rev`, `status` (`pending`, `approved`, `declined`, `withdrawn`), `created_at`, `decided_at`, `decided_by`, `decision_note`, `announced_at`, `announce_claimed_at`, `version` (trigger `bump_version`). Indice unico parziale: una sola `pending` per squadra.
- RLS: SELECT per l'admin e per la squadra della richiesta (come le proposte di scambio: le richieste sono private); nessuna policy di scrittura.
- RPC della squadra: `slot_swap_request(p_team_id, p_roster_rev, p_items)` (squadra = `my_team_id()`, finestra aperta, versioni dei contratti, niente doppioni in attesa) e `slot_swap_withdraw(p_id, p_version)`.
- RPC admin: `admin_approve_slot_swap(p_id, p_version)` (riusa la logica di `admin_swap_slots`, estratta in un helper interno; `audit_log`) e `admin_decline_slot_swap(p_id, p_version, p_note)`.
- Annuncio: `slot_swap_announce_claim` / `_done` come per gli scambi (segreto del job o sessione admin), così il cron delle 9 riprova gli invii falliti.
- Test: righe di prova in `rls.sql` (viewer di un'altra squadra → `FORBIDDEN` e 0 righe lette, finestra chiusa → `INVALID`), concorrenza in `concurrency.sh` (approvazione contro taglio o scambio dello stesso contratto).

È una **nuova scrittura dei viewer** (dopo `trade_*` e `draft_lottery_seen`): va aggiunta alle eccezioni in CLAUDE.md.

## Interfaccia
- `/squadre/[id]`, solo per il proprietario: sezione «Cambio titolari/riserve» con la rosa divisa per ruolo, un tocco per far salire o scendere, il riepilogo (chi sale, chi scende), cap-line di monte e riserve prima/dopo, alert di luxury tax, errori che spengono «Invia richiesta». Se c'è una richiesta in attesa: stato e «Ritira». A finestra chiusa: «Cambi chiusi» con la spiegazione di R-04.
- `/admin/rose`: interruttore della finestra in testa; sezione «Cambi richiesti» con, per ogni richiesta, l'effetto ricalcolato adesso, «Fai su Dunkest, poi approva» → «Approva e applica» / «Respingi».
- Badge su «Admin» = proposte di scambio da approvare + richieste di cambio in attesa.
- Bot: testo breve con squadra, chi sale e chi scende (battute in `lib/slot-swap-announce.ts`, puro e testato).

## Lavoro
Un branch, `feat/cambi-riserve`: regole e test in `cap.ts`, migrazione e test RLS/concorrenza, action (`src/app/(lega)/squadre/[id]/actions.ts` per i proprietari, `admin/actions.ts` per gli admin), UI, annuncio. La migrazione va applicata sul reale insieme al deploy.
