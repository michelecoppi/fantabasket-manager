# Product audit — Fantabasket Manager

Data: 2026-10-25 · baseline: `main` `6f96abb` · branch: `feat/product-improvements-audit`

## Metodo e perimetro

Audit statico di route, componenti, loader Supabase, regole TypeScript, server action, RPC, migrazioni, test RLS, import, documentazione e CI. Sono stati seguiti i flussi viewer e admin dal database alla UI e ritorno. Non sono stati usati dati di produzione in scrittura, bypass di autenticazione o dataset inventati. I difetti indicati come **verificati** derivano da un percorso concreto nel codice; i rischi che richiedono concorrenza, volume o ambiente reale sono marcati separatamente.

## 1. Executive summary

Fantabasket Manager è già un prodotto operativo, non una semplice vetrina: copre consultazione di rose, cap, pick, giocatori e scadenze, simulazione degli scambi e quasi tutto il ciclo amministrativo. Le regole finanziarie principali sono centralizzate e testate; autenticazione, RLS e RPC con guardie admin formano una base solida.

Il valore immediato non sta in statistiche NBA, classifiche live o un nuovo redesign, dati che il progetto non possiede o dichiara fuori scope. Sta nel rendere più affidabili le decisioni già supportate: scambi, firme, tagli e pianificazione dei contratti. L'audit ha trovato alcuni controlli non applicati uniformemente e informazioni che la UI calcola ma non mostra, insieme a rischi più ampi nell'import e nelle scritture concorrenti.

**P0:** nessun bypass auth/RLS o difetto bloccante immediato verificato. **Scope di questa PR:** correttezza degli scambi e delle informazioni di mercato, preview dei rientri, importi luxury tax e totali delle scadenze. Import atomico, vincoli concorrenti e regole che richiedono configurazioni/migrazioni restano lavori separati.

## 2. Inventario verificato e percorsi utente

| Area | Implementazione reale | Percorso e limiti osservati |
|---|---|---|
| Home lega `/` | Riepilogo personale o “League pulse”, cap line, payroll, spazio, riserve, bonus, quote e luxury tax; ordinamento e filtri via URL | Consultazione rapida delle otto squadre; non è una classifica sportiva |
| Squadra `/squadre/[id]` | Titolari, riserve, talenti, tagli, pick possedute/cedute, cap e warning | Buona pagina di dettaglio; manca un piano aggregato delle scadenze |
| Giocatori `/giocatori` | Ricerca accent-insensitive, ruolo, NBA team, stato, ordinamento, badge tagliato/restricted | Mostra i primi 100 risultati filtrati; nessuna paginazione |
| Draft `/draft` | Matrice pick, proprietario aggiornato dopo gli scambi, ordine rookie draft | I giri e il testo sull'orizzonte sono costanti nella pagina |
| Scadenze `/scadenze` | Filtri squadra/anno, scadenza, team option, rookie/unrestricted | Elenca contratti ma non aggrega crediti e opzioni |
| Simulatore `/scambio` | Due squadre, giocatori e pick, impatto prima/dopo; sola lettura | Non renderizza errori e warning globali prodotti da `evaluateTrade` |
| Admin scambio | Riepilogo, conferma, approvatore, override cap motivato, warning | Scrive tramite RPC transazionale dopo validazione TypeScript |
| Admin firma | Ricerca, termini, anteprima cap/riserve, assegnazione tagliati | Mancano R-25 e limite rookie R-26 nei validatori |
| Admin rose | Modifica, durate massive, taglio/rimozione/rientro | La preview del rientro non usa il ruolo reale del giocatore |
| Pick e quote | Proprietà, “da confermare”, nuovi draft; pagamenti quota/tax | Quote aggiorna due flag senza versione di riga |
| Chiusura stagione | Preview classifica/bonus/lottery/contratti/tagli e RPC transazionale | Disabilitata intenzionalmente con `SEASON_CLOSE_ENABLED = false` |
| Registro admin | Ultime operazioni e storico filtrabile/paginato | Non espone operatore e before/after già presenti in `audit_log` |
| Autenticazione | Login email/password e magic link, proxy di sessione, signout | Non è stato trovato un bypass; origine redirect basata sulla request |
| Storico | Righe stagione conservate e tabella `trades` leggibile dagli autenticati | Nessuna route pubblica per storico stagioni/scambi |

