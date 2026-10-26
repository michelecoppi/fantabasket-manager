# Fantabasket Redesign — Phase 1 Audit

> Documento storico. La direzione attuale è "Arena Night" in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md): i vincoli di questa fase (niente gradienti, niente rosso e blu insieme, raggi 0–6 px) non valgono più.

Data: 2026-10-23 · Ambito: audit, ricerca e direzione; nessuna modifica all'applicazione.

## 1. Repository e aggiornamento

- Branch corrente: `feat/issue-10-error-boundary`; default remoto: `origin/main` (`main`).
- Commit prima del fetch e dopo i controlli: `0f0f7d7865108d3a60992a8127bdb2e847e5144e`, invariato.
- Upstream del branch: `origin/feat/issue-10-error-boundary`; divergenza `0/0`, quindi nessun merge o rebase necessario.
- Working tree iniziale: solo `.claude/` untracked (contiene `launch.json`). Non è stato letto per esigenze di design né modificato.
- `git fetch --prune origin` riuscito: `origin/main` aggiornato da `b7d91fb` a `ea5c12c`, un nuovo riferimento remoto e vari riferimenti remoti eliminati dal prune. Il branch locale `main` non è stato aggiornato perché non è quello corrente.
- Esito: repository aggiornato in sicurezza nei riferimenti remoti; nessun commit integrato perché il branch corrente era già allineato. Nessun push, reset, clean o modifica alla storia.

## 2. Architettura e UI esistente

**Stack.** Next.js 16.4.2 App Router, React 19.3, TypeScript strict, Tailwind CSS 4 con Turbopack; Supabase (Postgres, Auth, RLS e RPC), deploy Vercel. PWA installabile senza service worker. Dipendenze runtime essenziali: nessuna libreria UI, icone o grafici.

**Struttura e dati.** Pagine in `src/app`, componenti condivisi in `src/components`, regole pure in `src/lib/cap.ts`, costruzione della vista in `src/lib/league.ts`, query in `src/lib/league-server.ts`. Le pagine server leggono come utente autenticato; filtri e simulatori client usano React state. Le scritture admin seguono client desk → server action → RPC transazionale con audit e concorrenza ottimistica. Migrazioni e seed in `supabase/`; import Excel tramite `scripts/import-xlsx.ts`.

**Route principali.**

| Area | Route e funzione |
|---|---|
| Lega | `/`: otto squadre, payroll, cap space, riserve, bonus, quote e avvisi |
| Squadra | `/squadre/[id]`: titolari, riserve, talenti, tagli, pick |
| Giocatori | `/giocatori`: listone Dunkest, filtri e stato libero/occupato/tagliato |
| Draft | `/draft`: matrice pick future e ordine rookie draft |
| Contratti | `/scadenze`: scadenze per stagione, squadra e option |
| Scambi | `/scambio`: simulatore read-only di giocatori/pick e impatto cap |
| Admin | `/admin`, `/admin/firma`, `/admin/rose`, `/admin/scambio`, `/admin/pick`, `/admin/quote`, `/admin/registro` |
| Accesso | `/login`, `/auth/callback`, `/auth/signout`; `proxy.ts` protegge le altre route |

**Workflow e vincoli.** Il prodotto gestisce una lega privata da otto squadre: 13 titolari (5G/5A/3C), 3–6 riserve, contratti e option, tagli con quota, scambi e pick, cap/floor/luxury tax, pagamenti e audit. I viewer leggono e simulano; solo gli admin scrivono. I valori di regola arrivano da `league_settings`. Punteggi, matchup, formazioni settimanali, classifica live e statistiche per-partita **non esistono** e restano su Dunkest (`PLAN.md:71-72`). Non vanno inventati nel redesign.

**UI e asset.** Shell sticky, larghezza `max-w-5xl`, navigazione orizzontale scrollabile; componenti `Card`, `Badge`, `Stat`, `Section`, controlli condivisi e parti di scambio riutilizzate tra viewer/admin. CSS globale con nove token base e dark mode tramite `prefers-color-scheme`; Geist per testo, Barlow Condensed per display. Icone admin SVG inline; asset raster limitati al logo di lega e alle icone PWA. Il logo originale (scudo, corona, pallone e silhouette) è un asset proprio già verificato, non un marchio NBA.

