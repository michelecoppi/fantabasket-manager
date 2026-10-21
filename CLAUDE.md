# CLAUDE.md — guida per le AI

Gestionale web per una lega privata di fantabasket NBA (8 squadre). Lingua di UI, commenti utente e documenti: **italiano**. Codice e nomi di variabili/tabelle: **inglese**.

## Stato del progetto
Fase di progettazione. Leggi prima [PLAN.md](PLAN.md) per sapere cosa è fatto e cosa è il prossimo passo, e aggiornalo a fine lavoro (spunta le caselle, aggiungi note).

## Regole di lega
Sintesi con ID (R-xx) in [docs/REGOLAMENTO.md](docs/REGOLAMENTO.md); cita gli ID nei commenti/test. Il regolamento è datato 28/09/2024 e va riconfermato (vedi [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md)).

## Regola d'oro: non inventare regole
Tutti i valori del regolamento (cap 250, floor, budget riserve 80, tasso luxury tax, premi...) vanno in **`league_settings`/configurazione**, mai hardcodati. Se una regola è dedotta dal foglio Excel e non dal regolamento, marcala come `ASSUNZIONE` in OPEN-QUESTIONS.md. In caso di ambiguità chiedi all'utente invece di scegliere.

## Stack (vedi docs/STACK.md)
Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres + Auth + RLS), deploy su Vercel. Tutto su piani gratuiti, max ~8 utenti contemporanei.

## Ruoli e permessi
- `admin`: scrive su tutto. 
- `viewer`: sola lettura.
- I permessi vanno applicati **nel database con Row Level Security**, non solo nascondendo bottoni nella UI. Ogni tabella: SELECT per utenti autenticati, INSERT/UPDATE/DELETE solo se `is_admin()`.
- Ogni modifica admin a contratti/pick/budget scrive una riga in `audit_log`.

## Fonte dati
`Dunkest.xlsx` (solo in locale, ignorato da git) ha 3 fogli: `Foglio1` rose/contratti/pick, `Foglio2` ordine rookie draft, `Foglio3` listone giocatori Dunkest con crediti 26/27. Struttura e significato in [docs/DATA-MODEL.md](docs/DATA-MODEL.md). L'import avverrà con uno script ripetibile in `scripts/` (da creare), non a mano.
Attenzione: il file ha encoding sporco (`1°` appare come `1�`, `Traoré` come `Traor�`) e celle con `\xa0`; normalizzare in import.

## Convenzioni
- TypeScript strict, niente `any` senza motivo. 
- Valori numerici dei crediti: `numeric(5,1)` nel DB (ci sono mezzi crediti, es. 3.5).
- Calcoli di cap/spazio salariale in un'unica funzione condivisa (`lib/cap.ts`), con test.
- Stagione corrente come entità (`seasons`), mai come costante.
- UI mobile-first: gli utenti la useranno da telefono.
- Commit piccoli, messaggi in italiano o inglese ma coerenti. Non committare `.env*` né chiavi Supabase `service_role`.

## Cosa NON fare
- Non aggiungere servizi a pagamento o che richiedano carta di credito.
- Non scrivere regole di lega nel codice senza averle messe in OPEN-QUESTIONS/PLAN.
- Non dare permessi di scrittura ai viewer "per comodità".
- Non pushare/pubblicare senza che l'utente abbia confermato.
