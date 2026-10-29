# Piano — Proposte di scambio e cercatore di scambi

Un proprietario propone uno scambio (da solo o aiutato dal cercatore), le altre squadre accettano o rifiutano, un admin lo approva e l'app lo esegue: niente più accordi da ricopiare a mano. È la versione nell'app di R-55 («accordi privati, poi comunicati al moderatore che li rende ufficiali»). Scritto il 2026-10-29 su richiesta dell'utente.

## Decisioni dell'utente (2026-10-29)

- **Privato.** Una proposta la vedono solo le squadre coinvolte e gli admin; la sua storia (inviata, accettata, rifiutata…) resta in un registro privato. Pubblico diventa solo lo scambio eseguito, in `/storico-scambi` come oggi. Più avanti un **bot Telegram** pubblicherà sul canale della lega (fase 4 di questo piano): il registro è già pensato come coda per il bot.
- **Nessun conflitto di interessi.** L'approvazione serve ad avvisare un admin che deve registrare lo scambio e confermarlo; può approvare qualunque admin, anche se la sua squadra è nello scambio.
- **Durata massima di una proposta: un giorno** (parametro `trade_proposal_hours` = 24 in `league_settings`, non una costante).
- **Mercato aperto o chiuso lo decide un admin** da un interruttore nella sua interfaccia. Finestre o date fisse del regolamento non ci sono: se un giorno la lega ne fissa una, la si aggiunge allora.

## Principi

- **Una proposta è uno scambio già pronto.** Salva gli stessi dati che `admin_execute_trade` riceve oggi (squadre, movimenti con `id`, `version`, `from`, `to`, `slot`) più le `roster_rev` delle squadre. Approvare = eseguire, nella stessa transazione: l'admin non reinserisce niente. Resta a mano solo Dunkest, dove le rose non si modificano da qui.
- **Regole solo in `cap.ts`.** Invio, risposta e approvazione passano da `evaluateTrade`, come il simulatore e `/admin/scambio`. Le RPC controllano solo coerenza (chi sei, quale squadra, versioni, scadenza, mercato aperto).
- **Prima scrittura dei viewer, solo via RPC.** Le tabelle nuove non hanno policy di INSERT/UPDATE/DELETE per nessuno: si scrive solo con funzioni `security definer` che controllano che chi chiama agisca per la propria squadra (`profiles.team_id`). Eccezione alla sola lettura decisa dall'utente il 2026-10-29, da annotare nel registro decisioni di PLAN.md.
- **Chi chiama una RPC direttamente salta i controlli dell'action.** Non è un problema di regole: l'approvazione dell'admin ripassa da `evaluateTrade` prima di eseguire, quindi una proposta fuori regola non diventa mai uno scambio.
- **Nessuna voce di menu nuova** (tab bar corta, decisione del 2026-10-27): le proposte vivono in `/scambio` come seconda vista, con un badge sulla voce «Scambio» quando qualcosa aspetta te.
- **Arena Night**, mobile-first, verificato a 390 e 1280 px, chiaro e scuro.

## Prerequisito

**Ogni proprietario ha un account collegato alla sua squadra.** Oggi ne mancano 6 (PLAN.md, Deploy). Senza `profiles.team_id` non si può proporre né rispondere. Le PR 1–3 si possono fare prima, ma la funzione serve solo dopo.

---

## Stati di una proposta

```
            ┌──────────── ritirata (dal proponente, finché non è approvata)
            │
 inviata ──►├── rifiutata (da una controparte, con nota facoltativa) ──► controproposta = proposta nuova collegata
 (pending)  │
            ├── scaduta (nessuna risposta completa entro trade_proposal_hours)
            │
            └── accettata da tutte (accepted) ──► approvata ed eseguita (approved, collegata a trades.id)
                                               ├─► respinta dall'admin (declined, con motivo)
                                               └─► superata (superseded): un altro scambio ha già mosso un suo giocatore o pick,
                                                   o le rose sono cambiate e l'admin la rimanda indietro
```

- **Accettata da tutte:** ogni squadra diversa dal proponente deve accettare (scambi fino a `trade_max_teams`). Un solo rifiuto chiude la proposta.
- **Scadenza (`expires_at` = invio + `trade_proposal_hours`):** vale per la fase delle risposte. Una proposta accettata da tutte resta in coda all'admin senza scadenza: le squadre hanno già detto sì, manca solo la registrazione (**ASSUNZIONE** da confermare con l'utente). Nessun cron in più: una proposta `pending` con `expires_at` passato si legge come scaduta e le RPC la rifiutano; il job giornaliero la marca `expired` per tenere pulito il registro.
- **Controproposta:** «Rifiuta e controproponi» apre la trade machine già compilata; la nuova proposta ha `parent_id` e una scadenza sua.
- **Mercato chiuso:** non si inviano proposte e non si accettano quelle aperte; chiudere il mercato marca come `withdrawn` (motivo «mercato chiuso») le proposte non ancora approvate. Gli admin possono sempre eseguire uno scambio da `/admin/scambio` anche a mercato chiuso, come oggi (**ASSUNZIONE**: è il potere del moderatore di ufficializzare, R-55).

