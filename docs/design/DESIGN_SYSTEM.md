# Design system — Arena Night

Direzione attiva dal 2026-10-26 (sostituisce "Front Office editoriale" della Phase 2). Il sito è il palazzetto della lega: header nero e ticker come lo scoreboard di NBA.com, superfici "arena" con le linee del campo, cifre da tabellone, colori del logo. Resta un gestionale: i dati reali vengono prima della decorazione e nessun contenuto NBA (foto, loghi, punteggi, classifiche live) viene inventato o copiato.

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
| `src/components/plan-parts.tsx` | Planner del cap: `KindTag` (Nominale / Calcolato / Ipotesi), `PlanMeter` (meter di stagione a strati), `PlannerLegend`, `CapOutlook` (panoramica della lega) |
| `src/components/cap-planner.tsx` | `CapPlanner` (client): pannello ipotesi, carte stagione, tabellone contratti |
| `src/components/nav.tsx` | `MainNav` (header, da `lg`) e `TabBar` (in basso, sotto `lg`) |

## Firma visiva

1. **Ticker della lega** sotto l'header, su tutte le pagine: una "partita" per squadra con stemma, nome, mini cap meter e spazio salariale. Le partite si allargano fino a riempire la striscia (tutte e 8 visibili da ~1280 px); sotto si scorre, con bordi sfumati e frecce col mouse. Mai tagliare una squadra senza segnalare che la striscia continua. Ordine alfabetico, non è una classifica.
2. **Cap meter** (`CapLine`): payroll sul cap effettivo, tacca del salary floor, parte sforata a strisce rosse oltre la linea del cap. Si riempie all'ingresso. Compare in home, pagina squadra, ticker e scambio.
3. **Stemmi di squadra** (`TeamCrest`): scudo con monogramma nel colore della franchigia; bordo e corona oro per la squadra dell'utente. Lo stemma "vola" dal board alla pagina squadra (view transition `crest-<id>`).
4. **Superficie arena** (`.arena`): blu notte con le linee del campo in SVG al 7% e due luci (blu in alto a destra, rossa in basso a sinistra). Solo per testate di pagina, hero, login, errori. Mai per tabelle o form.
5. **Cifre da tabellone**: Big Shoulders 800–900 maiuscolo; il numero eroe di una pagina in oro con bagliore (`.jumbo`).

## Colore

Palette dal logo: blu reale dello scudo, rosso del pallone, oro della corona, su inchiostro blu-nero. Tutti i valori sono token in `globals.css`; nei componenti si usano le classi (`bg-surface`, `text-muted`, `bg-gold`...), non esadecimali. Eccezioni ammesse: i colori squadra (dinamici, via `style`) e i rossi/verdi chiari su superficie arena (`#ff8a95`, `#7be3b4`).

| Token | Chiaro | Scuro | Ruolo |
|---|---|---|---|
| `background` | `#eef1f6` | `#070b14` | fondo pagina (grigio freddo come NBA.com / notte) |
| `surface` / `surface-subtle` | `#ffffff` / `#e5e9f1` | `#0f1627` / `#18213a` | carte, tabelle / zone secondarie |
| `line` | `#d3d9e4` | `#26314f` | bordi e separatori |
| `foreground` / `muted` | `#0b1220` / `#566176` | `#eef2fb` / `#97a3bd` | testo |
| `nav` / `arena` | `#060a14` / `#0b1226` | `#03060d` / `#0a1022` | header, tab bar, superfici arena |
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