## 3. Architettura, dati e regole

- Next.js App Router, React Server/Client Components, TypeScript strict e Tailwind 4; nessuna nuova dipendenza necessaria per le opportunità prioritarie.
- `loadLeague()` legge la stagione corrente come utente autenticato; `buildLeague()` costruisce rose e finanze. `loadPlayers()` pagina il listone e unisce contratti, tagli e ultimi contratti.
- `cap.ts` è la fonte condivisa per cap, floor, luxury tax, tagli, scambi e controlli di rosa. Il simulatore viewer e le action admin riusano le stesse funzioni pure.
- Le scritture admin passano da server action con `requireAdmin()` e RPC `security definer` con `admin_guard()`, transazione e `audit_log`. Le versioni ottimistiche coprono contratti, tagli e pick.
- RLS e test SQL verificano accessi anon/viewer/admin e presenza delle guardie. CI esegue lint, typecheck, test, build e RLS su Postgres.
- Punteggi, formazioni settimanali e statistiche live restano su Dunkest: non esiste una fonte dati per introdurli correttamente.

## 4. Punti di forza

1. **Regole finanziarie verificabili:** monte ingaggi, quote tagliate, cap effettivo, riserve e luxury tax riproducono i riferimenti del foglio con test pre/post asta.
2. **Permessi stratificati:** UI, server action, RLS e RPC non si sostituiscono l'uno all'altro; nessuna scrittura viewer trovata.
3. **Strumenti già differenziati:** contratti pluriennali, tagli con quota, pick future e scambio con override riflettono la lega reale.
4. **Design coerente:** Front Office editoriale, dati densi, mobile-first, focus e dark mode; non serve una revisione visiva generale.
5. **Manutenibilità:** funzioni pure e test condivisi permettono correzioni piccole senza duplicare regole nei componenti.

## 5. Backlog priorizzato

Ogni voce distingue evidenza, soluzione, valore e criteri di accettazione. “Completata” si riferisce allo scope implementato in questo branch; le altre voci restano raccomandazioni.

### P0 — Critical

Nessun elemento confermato. In particolare non è stato verificato un accesso anon/viewer ai dati riservati o una scrittura non autorizzata. I problemi di concorrenza sotto richiedono hardening ma non vengono presentati come exploit remoti.

### P1 — High value

#### P1-01 — Gli scambi possono peggiorare i massimi di rosa — **completata in questa PR**
- **Tipo:** bug fix / integrità delle regole.
- **Problema ed evidenza:** `evaluateTrade()` calcola cap e warning ma non chiama `rosterLimitErrors()` (`src/lib/cap.ts`). Un 1-per-2 può quindi portare una squadra da 6 a 7 riserve e risultare senza errori, mentre firma/modifica/rientro bloccano lo stesso superamento (R-01–R-03).
- **Soluzione:** validare la rosa prima/dopo per entrambe le squadre nella stessa funzione usata da viewer e admin; mantenere non peggiorative le operazioni su dati già oltre limite.
- **Valore:** evita che il simulatore prometta e la server action registri rose non ammesse.
- **Complessità:** bassa. **Rischio/dipendenze:** nessuna migrazione; non rendere bloccanti minimi, budget riserve o limite pick, la cui interpretazione è distinta.
- **Accettazione:** 14° titolare, 7ª riserva e massimi per ruolo sono errori; scambi legali e miglioramenti da stato già oltre limite restano valutabili; test automatici dedicati.

#### P1-02 — Il simulatore nasconde esiti e mostra uno stato cap fuorviante — **completata in questa PR**
- **Tipo:** bug fix / UX decisionale.
- **Problema ed evidenza:** `/scambio` non renderizza `ev.errors` ed `ev.warnings`; quindi pick da confermare, limite pick e ora errori di rosa non sono visibili. `ImpactCard` mostra “cap rispettato” quando `breaksCap` è false anche se `after.overCap` resta true, ad esempio 260 → 255 con cap 250.
- **Soluzione:** mostrare callout per errori e avvisi non bloccanti; distinguere “sotto cap”, “ancora sopra cap” e “richiede eccezione”.
- **Valore:** la simulazione viewer comunica lo stesso esito che l'admin incontrerà.
- **Complessità:** bassa. **Rischio/dipendenze:** nessuna modifica a R-57 o alla persistenza.
- **Accettazione:** warning pick e errori rosa visibili; una squadra ancora sopra cap non viene mai detta “cap rispettato”; admin conserva conferma e override.

