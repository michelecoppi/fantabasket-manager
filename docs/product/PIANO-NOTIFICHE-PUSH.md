# Piano — Notifiche push per le proposte di scambio

Richiesta dell'utente (2026-11-05): quando una squadra fa un'offerta di scambio, chi la riceve deve accorgersene sul telefono. Prima c'erano solo il badge sulla voce «Scambio» (si vede aprendo il sito) e il bot Telegram, che scrive sul canale della lega solo il rumor e lo scambio eseguito, mai la proposta (le proposte restano private). Scelta tra tre strade: banner in app, messaggio privato su Telegram, notifiche push; l'utente ha scelto le **notifiche push** (Web Push dell'app installata).

## Cosa avvisa, a chi

Un avviso per dispositivo. Dice solo i nomi delle squadre, mai giocatori o pick (un avviso si legge a telefono bloccato). Chi ha fatto l'azione non riceve l'avviso di ciò che ha appena fatto.

| Evento (`trade_proposal_events.kind`) | Chi riceve | Testo |
|---|---|---|
| `sent`: nuova proposta o controproposta | le altre squadre della proposta | «Nuova proposta di scambio» / «Controproposta di scambio»: «X ti propone uno scambio. Hai ancora 3 h per rispondere.» |
| `accepted` | la squadra che ha proposto | «Y ha accettato» (e se è l'ultima: «ora la approva un admin») |
| `accepted` che porta la proposta in coda | gli admin | «Proposta da approvare» (apre `/admin/scambio`) |
| `rejected` | la squadra che ha proposto | «Y ha rifiutato», con la nota se c'è. Non se è una controproposta: arriva l'avviso della nuova |
| `withdrawn` | le altre squadre | «Proposta ritirata». Non se è sostituita da una nuova; per «Mercato chiuso» a tutte le squadre della proposta |
| `superseded` | tutte le squadre | «Proposta annullata»: un giocatore o una pick è già stato scambiato, o un admin l'ha rimandata |
| `approved` | tutte le squadre | «Scambio approvato» (apre lo storico) |
| `declined` | tutte le squadre | «Proposta respinta», con il motivo dell'admin |

Non si avvisano: la scadenza (il cron è giornaliero, l'avviso arriverebbe fino a 9 ore dopo), «fatto su Dunkest», le richieste di cambio titolari/riserve (gli admin le hanno già dal messaggio privato su Telegram e dal badge; si può aggiungere). Se la proposta è già scaduta quando l'avviso sta per partire, non parte. Un nuovo avviso sulla stessa proposta sostituisce il vecchio (stesso `tag`, `trade-<id>`).

## Come funziona

- **Iscrizione**: pagina Account → «Notifiche» (`account/push-toggle.tsx`). Il browser chiede il permesso, crea l'iscrizione (`PushManager.subscribe` con la chiave pubblica VAPID) e la manda alla RPC `push_subscribe`. «Invia un avviso di prova» spedisce ai propri dispositivi (`sendTestPush`). Il dispositivo si riregistra a ogni visita della pagina, così segue l'account con cui si è entrati.
- **Tabella `push_subscriptions`** (migrazione `20261105120000_push_notifications.sql`): un dispositivo = una riga (`endpoint` unico, chiavi `p256dh` e `auth`), al massimo 10 per utente. Lettura: solo le proprie righe (RLS). **Nessuna policy di scrittura**: si scrive solo con `push_subscribe` / `push_unsubscribe`, che agiscono solo sull'utente di chi chiama. È la nuova eccezione ai permessi dei viewer, decisa dall'utente il 2026-11-05 (la domanda era aperta in PLAN.md, Fase 4, «Esperienza su telefono»).
- **Coda**: nessuna RPC delle proposte è cambiata. Gli eventi li scrive già il registro `trade_proposal_events`; la colonna nuova `push_at` dice «già preso in carico» (come `notified_at` per i rumors). `push_claim(secret, ore)` marca gli eventi nuovi (non più vecchi di 12 ore) e li restituisce con le iscrizioni di tutti; chi riceve cosa lo decide `src/lib/push-notify.ts` (puro, testato). Il segreto è quello del job (`CRON_SECRET`): le action dei proprietari lo leggono dall'ambiente del server, quindi un viewer non può chiamare `push_claim` dal browser e non vede le iscrizioni altrui. `push_prune` toglie le iscrizioni che il servizio dichiara scadute (404/410).
- **Spedizione** (`src/lib/push.ts`): libreria `web-push` con le chiavi VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). Parte dalle action (`proposeTrade`, `answerProposal`, `withdrawProposal`, `approveProposal`, `declineProposal`, `returnProposal`, `executeTrade`, chiusura del mercato) dentro `after()`, quindi non rallenta né fa fallire chi agisce, e dal cron delle 9 come rete. Senza chiavi non fa nulla.
- **Al tocco**: `public/sw.js` mostra l'avviso e apre la pagina indicata (solo pagine del sito) nella finestra già aperta.

## Limiti e scelte

- **Best effort**: un avviso che il servizio non consegna non si riprova (un avviso in ritardo di ore non serve; lo stato vero è nel badge). Eventi più vecchi di 12 ore non si notificano.
- **iPhone**: le notifiche esistono solo per l'app aggiunta alla schermata Home (iOS 16.4+); la pagina Account lo spiega. In sviluppo (`npm run dev`) il service worker non si registra e la pagina lo dice.
- Gli eventi precedenti alla migrazione non si notificano mai (`push_at` riempito con la migrazione).
- Le chiavi VAPID si generano una volta sola: cambiarle invalida tutte le iscrizioni (ognuno dovrebbe riattivare le notifiche).

## Prove fatte (2026-11-05)

Test unitari (`push-notify.test.ts`, `push.test.ts`, `sw-push.test.ts`); test RLS in `supabase/tests/rls.sql` (tabella solo-RPC, ognuno vede e toglie solo i propri dispositivi, il dispositivo passa all'account che entra, tetto di 10, `push_claim` e `push_prune` solo con segreto o admin, evento preso una volta sola, `completes`), con due difetti introdotti apposta (unsubscribe senza filtro, lettura aperta a tutti) che il test ferma; spedizione contro un finto servizio HTTPS (avviso cifrato `aes128gcm` decifrato, intestazioni VAPID, 410 → iscrizione tolta); service worker in Chromium (avviso mostrato, stesso tag sostituisce, payload non JSON); pagina Account in Chromium con `PushManager` simulato (stati: da attivare, attive, bloccate, errore di salvataggio). **Non provato**: la consegna vera tramite il servizio di notifica di Google/Apple/Mozilla e il tocco sull'avviso su un telefono vero, da fare dopo il deploy.