## Dati (una migrazione, PR 2)

| Tabella / colonna | Contenuto |
|---|---|
| `seasons.trade_market_open boolean default false` | interruttore del mercato (PR 1; stato, non regola, quindi non in `league_settings`) |
| `league_settings` `trade_proposal_hours` = 24 | durata delle risposte (+ `LeagueSettings`, `settingsFromRows`, `DEFAULT_SETTINGS`, `seed.sql`) |
| `trade_proposals` | `id`, `season_id`, `proposer_team_id`, `proposer_user_id`, `teams uuid[]`, `moves jsonb` (formato di `admin_execute_trade`, con `label`), `roster_revs jsonb`, `message`, `cap_exception_reason` (R-57: chi propone chiede l'eccezione, l'admin decide), `status`, `created_at`, `expires_at`, `decided_at`, `decided_by`, `decision_note`, `parent_id`, `trade_id` → `trades`, `dunkest_done_at`, `version` (trigger `bump_version`) |
| `trade_proposal_answers` | `proposal_id`, `team_id`, `user_id`, `answer` (`accept`/`reject`), `note`, `at`; chiave `(proposal_id, team_id)` |
| `trade_proposal_events` | registro privato: `id`, `proposal_id`, `at`, `kind` (`sent`, `accepted`, `rejected`, `withdrawn`, `expired`, `superseded`, `approved`, `declined`, `dunkest_done`), `team_id`, `user_id`, `note`, `notified_at` (vuoto finché il bot non l'ha pubblicato: fase 4) |

**RLS.** SELECT su tutte e tre se `is_admin()` o se la squadra dell'utente è in `teams` della proposta (helper `my_team_id()`); nessuna policy di scrittura. `rls.sql`: righe di prova, eccezione come per `audit_log` (il viewer di una squadra estranea legge 0 righe, quello coinvolto le legge), viewer e admin non scrivono direttamente.

## RPC

Di squadra (non `admin_*`, quindi con test propri in `rls.sql`: anon e viewer senza squadra → `FORBIDDEN`, squadra estranea → `FORBIDDEN`, squadra coinvolta → ok):

- `trade_propose(p_teams, p_moves, p_roster_revs, p_message, p_cap_reason, p_parent)`: chi chiama deve avere una squadra in `p_teams`, mercato aperto, versioni e `roster_rev` uguali a quelle attuali (`CONFLICT:` altrimenti), giocatori e pick ancora di chi li cede. Evento `sent`.
- `trade_answer(p_id, p_version, p_answer, p_note)`: squadra coinvolta e diversa dal proponente, proposta `pending` e non scaduta, mercato aperto. All'ultima accettazione → `accepted`. Al rifiuto → `rejected`.
- `trade_withdraw(p_id, p_version)`: solo il proponente, prima dell'approvazione.

Admin (passano il test generico delle `admin_*`):

- `admin_set_trade_market(p_open)`: apre o chiude, scrive `audit_log`; chiudendo ritira le proposte aperte.
- `admin_approve_trade_proposal(p_id, p_version, p_approved_by, p_override_reason, p_roster_revs)`: in una transazione esegue lo scambio con la stessa logica di `admin_execute_trade` (estratta in un helper interno non chiamabile dai client, così le due strade non divergono), collega `trade_id`, marca `approved` e `superseded` le altre proposte aperte che muovono gli stessi contratti o pick. `CONFLICT:` se versioni o rose sono cambiate: la UI offre «Rimanda alle squadre» (→ `superseded`, il proponente può ripartire dalla bozza).
- `admin_decline_trade_proposal(p_id, p_version, p_note)`: respinta con motivo.
- `admin_mark_dunkest_done(p_id)`: «Fatto su Dunkest», chiude il ciclo. Suggerito in automatico quando il job vede i giocatori nella rosa Dunkest giusta (`dunkest_rosters`), ma lo conferma l'admin.

Server action (in `src/app/(lega)/scambio/actions.ts` per le squadre, `admin/actions.ts` per gli admin): ricaricano la lega, ricostruiscono i `TradeParty` dai movimenti e chiamano `evaluateTrade` (logica oggi dentro `executeTrade`: va estratta in una funzione comune, `tradePartiesFromMoves`). Errori bloccano; sforamento del cap (R-57) solo con la richiesta di eccezione motivata. Poi `revalidatePath("/", "layout")`.

## UI

- **`/scambio`** (trade machine condivisa, `components/trade-parts.tsx`): se hai una squadra e il mercato è aperto, accanto all'esito compare «Proponi scambio» con un messaggio facoltativo e, se il cap sfora, il campo della richiesta di eccezione. A mercato chiuso: «Mercato chiuso» al posto del pulsante; il simulatore resta usabile.
- **`/scambio?vista=proposte`**: tre gruppi — *Da rispondere* (con il conto alla rovescia), *Inviate da te*, *Archivio* (concluse). Ogni proposta mostra l'esito per squadra come la trade machine (`evaluateTrade` di adesso, non quello dell'invio, con un avviso se le rose sono cambiate) e i pulsanti Accetta / Rifiuta / Rifiuta e controproponi / Ritira.
- **Badge** sulla voce «Scambio» (header e tab bar) con le proposte che aspettano la tua risposta; per un admin anche quelle in coda di approvazione.
- **`/admin/scambio`**: interruttore «Mercato aperto/chiuso» in testa; sezione «Da approvare» con «Approva ed esegui» (stesso esito, stessa richiesta di motivazione R-57), «Respingi», «Rimanda alle squadre»; dopo l'approvazione la riga resta in «Da fare su Dunkest» finché non si preme «Fatto su Dunkest».
- **Avvisi senza bot (PR 3):** solo badge in app. Il link a una proposta è condivisibile (`/scambio?vista=proposte#p<id>`): chi non è coinvolto vede «proposta non disponibile».