#### P1-03 — Import non atomico e non limitato alla stagione — **rinviata**
- **Tipo:** technical improvement / data integrity.
- **Problema ed evidenza:** `scripts/import-xlsx.ts` elimina globalmente contratti, tagli, pick e altre righe, poi ricrea solo la stagione 2026 con richieste separate. Dopo una chiusura può cancellare storico; un errore intermedio può lasciare dati parziali.
- **Soluzione:** import per stagione tramite una RPC transazionale o staging + sostituzione atomica, backup e prova di rollback su ambiente non produttivo.
- **Valore:** protegge storico e recuperabilità del principale flusso dati.
- **Complessità:** alta. **Rischio/dipendenze:** migrazione e test su copia; non eseguire sul DB reale senza approvazione.
- **Accettazione:** una seconda stagione resta intatta; un fallimento non lascia cancellazioni parziali; report preflight invariato o più rigoroso.

#### P1-04 — R-25, minimo d'asta da ultimo contratto, non applicato — **rinviata**
- **Tipo:** new feature / regola mancante.
- **Problema ed evidenza:** `last_contracts` contiene stipendio e data, ma `loadPlayers()` non li espone e `signContract()` non li valida; un ex-contratto può essere firmato sotto metà dell'ultimo stipendio entro l'anno (R-25).
- **Soluzione:** caricare l'ultima scadenza, mostrare ultimo stipendio/minimo e applicare lo stesso controllo server-side nei due percorsi di firma.
- **Valore:** supporta offerte corrette senza consultare il foglio.
- **Complessità:** media. **Rischio/dipendenze:** decidere arrotondamento dei quarti di credito e validità esatta di “1 anno”; evitare validazione solo client.
- **Accettazione:** metà esatta accettata, sotto-minimo rifiutato, ultima riga storica e scadenza corrette, entrambi i percorsi coperti.

#### P1-05 — Contratti rookie oltre due stagioni — **rinviata**
- **Tipo:** bug fix / regola mancante.
- **Problema ed evidenza:** `isRookie` non entra in `contractTermsErrors`; firma, modifica e durate massive possono accettare rookie da 3 anni o 2+1, contrariamente a R-26.
- **Soluzione:** aggiungere `rookie_max_years` a `league_settings`, propagarlo a `LeagueSettings` e ai validatori/UI; testare tutte le write path.
- **Valore:** impedisce contratti non validi e rende esplicito il vincolo prima del submit.
- **Complessità:** media. **Rischio/dipendenze:** migrazione obbligatoria e applicazione coordinata; il valore 2 non va hardcodato.
- **Accettazione:** rookie 1/2 validi, rookie 3 e 2+1 rifiutati, contratti ordinari invariati, seed/migrazione/test RLS aggiornati.

#### P1-06 — Concorrenza su invarianti di rosa e chiusura — **completata in questa PR**
- **Tipo:** technical improvement / data integrity, rischio confermato staticamente.
- **Problema ed evidenza:** firma/modifica/rientro leggono e validano in TypeScript, ma la RPC non blocca la rosa della squadra. Due admin possono validare contemporaneamente l'ultimo slot. Firme/scambi non serializzano con la chiusura stagione.
- **Soluzione:** lock di squadra/stagione o revisione di rosa verificata nella stessa transazione; test concorrenti prima di abilitare la chiusura.
- **Valore:** mantiene valide le regole anche con due admin e durante transizioni irreversibili.
- **Complessità:** alta. **Rischio/dipendenze:** migrazione RPC e test di concorrenza; `SEASON_CLOSE_ENABLED` deve restare false fino alla verifica.
- **Accettazione:** due richieste concorrenti non superano i massimi; una scrittura non può finire nella stagione appena chiusa; nessun deadlock nei test.
- **Esito:** `teams.roster_rev` (trigger sui contratti) verificato dalle RPC dopo il lock di squadra, stagione corrente `for share` in ogni scrittura, ordine dei lock stagione → squadre per id → righe. Migrazione `20261026220000_roster_locks.sql`, test in `supabase/tests/concurrency.sh` e `rls.sql`. `SEASON_CLOSE_ENABLED` resta `false`: la chiusura va comunque provata su dati veri.