**Test e workflow.** `npm run dev`, `lint`, `typecheck`, `test`, `build`; sette file Vitest per regole, import e feature. CI aggiunge build e test RLS su Postgres Supabase. Le convenzioni richiedono branch/PR per lavori non banali e verifica mobile-first.

## 3. Punti di forza e debolezza del design attuale

**Evidenze positive.**

- La base è già coerente e leggera: token centrali, due font, primitive condivise e nessuna dipendenza UI (`globals.css`, `ui.tsx`, `controls.tsx`).
- La gerarchia dei dati finanziari è comprensibile; numeri tabulari e before/after aiutano firma, taglio e scambio (`StatChange`, `ImpactCard`).
- Mobile-first reale: target minimi da 44 px nei controlli principali, form a griglia e tabelle draft con scroll esplicito.
- Empty/error/404 esistono; pending, disabled, alert e conferme admin proteggono i flussi.
- Il logo proprio offre un punto di partenza identitario più forte di un generico marchio sportivo.

**Evidenze da migliorare.**

- Rosso/blu (`#c8102e`, `#1d428a`), barra scura e condensed replicano la grammatica NBA più di una voce propria; il gradiente rosso/blu in header/login è decorativo e non distintivo.
- Card e liste con lo stesso bordo/raggio vengono ripetuti per quasi ogni contenuto; la stessa barra rossa a sinistra marca molte sezioni. Ne risulta una gerarchia uniforme, non editoriale.
- Home e admin sono griglie di card; rose/giocatori/scadenze sono liste quasi identiche. Mancano pattern specifici per scouting, salary cap e confronto tra squadre.
- Non esiste un visualizzatore cap dedicato: payroll, cap effettivo, spazio e riserve sono numeri separati, pur essendo il cuore del prodotto.
- La fotografia sportiva è assente e non ci sono fonti/licenze per aggiungerla. Una direzione basata su grandi hero editoriali sarebbe quindi fragile.
- `max-w-5xl` contiene bene la lettura ma limita tabelle e desk admin su schermi ampi; il caricamento è un unico testo generico e non preserva la struttura della pagina.
- Il tema segue solo il sistema e non offre scelta esplicita. Questo non richiede necessariamente un toggle, ma va deciso nella fase dei token.

**Confini del redesign.** Si possono cambiare in modo indipendente token, shell, primitive, gerarchia e presentazione delle pagine. Devono restare invariati route/search param, contratti `LeagueView`, dati mostrati, regole in `cap.ts`, action/RPC, RLS/auth, audit, conferme e persistenza. Le parti di scambio condivise richiedono QA sia viewer sia admin.

## 4. Riferimento NBA

**Accesso effettivo, 2026-10-23.** Non è disponibile un browser grafico/screenshot. Sono stati ispezionati testo, HTML e CSS pubblici; questo permette osservazioni su contenuti e implementazione, non una verifica completa del rendering responsive.

