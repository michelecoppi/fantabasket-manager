# Product roadmap — Fantabasket Manager

Aggiornata al 2026-10-25. Priorità e riferimenti alle evidenze: [PRODUCT_AUDIT.md](PRODUCT_AUDIT.md). Il piano non sostituisce checklist operative e decisioni storiche in [PLAN.md](../../PLAN.md).

## Principi di sequenza

1. Prima correttezza delle decisioni e integrità dei dati, poi nuove superfici informative.
2. Regole condivise in `cap.ts`; nessuna duplicazione nei componenti.
3. Migrazioni e cambi concorrenti in PR dedicate, con test SQL e applicazione coordinata.
4. Niente statistiche, notifiche o integrazioni senza fonte, bisogno e costi verificati.
5. Incrementi visivi limitati al design Front Office e verificati su route reali.

## Ora — PR `feat/product-improvements-audit`

**Tema: decisioni di mercato affidabili.**

- P1-01: massimi di rosa applicati agli scambi nello stesso validatore viewer/admin.
- P1-02: errori e warning globali visibili nel simulatore; stati cap testualmente corretti.
- P1-07: luxury tax in euro con due decimali in tutte le superfici esistenti.
- P1-08: ruolo reale nella preview del rientro da taglio.
- P2-01: totali contratti, crediti e opzioni nelle scadenze filtrate.
- P2-02: warning sul totale titolari, inclusi giocatori senza ruolo.

**Perché ora:** frequenza d'uso, evidenza alta, piccole modifiche a codice e test esistenti, nessuna migrazione o dipendenza. Il simulatore e le action continuano a condividere le regole; il viewer resta in sola lettura.

**Completamento richiesto:** test dei casi limite, lint, typecheck, build, `git diff --check`, QA mirato delle route modificate quando disponibile e PR su `main` senza merge automatico.

## Prossimo — integrità delle scritture e del ciclo stagione

Ordine consigliato:

1. **P1-03 import atomico e stagionale.** Definire staging/RPC, preservare storico e dimostrare rollback su copia. È il rischio con maggiore blast radius perché l'import cancella e ricrea dati.
2. **P2-03 hardening versioni, pagamenti e privilegi.** `IS DISTINCT FROM`, versione `team_season`, validazione runtime e revoche; test RLS/RPC con esiti positivi, conflitti e audit.
3. **P1-06 serializzazione delle invarianti di rosa e chiusura.** Lock/revisioni nella stessa transazione e test concorrenti. Dipendenza esplicita per l'attivazione di `SEASON_CLOSE_ENABLED`.

**Perché separate:** richiedono migrazioni, test su Postgres e coordinamento con il database reale. Non vanno nascosti in una PR di prodotto read-only.

## Poi — completare le regole d'asta e i contratti

1. **P1-05 rookie max due anni:** aggiungere `rookie_max_years` a migrazione, seed, `LeagueSettings`, loader e validatori; coprire firma, modifica e durate massive.
2. **P1-04 minimo R-25:** chiarire arrotondamento e durata esatta del vincolo, poi mostrare ultimo stipendio/minimo e validare server-side anche l'assegnazione dei tagliati.
3. **P2-04 diritti restricted (fatta):** modellare consumo del diritto e secondo contratto unrestricted senza affidarsi a un checkbox.
4. **P2-05 listone completo:** paginazione e distinzione tra senza contratto, tagliati e restricted; prepara la UI alle informazioni R-25.

**Dipendenze:** decisioni di lega scritte, migrazioni applicate e test su entrambi i percorsi di firma. Non introdurre valori numerici hardcodati.

## Miglioramenti di consultazione e accessibilità

- **P2-06:** Draft derivato da `draftRounds/pickHorizonYears`, label e legende non basate solo su tooltip, skip link, tabelle e target touch; QA mobile/tastiera.
- **P2-07:** storico pubblico scambi da `trades`, poi dettaglio operatore/before-after nel registro admin. Verificare qualità dei dati importati e non mostrare `audit_log` ai viewer.
- **P2-08:** errori profilo espliciti, runtime dichiarato e dependency hygiene.
- **P3-03:** planner multi-scenario solo dopo che i totali P2-01 risultano utili; cap base e assunzioni sempre espliciti.

Questi incrementi possono essere parallelizzati dopo le correzioni, ma ognuno deve avere acceptance criteria e QA propri.

## Da validare prima di investire

- **P3-01 calendario/notifiche:** raccogliere date reali, fuso, destinatari e canale gratuito sostenibile. Iniziare eventualmente da un calendario editoriale, non da notifiche automatiche.
- **P3-02 statistiche sportive/trend:** serve una fonte attendibile e un caso d'uso distinto da Dunkest. Punteggi e formazioni restano fuori scope; dal 2026-10-27 fanno eccezione infortuni, punteggio medio e partite giocate da Dunkest (Fase 5 di PLAN.md, issue #68).
- **Squadra talenti/rookie:** resta bloccata dalle domande già aperte sulle prelazioni; non dedurre regole dal foglio.
- **Pagelle degli scambi («chi ha vinto lo scambio»):** nello storico, per ogni scambio, PDK ricevuto contro PDK ceduto. Aspetta che `trades` abbia righe (0 il 2026-10-29). Limite da dichiarare: `dunkest_stats` ha la media stagionale, non il rendimento dalla data dello scambio; per quello servirebbe lo storico partita per partita.
- **Sondaggi della lega:** votazioni sulle ASSUNZIONI di [OPEN-QUESTIONS.md](../OPEN-QUESTIONS.md) da confermare (scambi a più squadre, slot negli scambi, minimo d'asta...). Serve una tabella in cui ogni utente scrive solo il proprio voto (RLS `user_id = auth.uid()`): è un'eccezione alla regola «viewer in sola lettura» e va decisa prima di iniziare.

Fase 6 (premi della giornata, affari e flop, rivalità, andamento in classifica): piano in [PIANO-FASE-6.md](PIANO-FASE-6.md).

## Misura del successo

- Il simulatore e l'admin producono lo stesso esito per cap, rosa e pick.
- Nessun importo luxury tax viene arrotondato in modo diverso dal dovuto.
- Un proprietario legge crediti e opzioni in scadenza senza somme manuali.
- Import e chiusura non possono lasciare stagioni parziali o scritture fuori stagione.
- Le regole R-24/R-25/R-26 sono visibili prima dell'azione e verificate sul server.
- Le nuove superfici usano dati reali, spiegano le assunzioni e non introducono costi ricorrenti non approvati.
