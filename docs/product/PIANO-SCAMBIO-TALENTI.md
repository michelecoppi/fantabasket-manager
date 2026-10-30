# Piano — I diritti dei talenti come moneta di scambio

R-56 dice che si scambiano «giocatori (titolari/riserve/talenti) e pick», ma oggi l'app scambia solo contratti e pick: i talenti stanno in una tabella a parte (`talents`) e non sono mai movimenti di uno scambio. Questo piano aggiunge il terzo tipo di movimento, `talent`, in tutti i punti in cui oggi ci sono `contract` e `pick`: regole (`cap.ts`), trade machine, proposte, esecuzione, storico, registro e bot Telegram. Scritto il 2026-10-30 su richiesta dell'utente.

## Cosa si scambia

Il **diritto su un talento**, cioè la riga di `talents`: chi lo riceve diventa l'unica squadra che può firmarlo (R-35) al valore d'ingresso (R-26). Il talento non ha stipendio, quindi non pesa su cap, budget riserve o massimi di rosa: conta solo chi ne è proprietario.

Cosa cambia con lo scambio: `talents.team_id`. Cosa **non** cambia: `display_name`, `draft_year`, `entry_credits`, `notes`, il collegamento al listone `player_id`. Un talento già firmato è un contratto rookie e si scambia già oggi come giocatore.

## Decisioni da prendere prima di scrivere codice

Il regolamento non dice niente su questi punti. **Tutte le proposte sono state confermate dall'utente il 2026-10-30** (registro decisioni di PLAN.md, sezione «Scambio dei talenti» di OPEN-QUESTIONS.md); per D3 vale la prima strada (avviso e blocco nell'import).

| # | Domanda | Proposta |
|---|---|---|
| D1 | Il talento scambiato si porta dietro la scadenza della prelazione (R-35: anno di draft, «max 2 stagioni in squadra talenti»)? | **Sì**: il tempo è legato al giocatore, non a chi lo possiede. Non serve codice, perché `draft_year` resta com'è e la scadenza non è ancora gestita (domanda 4 di OPEN-QUESTIONS). |
| D2 | C'è un massimo di talenti per squadra? | **Nessun massimo** (il regolamento non ne fissa). Se la lega lo vuole, diventa un parametro `talent_max` in `league_settings` che si controlla in `evaluateTrade` come i massimi di rosa. |
| D3 | Dopo il primo scambio di talenti, che fa l'import dal foglio? `import_replace_season` cancella e riscrive **tutti** i talenti con la squadra del foglio, e conserva i collegamenti per (squadra, nome): un foglio vecchio annullerebbe lo scambio e farebbe perdere il collegamento. | Il report dell'import segnala ogni talento la cui squadra nel database è diversa da quella del foglio, e `--apply` si ferma (salvo `--force`), come già fa per gli altri problemi del report. In alternativa: considerare l'import ritirato per i talenti. |
| D4 | Uno scambio senza giocatori a contratto (solo talenti e/o pick) va rifatto su Dunkest? | **No**: su Dunkest ci sono solo i titolari. Il messaggio «fallo anche su Dunkest» compare solo se lo scambio muove contratti, e approvando una proposta senza contratti si segna subito «fatto su Dunkest». Vale anche per gli scambi di sole pick, che oggi chiedono il passaggio a vuoto. |
| D5 | Il cercatore di scambi propone anche talenti? | **Non nella prima versione**: non aiutano il cap né il ruolo, quindi non risolvono nessuno dei quattro bisogni del cercatore. Al massimo, più avanti, un interruttore «includi talenti» come quello delle pick. |
| D6 | Il bot li annuncia con battute proprie? | **Sì**: due gruppi nuovi (diritti ceduti, talento che non gioca in NBA) e uno per gli scambi di soli «futuri» (pick e talenti). |

## Dati e RPC (una migrazione, PR 1)

Nome `<timestamp>_trade_talents.sql`. **È compatibile all'indietro**: il codice di adesso non manda mai `kind: 'talent'` e non legge le colonne nuove, quindi si può applicare su Supabase prima del deploy del codice.