#### P1-07 — Luxury tax arrotondata a un decimale — **completata in questa PR**
- **Tipo:** bug fix / accuratezza UI.
- **Problema ed evidenza:** `fmt()` per crediti mostra 2,75 € come 2,8 €; il caso è nei riferimenti documentati e in home, squadra, Quote e chiusura.
- **Soluzione:** formatter euro distinto con due decimali, senza toccare il calcolo.
- **Valore:** l'importo mostrato corrisponde a quello dovuto.
- **Complessità:** bassa. **Rischio/dipendenze:** nessuna.
- **Accettazione:** 2,75 € resta 2,75; interi leggibili; crediti invariati; test del formatter e dei warning di chiusura.

#### P1-08 — Preview rientro con ruolo diverso dal server — **completata in questa PR**
- **Tipo:** bug fix / UX admin.
- **Problema ed evidenza:** `RoseCut` non porta `pos` e la preview passa `position: null`; la action usa invece `found.cut.pos`. Il client può abilitare un rientro che eccede il massimo per ruolo e fallire solo al submit.
- **Soluzione:** propagare il ruolo già presente in `TeamCut` fino alla preview.
- **Valore:** anteprima e validazione server rispondono allo stesso modo.
- **Complessità:** bassa. **Rischio/dipendenze:** nessuna modifica RPC.
- **Accettazione:** massimi per ruolo e warning della preview usano il ruolo reale; dati senza ruolo conservano il comportamento `null`.

### P2 — Valuable

#### P2-01 — Totali per pianificare le scadenze — **completata in questa PR**
- **Tipo:** new feature / decision support.
- **Problema ed evidenza:** `/scadenze` mostra solo “N contratti”; crediti e opzioni sono già disponibili ma vanno sommati a mano.
- **Soluzione:** aggregatore puro per crediti in scadenza, opzioni e composizione titolari/riserve per ogni anno filtrato.
- **Valore:** aiuta asta e pianificazione senza inventare cap futuri o bonus.
- **Complessità:** bassa. **Rischio/dipendenze:** chiarire che i crediti sono nominali e l'option può spostare la scadenza.
- **Accettazione:** totali coerenti con righe e filtri, mezzi crediti corretti, team option contate e testate, nessuna proiezione presentata come cap futuro.

#### P2-02 — Totale titolari assente dai warning — **completata in questa PR**
- **Tipo:** bug fix / data quality.
- **Problema ed evidenza:** `rosterWarnings()` controlla ruoli e riserve, non il totale di 13 titolari; un giocatore senza ruolo può rendere invisibile un 14° titolare nei badge e nei filtri.
- **Soluzione:** warning sul totale minimo/massimo derivato dalle impostazioni, mantenendo i ruoli sconosciuti fuori dai conteggi per posizione.
- **Valore:** la stessa condizione è visibile sia nei dati sia nel simulatore.
- **Complessità:** bassa. **Rischio/dipendenze:** più warning su dati incompleti, ma nessun nuovo blocco sui minimi.
- **Accettazione:** rosa completa senza warning; 12 e 14 titolari segnalati; test con ruolo `null`.

#### P2-03 — Versioni `NULL`, pagamenti e privilegi eccessivi — **rinviata**
- **Tipo:** technical improvement / concurrency e least privilege.
- **Problema ed evidenza:** confronti RPC `version <> p_version` non si attivano con `NULL`; Quote sovrascrive due flag senza versione; i default Supabase lasciano privilegi `TRUNCATE/REFERENCES/TRIGGER` ai ruoli API. Non è dimostrato un exploit PostgREST per questi privilegi.
- **Soluzione:** `IS DISTINCT FROM`, validazione input, versione per `team_season`, revoca privilegi non necessari e test SQL positivi/negativi.
- **Valore:** meno lost update e migliore difesa in profondità.
- **Complessità:** media. **Rischio/dipendenze:** migrazione coordinata e test RLS ampliati.
- **Accettazione:** versioni mancanti/stale rifiutate, audit intatto, update concorrenti dei pagamenti rilevati, privilegi minimi verificati in CI.