- **Header**: nero, logo + "Fantabasket / League office", `MainNav` con icone e sottolineatura oro animata, utente, aggiorna (pallone che gira), esci. Filo broadcast di 3 px. Da `lg` a `xl` la scritta accanto al logo e il badge utente si nascondono, così il menu (6 voci per gli admin) non viene mai tagliato.
- **TabBar** (sotto `lg`, quindi anche su tablet): 5–6 voci con icona ed etichetta, voce attiva oro, safe area iOS. Il `main` ha `pb-28` per non finirci sotto.
- **PageTitle**: banda arena con icona oro, eyebrow, titolo, sottotitolo e `aside` (di solito uno `Scoreboard` con 3–4 numeri reali della pagina).
- **Filtri**: preferire `ChipLinks` (un tocco, stato nell'URL) a select + "Applica". Le select restano dove le opzioni sono molte (listone).
- **PlayerRow**: `PosChip` (G blu, A oro, C rosso, `?` tratteggiato), nome, contesto, badge r/u, `ContractPips` (pallini pieni = stagioni, mezzo = mezza stagione, tratteggiato blu = team option, `?` = durata da fissare), crediti.
- **Trade machine** (`/scambio` e `/admin/scambio`): due lati con stemma e colore squadra, righe selezionabili con checkbox nativo nascosto, pulsante "inverti", `ImpactCard` con prima→dopo e cap meter.
- **Dati Dunkest** (issue #68): fonte sempre dichiarata con `DunkestSource` (logo Dunkest + «agg. 27 ott, 09:02»; avviso oro se l'ultimo aggiornamento è fallito). Nelle righe giocatore il PDK è blu (non nero come i crediti) con una tacca: riempimento = punteggio sul migliore del ruolo, linea = media del ruolo; «pg» sotto. Il chip infortunio sta accanto al nome anche su telefono. Tutta la riga apre la `PlayerSheet`: popover nativo (niente JS), foglio dal basso su telefono e finestra centrata da 640 px, testata arena con `Scoreboard` (PDK in oro), barra di confronto col ruolo con ▲/▼ sulla media, posizione nel ruolo, punti/rimbalzi/assist, infortunio. Pagina squadra: sezione «Infermeria» (infortunati dal più grave, «Rosa al completo» se nessuno). Il logo Dunkest è un marchio della fonte: solo accanto ai dati, mai decorazione.
- **Planner del cap** (issue #46, `/scadenze?vista=planner`): `ViewSwitch` (linguette grandi con icona, stato nell'URL) tra Scadenze e Planner. Ogni numero dichiara la sua natura con `KindTag`: grigio = nominale, blu = calcolato, oro tratteggiato = ipotesi (il tratteggio significa sempre «non certo»: option da esercitare, durate da fissare). `PlanMeter`: titolari pieni, option a strisce, quote dei tagli e durate da fissare col tratteggio `.hatch` (colore del testo), sforamento a strisce rosse, tacca del cap spostata con `transform` e forbice del bonus R-60 come filo oro sotto la pista; gli strati sono a tutta larghezza e ritagliati con `clip-path`, così cambiano scenario senza animare `width`. Scala comune a tutte le stagioni della squadra. Carte stagione: carosello a scatti su telefono (la carta dopo spunta), colonne da `lg`; la stagione corrente ha il filo broadcast in alto, le future il chip «Proiezione». Tabellone: un blocco per stagione, option come casella tratteggiata da toccare (`aria-pressed`), uscita «Pareggio/RFA» (blu) o «Libero/UFA» nella prima stagione libera. Al buio il testo sulle barre blu è `text-nav`.
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

- 2026-10-27: planner del cap (issue #46): `ViewSwitch`, `KindTag`, `PlanMeter`, `CapOutlook`, `CapPlanner`, utility `.hatch` in `globals.css`.
- 2026-10-27: dati Dunkest (issue #68): scheda giocatore a comparsa (`.sheet` in `globals.css`), infermeria, PDK e chip infortunio nelle righe, fonte col logo Dunkest, pagina `/admin/dunkest`. Nuove icone Tabler: `first-aid-kit` (medkit), `chart-bar`, `clock`, `cloud-download`.
- 2026-10-23: Phase 1 audit (`PHASE_1_AUDIT.md`) e Phase 2 "Front Office editoriale" (cap line, league board).
- 2026-10-25: QA autenticato della dashboard (`PLAN.md` in questa cartella).
- 2026-10-27: rifiniture: ticker che non taglia più l'ultima squadra, menu dell'header che non si taglia tra 768 e 1280 px (TabBar fino a `lg`), classi del design system nei layer CSS, tabellone allineato, draft leggibile su telefono, dettagli di home, squadra, listone e admin.
- 2026-10-26: "Arena Night": nuova palette dal logo, font Big Shoulders + Archivo, icone, stemmi, ticker, tab bar mobile, trade machine, animazioni. Ispirazione NBA.com (header nero, scoreboard, tabelle dense) senza copiarne asset.
