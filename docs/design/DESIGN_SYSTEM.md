# Design system — Front Office editoriale

Direzione attuata nella Phase 2 con la dashboard `/`: una sala operativa di lega in cui payroll, cap e asset hanno più importanza della decorazione. La reference NBA fornisce principi di gerarchia e densità, non layout o asset.

## Firma visiva

La **cap line** mette in relazione payroll e cap effettivo con una scala, valori numerici e stato testuale. È presente nel riepilogo personale e nel league board. Il “court” si ritrova nelle linee di misurazione e nei separatori, non in texture decorative. Il logo di lega resta l'unico marchio; nessun asset NBA.

## Tipografia

- `Geist`: testo, form, metadati e descrizioni; 12–16 px secondo il livello.
- `Barlow Condensed` 600/700/800: headline, navigazione e cifre; maiuscolo con tracking controllato.
- Hero: 48–88 px responsive; page title 40–56 px; section title 24–32 px; metriche 28–56 px.
- Crediti e variazioni usano sempre `tabular-nums`; le etichette non sostituiscono i valori o le unità.

## Colore e superfici

Token semantici in `src/app/globals.css`; `brand-red` e `brand-blue` restano alias compatibili con le route non ancora ridisegnate.

- **Paper / ink:** fondo caldo e testo quasi nero nel tema chiaro; inchiostro freddo e testo avorio nel dark.
- **Surface:** aree operative e tabelle; `surface-raised` solo per il pannello hero.
- **Accent:** arancio-ruggine derivato dalla fiamma del logo; azione primaria, focus e cap sforato. Testo bianco solo sulla variante scura verificata.
- **Link / cap:** blu petrolio, non più blu NBA; link, selezione e payroll entro cap.
- **Highlight:** ottone della corona del logo, solo per identità personale e piccoli dettagli.
- **Success / warning / danger:** semantici e sempre accompagnati da testo o icona, mai dal solo colore.
- Bordi netti e separatori prevalgono sulle ombre. Raggi 0–6 px; niente pillole generiche, gradienti, glow o glassmorphism.

## Spazio e layout

- Shell fluida fino a 1440 px; padding 16 px mobile, 24 px tablet, 40 px desktop.
- Ritmo base 4/8 px; gruppi 16–24 px; sezioni 32–48 px.
- La home usa un hero a due colonne da `lg` e un league board denso, non una griglia di otto card.
- Le route operative possono usare tutta la larghezza; il testo narrativo resta limitato per preservare la lettura.

## Componenti e stati

- **Navigazione:** underline pieno per la route attiva, nessuna pill; scroll orizzontale su mobile e target minimi 44 px.
- **Bottoni:** rettangolari, condensed, primario ruggine e secondario con bordo; hover cambia superficie/bordo, active riduce lievemente il feedback, disabled mantiene testo leggibile.
- **Focus:** outline ruggine di 2 px con offset 3 px, visibile anche su link e navigazione.
- **Badge:** etichette corte, squadrate e secondarie; non diventano il contenuto principale.
- **Team identity:** monogramma testuale, nome e proprietario; non imita loghi NBA e non presenta l'ordine del board come classifica sportiva.
- **Tabelle/board:** intestazione esplicita, numeri a destra e identità a sinistra; su mobile le metriche passano su una seconda riga senza nascondere dati.
- **Loading:** scheletro strutturale con testo screen-reader; empty con azione reale; error con retry; pending/disabled conservati.

## Responsive e accessibilità

Mobile-first, con transizioni della composizione a 640/768/1024 px. Il hero non impone altezze fisse; nomi lunghi e valori negativi restano leggibili. Contrasti base verificati: bianco su accento `#b63d24` 5,70:1; link `#28566d` su paper 7,10:1; muted `#62625d` su paper 5,48:1; accento dark `#ff7958` su nav 7,21:1. Le animazioni rispettano `prefers-reduced-motion`.

Le pagine pubbliche possono essere verificate senza sessione. La dashboard richiede un account autorizzato e dati reali: nessun bypass auth o dataset finto per il QA.

## QA Phase 2

Chrome headless reale su `/login`: 1440×900, 1920×1080, 768×1024 e 390×844, più dark mobile. Screenshot ispezionati, nessun overflow orizzontale, asset fallito, console error o richiesta fallita. `/` senza sessione reindirizza correttamente a `/login`. Il primo pass ha rilevato e corretto gradiente residuo e contrasto del pulsante blu dark.

Non verificati nel browser: dashboard autenticata e popolata, filtri senza risultati, loading/error della lega, stati admin e dati limite. Serve una sessione autorizzata; non sono stati creati account, dati o bypass per il QA.

## QA Phase 3

Dashboard autenticata verificata in Chrome QA via CDP ai viewport 1440×900, 1920×1080, 768×1024 e 390×844, con dati reali, dark desktop/mobile, loading, filtri popolati/empty, reset, navigazione e focus da tastiera. Corretti gli scrollbar nativi della nav e il disallineamento delle select dopo Azzera; before/after in `.claude/qa/screenshots/`. Test, lint, typecheck, build e `git diff --check` superati. Restano non verificati il fallback senza squadra e l'error boundary, non raggiungibile in sicurezza dal solo CDP; il diagnostico dev `Date.now()` e i limiti sono documentati in `docs/design/PLAN.md`.