#### P2-04 — R-24 e consumo dei diritti restricted — **fatta** (branch `feat/restricted-r24`, migrazione `20261026230000_restricted_rights.sql` da applicare)
- **Tipo:** bug fix / workflow.
- **Problema ed evidenza:** dopo un pareggio l'admin deve ricordare il checkbox `unrestricted`; la vecchia riga `last_contracts` non viene consumata e può ricomparire dopo un successivo taglio.
- **Soluzione:** derivare il secondo contratto dalla storia, registrare l'esito dell'asta e aggiornare i diritti nella stessa transazione.
- **Valore:** evita due prelazioni consecutive e badge obsoleti.
- **Complessità:** media/alta. **Rischio/dipendenze:** modello del ciclo asta e migrazione; non risolvere con un default UI.
- **Accettazione:** secondo contratto sempre unrestricted, vecchio diritto non riemerge, chiusura successiva coerente.
- **Esito:** trigger `contracts_consume_right` su `contracts` (stessa transazione di firma e asta dei tagliati, RPC invariate): se l'ultima riga di `last_contracts` è restricted, il nuovo contratto è unrestricted e la riga passa a `restricted = false` con `consumed_by_contract_id`/`consumed_at`. `signingRestriction` in `cap.ts` e il checkbox bloccato in /admin/firma avvisano l'admin; test in `cap.test.ts` e `rls.sql`.

#### P2-05 — Navigazione completa del listone — **rinviata**
- **Tipo:** UX improvement.
- **Problema ed evidenza:** `/giocatori` limita a 100 risultati senza paginazione; “liberi” include anche tagliati/restricted perché significa senza contratto.
- **Soluzione:** paginazione/carica altri via URL e etichette che distinguano “senza contratto”, “in asta tagliati” e “restricted”.
- **Valore:** accesso a tutto il listone e meno ambiguità in asta.
- **Complessità:** bassa/media. **Rischio/dipendenze:** conservare filtri e ordinamento stabile.
- **Accettazione:** oltre 100 risultati raggiungibili, filtri persistenti, stati conteggiati senza contraddizioni.

#### P2-06 — Draft guidato dalle impostazioni e accessibilità operativa — **rinviata**
- **Tipo:** bug fix / UX e accessibility.
- **Problema ed evidenza:** `/draft` usa `[1,2,3,4,5]` e testo “3 anni” invece di `draftRounds/pickHorizonYears`; tabelle senza prima colonna sticky; sigle spesso solo in `title`; login/listone con label migliorabili; manca skip link.
- **Soluzione:** leggere impostazioni, rendere scroll e riferimenti utilizzabili da tastiera/touch, label visibili e skip link.
- **Valore:** configurazioni future corrette e uso più efficace da telefono/tastiera.
- **Complessità:** media se trattata come incremento completo. **Rischio/dipendenze:** QA reale sulle route, non solo build.
- **Accettazione:** cambiare impostazioni aggiorna la matrice; nessuna informazione essenziale solo tooltip; focus e target 44 px verificati.

#### P2-07 — Storico pubblico scambi e dettaglio audit — **rinviata**
- **Tipo:** new feature.
- **Problema ed evidenza:** `trades` e `audit_log.before/after` esistono, ma viewer non hanno storico scambi e admin non vedono operatore/dettaglio.
- **Soluzione:** route pubblica di sole letture dagli stessi dati; dettaglio admin con paginazione e serializzazione sicura.
- **Valore:** memoria della lega e accountability senza nuove integrazioni.
- **Complessità:** media. **Rischio/dipendenze:** definire presentazione payload e dati storici incompleti importati dal foglio.
- **Accettazione:** viewer legge solo trade autenticati, nessun dato `audit_log` esposto ai viewer, empty state per storico assente.

#### P2-08 — Robustezza runtime e lettura profilo — **rinviata**
- **Tipo:** technical improvement.
- **Problema ed evidenza:** `loadProfile()` trasforma errori query in viewer; CI usa Node 22 ma `package.json` non dichiara runtime/package manager; audit completo segnala dipendenze moderate nel solo import ExcelJS, zero production advisory al momento dell'audit.
- **Soluzione:** propagare errore di disponibilità senza cambiare fallback per profilo assente; dichiarare Node/package manager; monitorare aggiornamenti ExcelJS/uuid senza upgrade non verificati.
- **Valore:** errori meno fuorvianti e ambienti riproducibili.
- **Complessità:** bassa. **Rischio/dipendenze:** verifica Vercel e test degli stati errore.
- **Accettazione:** errore DB non diventa 404 admin/viewer silenzioso; runtime coerente; nessuna vulnerabilità presentata come exploit senza prova.