1. **`talents.version int not null default 1`**, con un trigger `before update of team_id` che chiama `bump_version()`. La versione cambia solo quando cambia il proprietario. Così collegare o scollegare un talento al listone (`admin_link_talents`) non fa scadere le proposte aperte che lo contengono, e restano coperti i giri A→B→A tra invio e approvazione (come per le pick).
2. **`trade_moves_check`**: accetta `kind = 'talent'` (con `id`, `version`, `from`, `to`). Lo `slot` su un talento è `INVALID`. Il controllo dei duplicati per `kind:id` funziona così com'è.
3. **`trade_moves_current`**: il caso `talent` controlla che esista una riga di `talents` con quell'id, `team_id = from` e la stessa `version`. I talenti non hanno stagione, quindi niente controllo di `season_id`.
4. **`trade_apply`**, ramo `talent`, dopo il lock delle squadre (ordine: stagione → squadre → righe): `select ... for update`, poi `CONFLICT: un talento dello scambio è cambiato nel frattempo` se manca, ha un'altra squadra o un'altra versione. Poi `update talents set team_id = to` e `audit_write('trade', 'talents', id, {team_id: from}, {team_id: to})`.
   - **Etichetta scritta dal server**: per i talenti la RPC salva nel movimento di `trades.payload` `label` (nome del giocatore collegato, altrimenti `display_name`), `draft_year`, `entry_credits` e `player_id`, presi dal database e non dal client. Serve perché l'import riscrive i talenti con id nuovi, e un talento firmato sparisce dalla tabella: senza questi dati lo storico e il bot non saprebbero più chi era. Oggi `label` arriva dal client: per i talenti non ci si fida.
   - Riepilogo dell'audit: `Scambio A ⇄ B · 2 giocatori, 1 pick, 1 talento`.
   - Il superamento delle proposte aperte (stesso `kind` e `id`) vale anche per i talenti, senza modifiche.
5. **`trade_propose`**: niente di nuovo oltre ai due helper. Il controllo «la squadra talenti non si cambia» riguarda lo slot dei contratti e resta com'è.
6. **`admin_sign_talent`: ordine dei lock da correggere (bug latente).** Oggi blocca il talento *prima* della squadra (stagione → talento → squadra), mentre `trade_apply` blocca squadra → talento. Una firma e uno scambio dello stesso talento in contemporanea vanno in **deadlock**: Postgres ne annulla uno con un errore `40P01` che `rpcError()` non traduce. Va riscritta come `lock_contract_team`: legge la squadra del talento senza lock, `roster_lock` della squadra, poi `select ... for update` del talento e ricontrolla che sia ancora di quella squadra (`CONFLICT: il talento è passato a un'altra squadra`). La firma della funzione resta uguale.
7. **`trade_announce_claim`**: per i movimenti `talent` restituisce i dati salvati nel payload e, se c'è `player_id`, quelli di adesso del giocatore collegato (nome completo, ruolo, squadra NBA, `pdk`, `gp`, infortunio). Se il talento è stato firmato o reimportato prima dell'annuncio, bastano i dati del payload.
8. **Contratti con `slot = 'talent'`**: l'enum `roster_slot` li ammette ma la squadra talenti sta in `talents`. Prima della migrazione verificare sul database reale che non ce ne siano (`select count(*) from contracts where slot = 'talent'`). Se ce ne sono, è un altro problema e va chiesto all'utente.

**Test RLS (`supabase/tests/rls.sql`).** La riga di prova dei talenti c'è già (900001). Da aggiungere:
- un admin esegue uno scambio con un talento: cambiano `team_id` e `version`, c'è la riga di audit;
- `from` sbagliato o versione vecchia → `CONFLICT`; `slot` su un talento → `INVALID`; un talento ripetuto → `INVALID`;
- uno scambio di soli talenti è valido; un talento ceduto alla stessa squadra → `INVALID`;
- `trade_propose` con un talento dalla squadra giusta → ok; con un talento di un'altra squadra → `CONFLICT`;
- uno scambio eseguito supera la proposta aperta che conteneva lo stesso talento;
- `admin_sign_talent` dalla vecchia squadra dopo lo scambio → `CONFLICT`; dalla nuova → ok;
- `admin_link_talents` su un talento in una proposta aperta: la versione non cambia e la proposta resta valida;
- il viewer non esegue scambi (già coperto) e non scrive su `talents` direttamente (già coperto).