- [Home](https://www.nba.com/): 403 con entrambi gli strumenti; non dichiarata ispezionata visivamente.
- [News](https://www.nba.com/news): headline, hero e lista “Latest”; HTML con immagini editoriali 1920×1080 e `srcSet` 16:9 (hero ~784×441, righe ~192×112), alt descrittivi e titoli con clamp.
- [Games](https://www.nba.com/games): calendario, stato live/pregame, punteggio/orario, box score/preview e leader PTS/REB/AST; i dati contestuali completano il game card senza trasformarlo in una tabella generale.
- [Standings](https://www.nba.com/standings): stagione, raggruppamento e legenda degli stati; il testo estratto non espone le righe dinamiche, quindi non si deduce il dettaglio visivo della tabella.
- [Stats](https://www.nba.com/stats): filtri per stagione, tipo e modalità; contenuto dinamico non verificabile con il solo testo estratto.
- CSS pubblico collegato da News: palette ricorrente con `#1d428a`, `#c8102e`, `#051c2d`, neutri freddi e colori funzionali; font `Knockout`/wide, `Roboto` e condensed/table; breakpoint frequenti 768/1024 px e ulteriori 640/1280/1440 px.

**Principi riutilizzabili, non layout da copiare.**

1. Separare il livello “headline” da quello operativo: un titolo forte, poi dati densi e stabili.
2. Usare immagini con crop intenzionale e gerarchia coerente, mai come riempitivo; qui servono asset propri o nessuna fotografia.
3. Nei moduli sportivi dare priorità a stato, identità e numero chiave; dettagli e legenda restano secondari.
4. Alternare superfici editoriali ampie e tabelle compatte; non applicare lo stesso contenitore a tutto.
5. Usare il colore di lega/squadra come identificatore, non come rumore su ogni elemento; stati e numeri devono restare leggibili senza colore.
6. Su mobile cambiare priorità e composizione, non semplicemente ridurre il desktop.

Non sono stati copiati loghi, immagini o layout NBA. Nessun riferimento aggiuntivo è necessario: il dominio del prodotto è più vicino a un front office che a un portale news.

## 5. Tre direzioni creative

### A — League Newsroom (NBA Editorial)

- **Identità:** racconto della stagione con headline, momenti e rivalità; sensazione di magazine professionale.
- **Tipo/colore:** display condensed molto grande, testo altamente leggibile; superfici bianco/inchiostro, accento di lega misurato, immagini a tutta larghezza solo quando pertinenti.
- **Navigazione/layout:** masthead editoriale, home narrativa, sezioni “In evidenza” e “Operazioni”; dati in moduli compatti.
- **Componenti:** player row con ritratto/crop solo se licenziato; tabelle pulite con header rigorosi; “scoreboard” riservato a veri eventi, non inventato. Cap e scambi diventano storie con numeri before/after.
- **Riconoscibilità:** titolazione e ritmo da redazione, non dashboard.
- **Pro/contro/complessità:** massima immediatezza emotiva, ma il sito non ha news, punteggi o foto; richiederebbe contenuti e asset nuovi. **Media-alta** e poco sostenibile oggi.

### B — Front Office (raccomandata come base)

- **Identità:** sala operativa della lega: cap, asset, contratti e decisioni. Autorevole, precisa, densa ma mai affollata.
- **Tipo/colore:** Barlow Condensed per titoli e grandi cifre, Geist per testo; numeri tabulari. Superfici carta/inchiostro con dark mode, neutri proprietari e accenti derivati con criterio dal logo; rosso per rischio/azioni critiche, non ovunque.
- **Navigazione/layout:** shell compatta, home come panoramica della lega, maggiore larghezza solo per desk e tabelle; navigazione admin separata ma coerente.
- **Componenti:** player row da scouting (ruolo, identità, squadra NBA, crediti, proprietà); tabelle con header/column alignment chiari; “cap line” orizzontale con cap effettivo, payroll, tagli e spazio; trade board a due lati con ledger prima/dopo. Nessun game scoreboard finto.
- **Riconoscibilità:** cap line e trade ledger diventano la firma funzionale del prodotto; il logo compare con misura.
- **Pro/contro/complessità:** perfetta per dati e flussi esistenti, riusa molto; rischio estetica troppo tecnica se manca una gerarchia espressiva. **Media**.

### C — Basketball Culture

- **Identità:** poster da lega tra amici, energia da playground, corona/scudo del logo e motivi da parquet/court lines usati con funzione.
- **Tipo/colore:** condensed espressivo, numeri oversize, palette più calda e contrastata, superfici alternate e accenti di squadra.
- **Navigazione/layout:** composizioni più asimmetriche su home/squadra; strumenti admin più convenzionali per non ostacolare il lavoro.
- **Componenti:** player row con “jersey number” solo se esiste davvero, altrimenti ruolo; pick come biglietti da draft senza eccesso di card; cap come metro grafico; confronto scambio a versi.
- **Riconoscibilità:** tono proprio e meno derivativo dai portali sportivi.
- **Pro/contro/complessità:** memorabile e adatto a una lega privata, ma può diventare decorativo, rumoroso o poco accessibile; richiede più art direction e QA. **Media-alta**.

## 6. Direzione raccomandata

**Front Office editoriale:** B come sistema operativo, con la gerarchia tipografica di A e una quantità limitata del calore di C. La home deve rispondere subito a “come va la mia squadra e quali asset ho?”; le pagine operative a “posso fare questa mossa e con quale effetto?”.

La **cap line** è la firma proposta perché nasce da dati reali e può ricomparire in home, squadra, firma, taglio e scambio. Il logo e la titolazione danno personalità senza fingere contenuti NBA o richiedere fotografie. Non introdurre classifiche live, score di partite, statistiche giocatore o foto non licenziate.

## 7. Skill create e utilizzo

Non esistevano skill nel repository né una convenzione locale già definita. Sono stati creati quattro `SKILL.md` con frontmatter `name`/`description` in `.agents/skills/`, formato project-local riconosciuto dal catalogo skill di questa sessione:

- `.agents/skills/sports-art-direction/SKILL.md`: direzione, token, identità, asset e accessibilità.
- `.agents/skills/frontend-design/SKILL.md`: implementazione incrementale nell'architettura esistente.
- `.agents/skills/visual-qa/SKILL.md`: browser, screenshot, stati, viewport e check tecnici.
- `.agents/skills/code-review/SKILL.md`: protezione di regole, dati, auth e routing.

Richiamare `sports-art-direction` prima del redesign, `frontend-design` durante l'implementazione, poi `visual-qa` e `code-review`. Il loro caricamento automatico in altri strumenti/sessioni non è stato verificato; non vanno considerate regole globali al posto di `CLAUDE.md`.

## 8. Roadmap proposta per Phase 2+

1. **Phase 2 — Fondamenta visive:** approvare direzione e firma; definire token semantici, scala, superfici, stati e primitive; rinnovare shell e stati loading/error. Una pagina pilota read-only come riferimento.
2. **Phase 3 — Consultazione:** home e cap line, squadra, giocatori, draft e scadenze; responsive delle liste/tabelle e contenuti vuoti.
3. **Phase 4 — Decisioni:** simulatore viewer e desk admin (firma, rose, scambio, pick, quote, registro), preservando action, conferme e dati before/after.
4. **Phase 5 — Verifica e rifinitura:** matrice desktop/tablet/mobile, chiaro/scuro, viewer/admin, stati e contenuti limite; accessibilità, console/network, test completi e revisione dei diff.

Ogni fase deve essere incrementale e separata da chiusura stagione, talenti/rookie o nuove feature funzionali.

## 9. Rischi, incognite e tooling

- Nessun browser/screenshot installato o disponibile: non sono state eseguite verifiche visuali sul sito locale né su NBA.com. In Phase 2 serve tooling browser autorizzato.
- Home NBA e `/players` hanno risposto 403; WebSearch non disponibile per quota. La ricerca si limita alle pagine e al CSS effettivamente accessibili.
- Fonti e licenze di foto/loghi NBA non verificate: nessun asset esterno va usato senza approvazione. La direzione scelta non ne dipende.
- Non testati account viewer/admin reali né dati remoti: nessuna scrittura DB o action admin eseguita.
- Palette e cap line sono proposte, non design approvati; contrasto e comportamento responsive andranno misurati sul rendering.
- I dati incompleti reali (ruoli, durate, nomi provvisori) devono restare visibili come tali e guidare il QA.
- Non è stato eseguito il test RLS perché non sono cambiate tabelle/RPC e serve un Postgres di test configurato.

## 10. Stime indicative

Stime per una persona senior con direzione approvata, browser disponibile e nessuna nuova feature/dipendenza; **sono assunzioni di effort, non impegni**.

| Fase | Evidenza che guida la stima | Complessità | Stima assunta |
|---|---|---|---|
| Phase 2 | 2 fogli di stile/layout centrali, 2 set di primitive, shell unica | Media | 3–5 giorni |
| Phase 3 | 6 route read-only principali, liste ripetute, matrice draft | Media | 5–8 giorni |
| Phase 4 | 7 route admin + simulatore, componenti condivisi e molti stati | Alta | 6–10 giorni |
| Phase 5 | 2 ruoli, 3 viewport, 2 temi, stati reali | Media | 3–5 giorni |

**Totale orientativo: 17–28 giorni.** Sono evidence-based il numero di route, i componenti condivisi e gli stati presenti; sono ipotesi produttività, assenza di revisioni estese, disponibilità di account/dati e nessun lavoro su asset fotografici. Contenuti editoriali o fotografia licenziata richiederebbero una stima separata.

## Verifiche eseguite

- `npm test`: **7 file, 88 test superati**.
- `npm run lint`: superato.
- `npm run typecheck`: superato, route types generati.
- `npm run build`: superato, 21 pagine statiche/PPR generate.
- Audit statico di codice, documentazione, asset e Git completato.
- Non eseguiti: screenshot, browser E2E, console/network del sito, test RLS, azioni admin o verifica dei dati di produzione.