## Cercatore di scambi (PR 4)

Aiuta a costruire una proposta, non decide niente. Solo due squadre (la tua e una controparte, o «tutta la lega»).

- **Cosa cerchi** (chip): un giocatore preciso di un'altra squadra · un ruolo (G/A/C) · spazio nel cap (scaricare stipendio) · spazio nel budget riserve.
- **Ricerca** in `src/lib/trade-finder.ts`, pura e testata: combinazioni di fino a 3 contratti per lato più al massimo una pick (circa un migliaio di prove per coppia di squadre, istantaneo), ognuna valutata con `evaluateTrade`; restano solo quelle senza errori e senza sforamento del cap per nessuno. Le pick entrano solo se chiedi di includerle.
- **Ordine** per vicinanza al bisogno, poi per equilibrio: differenza di PDK (`dunkest_stats`, come «Affari e flop») e di stipendio tra i due lati. L'equilibrio è un'indicazione mostrata come tale, mai un filtro: nessuna regola di lega dice cosa è «equo».
- **Risultato:** le prime 10 proposte come carte compatte; «Usa questa» riempie la trade machine (`lib/trade-draft.ts`), da lì si ritocca e si invia.
- **Dove:** `/scambio?vista=cerca`. Funziona anche per chi non ha squadra (scegli la squadra da cui partire) e a mercato chiuso, come il simulatore.

## Bot Telegram (fase 4, dopo)

Gratuito (Bot API). Token in `TELEGRAM_BOT_TOKEN` e canale in `TELEGRAM_CHAT_ID` su Vercel. Il cron (o una route chiamata dopo ogni action) legge `trade_proposal_events` con `notified_at` vuoto e pubblica. Cosa va sul canale (tutto o solo gli scambi eseguiti, visto che le proposte sono private) si decide prima di farlo. Lo stesso bot può poi annunciare MVP della giornata e avvisi di formazione.

---

## Ordine delle PR

Branch da `origin/main` senza upstream (`git switch -c tipo/nome --no-track origin/main`).

1. `feat/mercato-scambi` — `seasons.trade_market_open`, `admin_set_trade_market`, interruttore in `/admin/scambio`, «Mercato aperto/chiuso» in `/scambio`. Piccola; migrazione da applicare dopo il merge.
2. `feat/proposte-scambio-db` — tabelle, RPC, `trade_proposal_hours`, helper comune con `admin_execute_trade`, test RLS e di concorrenza (due approvazioni sugli stessi giocatori, proposta contro taglio). Migrazione e deploy vanno insieme.
3. `feat/proposte-scambio-ui` — action, vista proposte, badge, coda admin, «Fatto su Dunkest». `tradePartiesFromMoves` estratta e testata.
4. `feat/cercatore-scambi` — `trade-finder.ts` e `/scambio?vista=cerca`. Indipendente dalla 2 e 3 (si può fare in parallelo); il pulsante «Proponi» compare quando c'è la 3.
5. (dopo) `feat/bot-telegram`.

Per ogni PR: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, test RLS se tocca tabelle o RPC; verifica nel browser a 390 e 1280 px, chiaro e scuro (con i dati veri la fa l'utente se il browser integrato non ha la sessione). A fine lavoro: caselle in [PLAN.md](../../PLAN.md), assunzioni in [OPEN-QUESTIONS.md](../OPEN-QUESTIONS.md), componenti nuovi in [DESIGN_SYSTEM.md](../design/DESIGN_SYSTEM.md).

## Domande da chiudere

1. **Scadenza dopo l'accettazione** — le 24 ore valgono solo per le risposte delle squadre (proposta piano) o anche per l'approvazione dell'admin?
2. **Chiusura del mercato** — ritira le proposte aperte (proposta piano) o le lascia scadere da sole?
3. **Scambi admin a mercato chiuso** — `/admin/scambio` resta sempre utilizzabile (proposta piano)?
4. **Più account per squadra** — se una squadra ha due profili, basta che risponda uno dei due (proposta piano)?
5. **Bot** — sul canale vanno solo gli scambi eseguiti o anche le proposte?