`supabase/tests/import.sql`, solo se si sceglie la strada di D3 che tocca l'import.

## Logica (PR 2, pura e testata)

| File | Modifica |
|---|---|
| `src/lib/cap.ts` | `TradeParty` riceve `talents: TalentInfo[]` (`id`, `name`) e `gives.talents` / `gives.to.talents`. `evaluateTrade`: errore se un talento ceduto non è di chi lo cede o va a una squadra fuori dallo scambio; i talenti contano per «non cede e non riceve nulla» e per «lo scambio è vuoto»; **nessun effetto** su `tradeImpact`, massimi di rosa, cap e R-33. Se si sceglie un massimo (D2), il controllo va qui. Commento con R-56/R-35. |
| `src/lib/trade-draft.ts` | `SimTeam.talents` (`id`, `name`, `draftYear`, `credits`, `playerId`, `version?`). `TradeDraft.talents` (mappa come `picks`). `toggleTalent`, `setDestination(d, "talents", …)`. `removeTeam`/`reassign`/`draftKey` includono i talenti. `DraftMove` e `TradeMoveInput` con `kind: "talent"`. `draftMoves` mette nell'ordine giocatori → talenti → pick. `tradeInputError` accetta `talent` senza slot. `draftFromMoves`, `staleMoves` (talento sparito, passato a un'altra squadra o con versione diversa), `toParties`. `encodeMoves`/`decodeMoves`: prefisso `t` (`t17`), senza slot. |
| `src/lib/sim-teams.ts` | Talenti di ogni squadra in `SimTeam`, con la versione se presente. |
| `src/lib/league.ts`, `league-server.ts` | `Versions.talents`; la query dei talenti legge anche `version`. |
| `src/lib/trade-proposals.ts` | `parseProposalMoves` e `moveLabel` per i talenti (nome del collegato, altrimenti `display_name`, con l'anno di draft). |
| `src/lib/trades.ts` | `TradeMove.kind` comprende `talent`, con `draftYear`/`credits` dal payload. Senza questa modifica lo storico **scarterebbe in silenzio** i movimenti di talenti, e uno scambio di soli talenti risulterebbe `complete = false`. |
| `src/lib/trade-finder.ts` | Nessuna modifica (D5), salvo un test che il cercatore non proponga mai talenti. |

**Test**: `cap.test.ts` (talento non suo, destinazione fuori dallo scambio, scambio di soli talenti, a 3 squadre con destinazioni diverse, finanze identiche prima e dopo, «non riceve nulla» con un talento ricevuto), `trade-draft.test.ts` (toggle, rimozione di squadra, riassegnazione da 3 a 2 squadre, chiave, codifica `t` e rifiuto di `t17r`, stale), `trades.test.ts`, `trade-proposals.test.ts`.

## Interfaccia (PR 2)

- **Trade machine** (`components/trade-parts.tsx`, usata da `/scambio` e `/admin/scambio`): nel pannello di ogni squadra una sezione «Talenti · n» tra giocatori e pick, con lo stesso `Tick` e `MoveControls` (destinazione negli scambi a 3+), **senza** scelta dello slot. Ogni riga ha nome, anno di draft, valore d'ingresso (`–` se manca) e badge «talento». Nel dock e nell'esito: «2 gioc. · 1 talento · 1 pick». Mobile-first, Arena Night, nessun colore nuovo.
- **Proposte** (`components/trade-proposal.tsx`): righe dei talenti e avviso «cambiato» quando il talento è stale (firmato, scambiato, reimportato).
- **Storico scambi** (`/storico-scambi`): etichetta dal payload; se il talento è ancora collegato e il giocatore esiste, link alla scheda come in `/squadre/[id]`. Testo: «Diritti su X (draft 2026)».
- **Messaggi admin** (`admin/actions.ts`): «Ricordati di farlo anche su Dunkest» solo se lo scambio muove contratti (D4).
- **Coda Dunkest**: con D4, `admin_approve_trade_proposal` (o l'action) imposta `dunkest_done_at` se lo scambio non ha contratti; `awaitsDunkest` non cambia.
- Nessuna voce di menu nuova. Pagina squadra, listone (badge «talento» con la squadra) e firma di un talento seguono `team_id` e si aggiornano da sole.

Verifica nel browser a 390 e 1280 px, chiaro e scuro: simulatore con un talento, scambio a 3 con un talento, proposta con un talento, storico.

## Bot Telegram (PR 3)

`src/lib/trade-announce.ts`, `scripts/telegram-test.ts`.

- `AnnouncedMove.kind` comprende `"talent"`, con `draftYear`, `entryCredits`, `nbaTeam`. **Oggi `parseAnnouncements` scarta i tipi sconosciuti**: uno scambio di soli talenti verrebbe scartato tutto, non sarebbe mai segnato come annunciato e verrebbe ripreso in carico ogni 5 minuti fino alle 72 ore. Per questo la PR 3 va in produzione **insieme alla PR 2 o prima**, mai dopo.
- `moveText`: `🎓 Nome <i>(diritti · draft 2026 · val. 3,5)</i>`, con il nome completo del giocatore collegato al posto della sigla del foglio («T.Johnson»), `escapeHtml` sempre (i nomi del foglio hanno caratteri sporchi).
- Battute:
  - corregge `onlyPicks`, che scatta su `!players.length` e quindi direbbe «solo pick» anche in uno scambio con talenti: diventa «solo pick, nessun talento»;
  - nuovo `talentRights` (`X`, `Y`, `P`): diritti ceduti («{X} cede i diritti di {P} a {Y}: la pazienza è una virtù, ma non a {X}»);
  - nuovo `talentAbroad` (`Y`, `P`): talento non collegato al listone, cioè che non gioca in NBA;
  - nuovo `onlyFuture`: scambio di soli pick e talenti, nessun giocatore in rosa coinvolto;
  - rapina, scarico, stella, fantasma, contratto lungo, figurine e trasloco restano solo sui contratti: un talento non ha stipendio e non gioca per la squadra;
  - ordine: dopo `picks`, prima di `rookie`. `JOKE_VARS` aggiornato: il test che controlla i segnaposto copre da solo i gruppi nuovi;
  - frasi originali, si scherza sulle scelte di mercato e mai sulle persone, come le altre.
- **Limite di 4096 caratteri** di Telegram: un 4 squadre con molti talenti e pick allunga il messaggio. Test con lo scambio più grande ammesso (4 squadre, tutto quello che hanno) e, se serve, accorciare i dettagli delle righe oltre una soglia.
- Test in `trade-announce.test.ts`: lettura dei talenti, testo, ogni battuta nuova che scatta e non scatta, `onlyPicks` assente con un talento, lunghezza.

## Casistiche ed edge case

| Caso | Comportamento atteso | Dove |
|---|---|---|
| Scambio di soli talenti (talento ⇄ talento, talento per niente) | Valido; ogni squadra deve cedere o ricevere qualcosa, come oggi | `evaluateTrade`, `trade_moves_check` |
| Talento + pick contro un titolare | Il cap si valuta solo sul titolare; il talento non pesa | `tradeImpact` (talenti esclusi) |
| Scambio a 3-4 squadre con un talento | Destinazione per ogni talento, come per pick e giocatori | `gives.to.talents`, `MoveControls` |
| Talento ceduto da chi non lo possiede (dati vecchi nel client) | Errore in `evaluateTrade`; `CONFLICT` nella RPC | entrambi |
| Il proprietario firma il talento mentre una proposta lo contiene | La riga sparisce: proposta stale nella UI, `CONFLICT` all'approvazione; si rifà con il contratto rookie (con stipendio: cambia il cap) | `staleMoves`, `trade_apply` |
| Firma e scambio dello stesso talento nello stesso istante | Uno dei due aspetta e poi trova `CONFLICT`; **niente deadlock** dopo la correzione di `admin_sign_talent` | migrazione, punto 6 |
| Dopo lo scambio la vecchia squadra prova a firmarlo | `CONFLICT: il talento è passato a un'altra squadra` (c'è già); nella UI non compare più tra i suoi | `admin_sign_talent`, `/admin/firma` |
| Collegamento al listone cambiato durante una proposta | La proposta resta valida (la versione cambia solo con la squadra); i nomi si aggiornano | trigger `before update of team_id` |
| Import dal foglio con talenti scambiati | Id nuovi, quindi le proposte aperte diventano stale (corretto); squadra del foglio sopra quella dello scambio e collegamento perso (**da decidere, D3**) | `import_replace_season`, report import |
| Storico di un talento poi firmato o reimportato | Nome, anno e valore restano, salvati dal server nel payload | `trade_apply`, `parseTrade` |
| Ping-pong A→B→A tra invio e approvazione | Versione cambiata: `CONFLICT` | `talents.version` |
| Due squadre con talenti dallo stesso nome breve («Johnson») | Nella UI si distinguono per anno di draft e squadra NBA; per l'import resta il rischio del collegamento per (squadra, nome) | trade machine, D3 |
| Talento che non gioca in NBA (non collegato) | Scambiabile; nome del foglio; battuta `talentAbroad` | tutto |
| Talento senza valore d'ingresso (3 casi) | Scambiabile; `–` in UI, «val. ?» nel bot | UI, bot |
| Mercato chiuso | Proposte con talenti rifiutate come le altre; l'admin esegue lo stesso da `/admin/scambio` | invariato |
| Chiusura stagione con una proposta di talenti aperta | I talenti non dipendono dalla stagione; la proposta segue le regole di oggi (stagione cambiata → `CONFLICT`) | invariato |
| `slot` indicato per un talento (client manomesso) | `INVALID` nella RPC, errore di forma nell'action | `trade_moves_check`, `tradeInputError` |
| URL del cercatore con `t17` di una squadra non nello scambio | `decodeMoves` restituisce null, come per `c`/`p` | `trade-draft.ts` |
| Massimo di talenti superato (solo con D2) | Errore come per i massimi di rosa | `evaluateTrade` |
| Talento oltre la scadenza della prelazione (R-35) | Non gestito: la scadenza non esiste ancora nell'app (domanda 4) | fuori scope |
| Scambio solo talenti/pick e Dunkest | Nessun passaggio Dunkest (con D4) | action, approvazione |
| Annuncio con codice vecchio e movimento `talent` | Non deve succedere: la PR 3 va in produzione con la PR 2 o prima | ordine delle PR |
| Conteggio «scambio numero n» del bot | Gli scambi di soli talenti contano come scambi | `trade_announce_claim` (invariato) |
| Registro admin | Riga `trade` su `talents` con «Squadra» prima/dopo; `talents` ha già l'etichetta «Talento» | `audit.ts`, `auditChanges` |

## Ordine delle PR

Branch da `origin/main` senza upstream (`git switch -c tipo/nome --no-track origin/main`).

1. **`feat/scambio-talenti-db`**: migrazione (punti 1–8) e test RLS. Si applica su Supabase dopo il merge e **prima** del deploy della PR 2 (è compatibile all'indietro); annotare la versione in PLAN.md.
2. **`feat/scambio-talenti`**: logica, UI, messaggi Dunkest (D4), test. Si mergia solo con la migrazione già applicata.
3. **`feat/bot-talenti`**: annunci e battute. Va in produzione **prima** della PR 2 (il parser accetta i talenti anche se non ne arrivano ancora) o insieme a lei.
4. (Solo con D3) **`fix/import-talenti`**: avviso nel report e blocco di `--apply`, aggiornamento di [docs/IMPORT.md](../IMPORT.md).

Per ogni PR: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, test RLS se tocca tabelle o RPC; verifica nel browser per la 2. A fine lavoro: caselle in [PLAN.md](../../PLAN.md), assunzioni (D1, D4, D5) in [OPEN-QUESTIONS.md](../OPEN-QUESTIONS.md), la sezione «Talenti» della trade machine in [DESIGN_SYSTEM.md](../design/DESIGN_SYSTEM.md).

## Fuori scope

- Scadenza della prelazione e «liberare» un talento (R-35, domanda 4).
- Squadra d'origine del talento (chi l'ha draftato) mostrata dopo gli scambi: servirebbe una colonna `talents.original_team_id` che l'import non conosce.
- Talenti nel cercatore (D5) e negli scenari del planner del cap.

## Note dalla PR 1 (2026-10-30)

- Migrazione `20261030160000_trade_talents.sql`. Il trigger della versione scatta solo se `team_id` cambia davvero (`when old.team_id is distinct from new.team_id`).
- `trade_moves_check` rifiuta lo slot su ogni movimento che non è un contratto, quindi anche sulle pick, che prima lo ignoravano in silenzio. `tradeInputError` lo rifiutava già.
- D4 è nella RPC, non nell'action: `admin_approve_trade_proposal` imposta `dunkest_done_at` e scrive l'evento `dunkest_done` («Nessun giocatore a contratto: niente da fare su Dunkest») nella stessa transazione. Restano alla PR 2 solo i messaggi delle action.
- Riepilogo nel registro: `· N giocatori, N pick`, con `, 1 talento` / `, N talenti` solo se ce ne sono (il formato degli scambi senza talenti non cambia).
- Il caso 5 di `supabase/tests/concurrency.sh` prende la squadra come `trade_apply` e poi scambia il talento mentre parte una firma: con la funzione vecchia va in deadlock (verificato), con la nuova la firma risponde `CONFLICT: il talento è passato a un'altra squadra`.

## Note dalla PR 3 (2026-10-30)

- Il limite di 4096 caratteri si controlla sull'HTML (più lungo del testo che conta Telegram, quindi con margine). Se l'annuncio non ci sta si tolgono i dettagli delle righe; se ancora non basta, restano 6 righe per squadra (`SHORT_LIST`) con «…e altri N». Titolo, eccezione al cap, battute, chiusura e link restano sempre.
- `talentRights` scatta per un talento collegato al listone, `talentAbroad` per uno senza collegamento: in uno scambio con entrambi escono tutte e due (al massimo due battute per annuncio, come sempre).
- `onlyFuture` sostituisce `onlyPicks` quando ci sono talenti e nessun contratto; le frasi non nominano «pick», così vanno bene anche per uno scambio di soli talenti.

## Note dalla PR 2 (2026-10-30)

- `TradeParty.talents` e `gives.talents` sono facoltativi: il cercatore e i test che costruiscono squadre a mano non cambiano, e una squadra senza talenti non ha la sezione nella trade machine.
- Nello storico i talenti non aprono la scheda del giocatore (servirebbero i dati Dunkest nella pagina): restano testo, «Diritti su Nome (draft 2026)».
- La firma della bozza (`draftKey`) ora comprende i talenti; il desk admin la ricalcola con `draftKey(emptyDraft(...))` invece di scriverla a mano.
- `decodeMoves` rifiuta lo slot (`t17r`) su talenti e pick, come la RPC.

## Note dalla PR 4 (2026-10-30)

- Il controllo sta in `write()` di `scripts/import-xlsx.ts`, dopo il report e il controllo del payload e prima della RPC: serve il database, quindi la modalità solo report non lo fa.
- Un talento firmato nell'app sparisce dalla tabella e il foglio vecchio lo rimetterebbe tra i talenti: non è una divergenza di squadra e questo controllo non lo vede. Con un foglio vecchio l'import riscrive comunque anche i contratti, come prima (docs/IMPORT.md: il foglio è la fonte della stagione che si importa).
