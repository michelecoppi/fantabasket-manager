# Design system — Arena Night

Direzione attiva dal 2026-10-26 (sostituisce "Front Office editoriale" della Phase 2). Il sito è il palazzetto della lega: header (bianco al chiaro, nero al buio) e ticker come lo scoreboard di NBA.com, superfici "arena" con le linee del campo, cifre da tabellone, colori del logo. Resta un gestionale: i dati reali vengono prima della decorazione e nessun contenuto NBA (foto, loghi, punteggi, classifiche live) viene inventato o copiato.

Leggere prima di toccare la UI. Le skill locali in `.agents/skills/` (`sports-art-direction`, `frontend-design`, `visual-qa`, `code-review`) rimandano a questo file.

## Dove sta cosa

| File | Contenuto |
|---|---|
| `src/app/globals.css` | Token colore (chiaro/scuro), `.font-display`, `.eyebrow`, `.tnum` (in `@layer components`: le utility accanto vincono), superfici `.arena`/`.sweep`/`.jumbo`/`.outline-text`, animazioni (`.rise`, `.pop`, `.meter-fill`, `.skeleton`, `.ball-bounce`, `.ball-spin`, `.lift`), view transition |
| `src/app/layout.tsx` | Font: Archivo (`--font-body`) e Big Shoulders (`--font-display`) via `next/font` |
| `src/components/icons.tsx` | `Icon` (tracciati Tabler Icons, MIT) e `BallLoader` |
| `src/components/crest.tsx` | `TeamCrest`: scudo nel colore della squadra con monogramma; `morphId` per la view transition |
| `src/lib/team-colors.ts` | `teamColors(ids)` (8 colori, stabili per id) e `monogram(name)` |
| `src/components/ui.tsx` | `PageTitle`, `Scoreboard`, `Section`, `Card`, `Badge`, `Stat`, `StatChange`, `Empty`, `PosChip`, `ContractPips`, `RestrictionBadge`, `stagger()` |
| `src/components/controls.tsx` | `Button` (primary, secondary, danger, gold, ghost), `SubmitButton`, `Field`, `Segmented`, `Callout`, `Check`, `inputClass` |
| `src/components/cap-line.tsx` | `CapLine`, il cap meter |
| `src/components/player-row.tsx` | `PlayerRow` / `PlayerList` per rose e scadenze |
| `src/components/chips.tsx` | `ChipLinks`: filtri come link nella query string |
| `src/components/count-up.tsx` | `CountUp`: cifra che sale (solo per il numero eroe di una pagina) |
| `src/components/league-ticker.tsx` | Ticker delle squadre sotto l'header; `ticker-scroll.tsx` lo fa scorrere quando non ci sta (bordi sfumati, frecce col mouse) |
| `src/components/use-scroll-edges.ts` | `useScrollEdges` e `edgeMask`: sfumano i bordi delle strisce che scorrono (ticker, chip) |
| `src/components/dunkest.tsx` | Dati Dunkest: `DunkestLogo`, `DunkestSource` (logo + ora dell'ultimo aggiornamento o stato), `InjuryChip` (OUT rosso, GTD oro, «Out stagione» rosso pieno), `PdkCell` (punteggio medio in blu con tacca di confronto col ruolo e partite giocate), `PlayerSheet` + `SheetTrigger` (scheda giocatore a comparsa) |
| `src/components/dunkest-league.tsx`, `matchday-strip.tsx` | Lega su Dunkest: `LeagueSource` (fonte e stato, «in attesa del nuovo token»), `StandingsTable` (classifica), `FormPips` (V/P/N), `MatchScore` (scontro a due righe), `Lineup` (quintetto, panchina, tribuna), `StatusChip` (avvisi di divergenza); `MatchdayStrip` (giornate, client) |
| `src/components/plan-parts.tsx` | Planner del cap: `KindTag` (Nominale / Calcolato / Ipotesi), `PlanMeter` (meter di stagione a strati), `PlannerLegend`, `CapOutlook` (panoramica della lega) |
| `src/components/cap-planner.tsx` | `CapPlanner` (client): pannello ipotesi, carte stagione, tabellone contratti |
| `src/components/nav.tsx` | `MainNav` (header, da `lg`) e `TabBar` (in basso, sotto `lg`) |

## Firma visiva

1. **Ticker della lega** sotto l'header, su tutte le pagine: una "partita" per squadra con stemma, nome, mini cap meter e spazio salariale. Le partite si allargano fino a riempire la striscia (tutte e 8 visibili da ~1280 px); sotto si scorre, con bordi sfumati e frecce col mouse. Mai tagliare una squadra senza segnalare che la striscia continua. Ordine alfabetico, non è una classifica.
2. **Cap meter** (`CapLine`): payroll sul cap effettivo, tacca del salary floor, parte sforata a strisce rosse oltre la linea del cap. Si riempie all'ingresso. Compare in home, pagina squadra, ticker e scambio.
3. **Stemmi di squadra** (`TeamCrest`): scudo con monogramma nel colore della franchigia; bordo e corona oro per la squadra dell'utente. Lo stemma "vola" dal board alla pagina squadra (view transition `crest-<id>`).
4. **Superficie arena** (`.arena`): linee del campo in SVG e due luci (blu in alto a destra, rossa in basso a sinistra). Nel tema chiaro è carta bianca con linee blu al 6%, luci appena accennate e un bordo `line`; nel tema scuro blu notte con linee bianche al 7%. Per testate di pagina, hero, login, errori e pochi pannelli in evidenza (MVP, carta della classifica nella pagina squadra, riepilogo della vetrina). Mai per tabelle o form.
5. **Cifre da tabellone**: Big Shoulders 800–900 maiuscolo; il numero eroe di una pagina in oro con bagliore (`.jumbo`).

## Colore

Palette dal logo: blu reale dello scudo, rosso del pallone, oro della corona, su inchiostro blu-nero. Tutti i valori sono token in `globals.css`; nei componenti si usano le classi (`bg-surface`, `text-muted`, `bg-gold`...), non esadecimali. Eccezioni ammesse: i colori squadra (dinamici, via `style`) e i rossi/verdi chiari su superficie arena (`#ff8a95`, `#7be3b4`).

| Token | Chiaro | Scuro | Ruolo |
|---|---|---|---|
| `background` | `#f6f7fb` | `#070b14` | fondo pagina (chiaro e neutro / notte) |
| `surface` / `surface-subtle` | `#ffffff` / `#eceff5` | `#0f1627` / `#18213a` | carte, tabelle / zone secondarie |
| `line` | `#e2e6ee` | `#26314f` | bordi e separatori |
| `foreground` / `muted` | `#0b1220` / `#566176` | `#eef2fb` / `#97a3bd` | testo |
| `nav` | `#060a14` | `#03060d` | inchiostro: testo sopra l'oro (`text-nav`), piccoli accenti scuri |
| `arena` / `chrome` | `#ffffff` / `#ffffff` | `#0a1022` / `#03060d` | superfici arena; header, tab bar e barre fisse (`.chrome`) |
| `board` | `#f6f8fc` | blu notte all'85% | celle dello `Scoreboard` e riquadri dentro l'arena |
| `arena-bad` / `arena-good` / `arena-warn` | rosso / verde / oro scuro dei token di stato | `#ff8a95` / `#7be3b4` / oro | stati scritti sopra arena e chrome |
| `brand-blue` | `#1d47b5` | `#7aa0ff` | link, selezione, payroll entro cap, ruolo G |
| `brand-red` / `accent` / `danger` | `#cf2338` | `#e43a4e` / `#ff6170` | azione primaria, cap sforato, errori, ruolo C |
| `gold` | `#f4b42a` | `#f8c24a` | CTA nelle superfici scure, focus, "la tua squadra", voce di nav attiva, ruolo A. Testo sopra: sempre `text-nav` |
| `highlight` / `warning` | `#8a5a00` | `#f8c24a` | oro come testo su chiaro, avvisi |
| `success` | `#12784f` | `#4fd39a` | quote pagate, spazio positivo |

Regole:
- Il colore non è mai l'unico segnale: stati con testo o icona (`Badge icon`, `Callout`).
- Rosso = rischio o azione primaria; mai decorazione. Oro = attenzione positiva/identità; al massimo un CTA oro per schermata.
- Colori squadra (`TEAM_COLORS`) solo per identità: stemma, filo laterale della riga, tinta di selezione. Mai per stati.
- Gradienti ammessi solo: luci dell'arena, filo broadcast rosso→blu→oro sotto l'header, riempimento del cap meter.
- **Tema chiaro senza blocchi scuri** (decisione dell'utente del 2026-10-29): arena e chrome diventano carta. I componenti scritti per il fondo scuro (`text-white`, `text-white/60`, `bg-white/10`, `border-white/12`) non cambiano: dentro `.arena` e `.chrome` il tema chiaro ridefinisce `--color-white` come inchiostro, e lo rimette bianco solo sui fondi pieni (`bg-brand-blue`, `bg-danger`... confrontati con `~=`, quindi non le tinte come `bg-brand-blue/10`). Oro come testo: `text-highlight` (oro scuro al chiaro, oro allo scuro), mai `text-gold` su fondo chiaro. Stato selezionato di chip, linguette e tab: blu pieno con testo bianco al chiaro, oro con testo `nav` allo scuro.

## Tipografia

- **Big Shoulders** (`.font-display`, maiuscolo): titoli, navigazione, bottoni, cifre. Pesi 700/800/900. Titolo di pagina `clamp(2.75rem, 7vw, 5rem)`; hero fino a `8.25rem`; sezione `text-3xl`; cifre di tabella `text-2xl`–`text-4xl`.
- **Archivo**: testo, form, metadati. 12–16 px.
- `.eyebrow` (11 px, maiuscolo, tracking 0,14em) solo per etichette di dato e intestazioni di colonna, non sopra ogni blocco.
- Valori in crediti sempre con `tnum`/`tabular-nums` e `fmt()`; euro con `fmtEuro()`.

## Forma, spazio, profondità

- Raggi: carte e liste `rounded-2xl`, controlli `rounded-lg`, chip e badge `rounded-full`, testate arena `rounded-2xl`/`rounded-3xl` (a tutta larghezza su mobile).
- Ombre leggere solo su elementi sollevati (`.lift` all'hover, CTA oro/rosso, header). Il resto usa bordi `line`.
- Shell fino a 1440 px; padding 16/24/40 px. Ritmo 4/8 px; sezioni `mt-12`.
- Desktop: colonne laterali per le informazioni secondarie (pagina squadra: rosa a sinistra, pick/talenti/tagli a destra; scadenze: anno appiccicoso a sinistra).

## Componenti chiave

- **Header** (`.chrome`): bianco con ombra leggera nel tema chiaro, nero nello scuro; logo + "Fantabasket / League office", `MainNav` con icone (attiva blu al chiaro, oro allo scuro) e sottolineatura oro animata, utente, aggiorna (pallone che gira), esci. Filo broadcast di 3 px. Sull'app installata su iPhone la barra di stato ha sempre testo bianco: sotto c'è una striscia `nav` alta quanto la safe area (zero nel browser). Da `lg` a `xl` la scritta accanto al logo e il badge utente si nascondono, così il menu (6 voci per gli admin) non viene mai tagliato.
- **TabBar** (`.chrome`, sotto `lg`, quindi anche su tablet): 5–6 voci con icona ed etichetta, voce attiva blu (oro allo scuro) con la barra oro, safe area iOS. Il `main` ha `pb-28` per non finirci sotto.
- **PageTitle**: banda arena con icona oro, eyebrow, titolo, sottotitolo e `aside` (di solito uno `Scoreboard` con 3–4 numeri reali della pagina).
- **Filtri**: preferire `ChipLinks` (un tocco, stato nell'URL) a select + "Applica". Le select restano dove le opzioni sono molte (listone).
- **PlayerRow**: `PosChip` (G blu, A oro, C rosso, `?` tratteggiato), nome, contesto, badge r/u, `ContractPips` (pallini pieni = stagioni, mezzo = mezza stagione, tratteggiato blu = team option, `?` = durata da fissare), crediti.
- **Trade machine** (`/scambio` e `/admin/scambio`, `TradeMachine` in `trade-parts.tsx`): da 2 a `tradeMaxTeams` squadre. In alto una striscia di chip (stemma + nome, `+` per aggiungere, `×` per togliere, contatore «2/4»), che scorre su telefono. Rose: una linguetta per squadra (stile `ViewSwitch`, con il numero di cessioni nel colore squadra) finché le colonne non ci stanno (2 squadre da `md`, 3 da `lg`, 4 da `xl`); in ogni rosa titolari e riserve con intestazione appiccicosa e totale, righe da 44 px con checkbox nativo nascosto. Sotto un giocatore ceduto: destinazione come stemmi delle altre squadre (solo da 3 squadre) e «Titolare / Riserva». Barra scura dell'esito (`TradeDock`) che segue lo scorrimento sopra la tab bar: stemmi, movimenti, verdetto, salto a «Esito». Esito: una carta per squadra con «Riceve» (riga con ruolo, nome, crediti e stemma di chi cede), «Cede», tre `StatChange compact` e cap meter compatto.
- **Dati Dunkest** (issue #68): fonte sempre dichiarata con `DunkestSource` (logo Dunkest + «agg. 27 ott, 09:02»; avviso oro se l'ultimo aggiornamento è fallito). Nelle righe giocatore il PDK è blu (non nero come i crediti) con una tacca: riempimento = punteggio sul migliore del ruolo, linea = media del ruolo; «pg» sotto. Il chip infortunio sta accanto al nome anche su telefono. Tutta la riga apre la `PlayerSheet`: popover nativo (niente JS), foglio dal basso su telefono e finestra centrata da 640 px, testata arena con `Scoreboard` (PDK in oro), barra di confronto col ruolo con ▲/▼ sulla media, posizione nel ruolo, punti/rimbalzi/assist, infortunio. Pagina squadra: sezione «Infermeria» (infortunati dal più grave, «Rosa al completo» se nessuno). Il logo Dunkest è un marchio della fonte: solo accanto ai dati, mai decorazione.
- **Lega su Dunkest** (issue #72, `/classifica`): classifica come tabella da broadcast: posizione grande (il primo in oro testo `highlight`), stemma, proprietario, forma con tessere V/P/N (lettera + colore), record V–P, punti in blu con una barra sul leader dei punti; la propria squadra col filo oro a sinistra. Scontri come tabellone a due righe (casa sopra), chi è avanti in grassetto con freccia verde, l'altro in grigio; nell'ultima giornata si dice «in testa» perché può essere in corso. Lo scontro si apre (`details`) sulle due formazioni: quintetto, panchina (sesto uomo con chip blu «6°», capitano con cerchio oro «C»), tribuna come gettoni tratteggiati. I giocatori che non tornano con le rose hanno il chip «Riserva» (oro) o «Di …» / «Non in rosa» (rosso) e la riga velata d'oro. Calendario: striscia di giornate (giocate piene, ultima con punti con anello oro, future tratteggiate) che si centra su quella scelta. Nessuna voce di menu nuova: si arriva da home («Il campionato»), pagina squadra e admin. In `/admin/dunkest`, «Titolari e riserve»: una carta per squadra con «▲ Diventano titolari» (verde) e «▼ Diventano riserve», monte ingaggi prima → dopo (rosso se sfora), avvisi oro e blocchi rossi, pulsante «Allinea»; «Allinea tutte» è l'unico pulsante rosso (azione primaria) della pagina.
- **Fase 6, la lega che si racconta** (`awards.tsx`, `rivalries.tsx`, `standings-chart.tsx`, `value-board.tsx`): **Premi della giornata** come bacheca di tessere (2 colonne su telefono, 3 da `sm`): icona in un quadrato (oro per i premi positivi, blu per quelli neutri, rosso per i premi «al contrario»), etichetta che va a capo, vincitore con stemma, cifra in blu (rossa al contrario) sotto il vincitore; l'MVP è la tessera grande `bg-nav` con la cifra `.jumbo`; bordo oro sui premi della mia squadra; badge «Provvisori» sull'ultima giornata. In home l'MVP dell'ultima giornata chiusa è una striscia scura con corona e link ai premi. **Andamento**: bump chart con una linea per squadra nel suo colore, la squadra in evidenza spessa (le altre al 30%), stemmi a fine linea, legenda come chip-link (`?evidenzia=`), interruttore Posizione/Punti totali (`ChipLinks`); linee in SVG stirato con tratto non scalato, punti ed etichette in HTML, oltre 12 giornate scorre nella carta partendo dall'ultima; tabella `sr-only`. Nella pagina squadra la stessa posizione è una mini linea oro nella carta scura della classifica. **Rivalità**: lista compatta (stemma, barra divisa nei colori delle due squadre, bilancio, ultimo risultato V/P con punti, differenza punti verde/rossa), filo rosso a sinistra per la bestia nera e verde per la vittima preferita, badge con icona `flame`/`target`; testi in seconda persona sulla propria squadra. Sotto ogni scontro in classifica una riga «Precedenti: 2–1 per …» o «Primo incrocio». **Affari e flop** (`/giocatori?vista=affari`, `ViewSwitch` Listone/Affari e flop): due liste affiancate da `lg`, intestazione con icona `trending-up` blu / `trending-down` rossa e filo dello stesso colore; ogni riga ha una pista a due tacche (vuota = posizione per stipendio, piena = posizione per PDK, tratto in mezzo = distanza) e «pagato 125° · rende 38°», poi `PdkCell` e stipendio; tutta la riga apre la `PlayerSheet`. Nella pagina squadra «Il tuo affare» / «Il tuo flop» sono due carte col filo blu/rosso sotto i titolari. Icone nuove (Tabler): `star`, `medal`, `bolt`, `trending-up`, `trending-down`, `mood-sad`, `stopwatch`, `target`.
- **Planner del cap** (issue #46, `/scadenze?vista=planner`): `ViewSwitch` (linguette grandi con icona, stato nell'URL) tra Scadenze e Planner. Ogni numero dichiara la sua natura con `KindTag`: grigio = nominale, blu = calcolato, oro tratteggiato = ipotesi (il tratteggio significa sempre «non certo»: option da esercitare, durate da fissare). `PlanMeter`: titolari pieni, option a strisce, quote dei tagli e durate da fissare col tratteggio `.hatch` (colore del testo), sforamento a strisce rosse, tacca del cap spostata con `transform` e forbice del bonus R-60 come filo oro sotto la pista; gli strati sono a tutta larghezza e ritagliati con `clip-path`, così cambiano scenario senza animare `width`. Scala comune a tutte le stagioni della squadra. Carte stagione: carosello a scatti su telefono (la carta dopo spunta), colonne da `lg`; la stagione corrente ha il filo broadcast in alto, le future il chip «Proiezione». Tabellone: un blocco per stagione, option come casella tratteggiata da toccare (`aria-pressed`), uscita «Pareggio/RFA» (blu) o «Libero/UFA» nella prima stagione libera. Al buio il testo sulle barre blu è `text-nav`.
- **Cambi di rosa** (`roster-moves.tsx`, scheda Su Dunkest): un gruppo per aggiornamento («Visti il 30 ott, 09:02 · ultima giornata con punti: 4») o, per i cambi ricostruiti, «Dopo la giornata 1 · ricostruito dalle formazioni»; riga con freccia in un cerchio (rossa = uscito, verde = entrato, e la parola), gettone ruolo e nome. Nelle formazioni chi non è più in rosa ha il chip grigio «Sostituito dopo» con le frecce dello scambio, senza velo d'avviso; nelle giornate chiuse la tribuna dice che viene dalla rosa di oggi.
- **Schede** (Fase 6, riordino): `/classifica` ha quattro linguette `ViewSwitch` (Classifica con «La giornata» accanto, Andamento, Calendario con precedenti e formazioni, Premi), la pagina squadra quattro (Rosa, Su Dunkest, Vetrina, Pick). Con tre o più linguette, sotto `md` l'icona sta sopra l'etichetta. «La giornata» (`MatchdayCard`, anche in home): risultati dell'ultima giornata con punti, striscia MVP e chip-link alle schede. **Vetrina** (`trophy-case.tsx`): riepilogo arena (trofei in `.jumbo`, posizione nella lega), mensola dei trofei con uno scaffale per premio (bordo oro e «×N» se vinto, tratteggiato e «–» se no, gettoni «G3 · Doncic 72,19» che portano ai premi di quella giornata), mensola della vergogna a parte (rossa, non si somma), bacheca della lega con barra oro sul numero di trofei.
- **Stati**: `Empty` (icona + titolo + azione reale), `loading.tsx` (testata arena + righe shimmer + pallone che rimbalza), `error.tsx` ("Timeout tecnico"), `not-found.tsx` ("Air ball").

## Movimento

Un'orchestrazione per pagina, poi solo risposte all'utente.
- Ingresso: testata con `.rise` in sequenza (`stagger(i)`, 45 ms tra elementi, max 14), riflesso `.sweep` una volta, righe del board/liste in `.rise`, stemmi e biglietti in `.pop`.
- Dati: cap meter `.meter-fill` (900 ms), `CountUp` sul numero eroe.
- Navigazione: view transition di pagina (uscita 140 ms, entrata con salita 300 ms), header e tab bar fermi, stemma che vola board → squadra.
- Interazione: `.lift` sulle carte, freccia che avanza, icone di nav che diventano un pallone che rimbalza durante il caricamento (`useLinkStatus`).
- Solo `transform` e `opacity`, niente `transition: all`; tutto si spegne con `prefers-reduced-motion` (regola globale in fondo a `globals.css`; `CountUp` resta fermo).

## Icone

Solo `Icon` di `src/components/icons.tsx`, con i tracciati di [Tabler Icons](https://tabler.io/icons) (MIT, variante outline, griglia 24×24, tratto 2). Nuove icone: cercarle su tabler.io, copiare solo i `<path>` (non quello con `stroke="none"`) e lasciare il commento con il nome Tabler. Non disegnarle a mano e non mischiare altri set. Mappa attuale: Lega = pallone (`ball-basketball`, anche per il caricamento), Giocatori = canotta (`shirt-sport`), Draft = biglietto (`ticket`), Scadenze = clessidra (`hourglass-high`), Scambio = frecce (`arrows-exchange`), Admin = distintivo (`shield-star`); admin: firma = contratto (`contract`), rose = `clipboard-list`, pick = `ticket`, quote = `coins`, chiusura = `trophy`, registro = `notebook`. Icone solo decorative: `aria-hidden` (default); pulsanti con sola icona: `aria-label`.

## Accessibilità e responsive

- Focus visibile oro (`:focus-visible`, offset 3 px); checkbox nascosti mantengono il focus con `peer-focus-visible`/`has-[:focus-visible]`.
- Target minimi 44 px (40 px per i chip). Testo su `gold`: sempre `text-nav`.
- Mobile-first, controllato a 390, 768, 1024, 1280, 1440 px; nessuno scroll orizzontale della pagina (le tabelle larghe scorrono nel loro contenitore con la prima colonna fissa). Le strisce che scorrono (ticker, chip) sfumano il bordo dove continuano; la griglia del draft sotto `md` mostra tutti i giri (intestazioni "1°", stemma senza nome).
- Testo che non ci sta: titoli di squadra con `truncate` (funziona perché `text-wrap: balance` sui titoli è in `@layer base`), etichette brevi su due righe (`line-clamp-2`), cifre del tabellone allineate in basso anche se l'etichetta va a capo. `scrollbar-gutter: stable` evita salti di layout tra pagine corte e lunghe.
- Tema chiaro/scuro automatico (`prefers-color-scheme`, `color-scheme` impostato); `theme-color` `#060a14`.

## Da non fare

- Card annidate, griglie di card per contenuti tabellari, glassmorphism su contenuti, glow fuori da `.jumbo`/CTA oro.
- Più di un CTA oro per schermata; rosso decorativo.
- Foto, loghi o font NBA; punteggi, classifiche o statistiche inventate per "fare NBA".
- Colori esadecimali sparsi nei componenti, `transition: all`, animazioni in loop oltre ai loader.
- Cambiare dati, regole (`lib/cap.ts`), action, RPC o route per ragioni estetiche.

## Storia

- 2026-10-28: trade machine a più squadre (`TradeMachine`, `TradeDock`, `StatChange compact`); storico scambi con «riceve … da …». Nessuna icona nuova.

- 2026-10-27: lega su Dunkest (issue #72): `dunkest-league.tsx`, `matchday-strip.tsx`, pagina `/classifica`, sezioni in home, squadra e admin. Nessuna icona nuova.
- 2026-10-27: planner del cap (issue #46): `ViewSwitch`, `KindTag`, `PlanMeter`, `CapOutlook`, `CapPlanner`, utility `.hatch` in `globals.css`.
- 2026-10-27: dati Dunkest (issue #68): scheda giocatore a comparsa (`.sheet` in `globals.css`), infermeria, PDK e chip infortunio nelle righe, fonte col logo Dunkest, pagina `/admin/dunkest`. Nuove icone Tabler: `first-aid-kit` (medkit), `chart-bar`, `clock`, `cloud-download`.
- 2026-10-23: Phase 1 audit (`PHASE_1_AUDIT.md`) e Phase 2 "Front Office editoriale" (cap line, league board).
- 2026-10-25: QA autenticato della dashboard (`PLAN.md` in questa cartella).
- 2026-10-27: rifiniture: ticker che non taglia più l'ultima squadra, menu dell'header che non si taglia tra 768 e 1280 px (TabBar fino a `lg`), classi del design system nei layer CSS, tabellone allineato, draft leggibile su telefono, dettagli di home, squadra, listone e admin.
- 2026-10-26: "Arena Night": nuova palette dal logo, font Big Shoulders + Archivo, icone, stemmi, ticker, tab bar mobile, trade machine, animazioni. Ispirazione NBA.com (header nero, scoreboard, tabelle dense) senza copiarne asset.