### P3 — Exploratory

#### P3-01 — Calendario, scadenze operative e notifiche
- **Tipo:** exploratory idea / new feature.
- **Problema:** date di deposito, scambi riserve e aste sono oggi gestite fuori dall'app.
- **Evidenza:** `OPEN-QUESTIONS.md` conferma calendario manuale; non esistono date o subscription nel modello.
- **Proposta:** prima calendario editoriale admin, poi reminder opt-in; niente servizio a pagamento.
- **Valore:** riduce scadenze dimenticate. **Complessità:** alta. **Dipendenze:** decisioni su fusi, destinatari, provider e costi.
- **Accettazione della scoperta:** calendario reale della lega e canale sostenibile prima di implementare.

#### P3-02 — Trend e statistiche sportive
- **Tipo:** exploratory idea.
- **Problema:** mancano confronti di rendimento e forma.
- **Evidenza:** non ci sono punteggi/formazioni nel database e restano esplicitamente su Dunkest.
- **Proposta:** valutare solo una fonte affidabile e sostenibile; non inventare metriche dai salary.
- **Valore potenziale:** decisioni sportive più informate. **Complessità:** alta. **Dipendenze:** licenza, aggiornamenti, costi e prodotto.
- **Accettazione della scoperta:** dataset e uso concreto validati; non è una giustificazione per grafici decorativi.

#### P3-03 — Cap planner multi-scenario
- **Tipo:** exploratory idea / decision support.
- **Problema:** le scadenze mostrano impegni nominali ma non scenari completi di option, tagli e bonus futuri.
- **Evidenza:** contratti e quote esistono; bonus futuri e decisioni admin non sono noti.
- **Proposta:** dopo i totali P2-01, scenari espliciti “option esercitata/non esercitata” e cap base, senza propagare bonus come se fossero certi.
- **Valore:** pianificazione pluriennale. **Complessità:** media/alta. **Dipendenze:** UX scenari e regole chiarite.
- **Accettazione:** ogni assunzione visibile, nessun dato futuro presentato come ufficiale.

## 6. UX e accessibilità trasversali

- Mantenere il design Front Office esistente; callout e testo semantico sono preferibili a nuove card, grafici o gradienti.
- Gli stati finanziari devono usare testo, non solo colore; i crediti restano a un decimale e gli euro a due.
- Le informazioni affidate a `title` (sigle, option, warning) non bastano su touch; trattarle in un incremento dedicato con QA.
- I controlli del simulatore e le liste dense devono mantenere target 44 px, focus visibile e nessuna scrittura viewer.
- Loading/error esistono a livello di area lega; la verifica mirata delle route modificate deve coprire empty/populated e, dove sicuro, errori di validazione senza mutare dati reali.

## 7. Stato della presente PR e limiti

Implementato: **P1-01, P1-02, P1-07, P1-08, P2-01, P2-02**. Nessuna migrazione, nuova dipendenza, modifica RLS/RPC, regola numerica o comportamento di autenticazione.

Rinviato deliberatamente: import atomico, concorrenza DB, R-24/R-25/R-26, storico pubblico, paginazione listone, accessibilità trasversale completa, calendario/notifiche e statistiche esterne. Questi interventi hanno dipendenze o un blast radius che meriterebbe PR separate.

## 8. Validazione del branch

- Suite completa: **10 file, 118 test superati**; include massimi negli scambi 1-per-2, miglioramento da rosa già oltre limite, 14° titolare, totali scadenze e formatter euro.
- `npm run typecheck`, `npm run lint`, `npm run build` e `git diff --check`: superati.
- Smoke test della build locale: `/login` risponde 200; `/scambio` e `/scadenze` senza sessione reindirizzano al login. Nessuna scrittura admin o su dati reali.
- Review del diff: nessun cambio a query, RPC, RLS, auth, cache, payload delle action o dipendenze; le regole restano in `cap.ts`.
- **Limite:** non era disponibile una sessione browser autorizzata controllabile. Non sono stati acquisiti screenshot né verificati visivamente viewport, dark mode e interazioni delle route modificate. Non sono stati copiati cookie/credenziali o aggirati login e dati per colmare il limite. Il QA autenticato resta richiesto prima del merge.
