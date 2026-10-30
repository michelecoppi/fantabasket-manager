# Fantabasket Manager

Gestionale per la lega di fantabasket NBA (formato Dunkest, 8 squadre, contratti pluriennali e salary cap).

- **Admin**: modifica rose, contratti, tagli, scambi, pick del draft, budget; approvano le proposte di scambio.
- **Utenti normali**: consultano rose, spazio salariale, pick, storico, classifica e dati Dunkest (infortuni, punteggi, leader della notte); simulano e propongono scambi quando il mercato è aperto.

Stato: sito online con pannello `/admin` (firma, contratti, tagli, scambi, pick, quote), dati Dunkest aggiornati ogni giorno, proposte e cercatore di scambi, albo d'oro, bot Telegram e card da condividere. Cosa è fatto e cosa manca (voci aperte in «Controllo dello stato»): [PLAN.md](PLAN.md).

## Documenti
| File | Contenuto |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Istruzioni per le AI che lavorano sul repo |
| [PLAN.md](PLAN.md) | Piano di lavoro, modificabile (checklist per fasi) |
| [docs/REGOLAMENTO.md](docs/REGOLAMENTO.md) | Regole di lega in sintesi, con ID R-xx |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Pubblicare il sito su Vercel (gratis) |
| [docs/STACK.md](docs/STACK.md) | Scelte tecnologiche e hosting gratuito |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Cosa contiene il foglio Excel, formule e panoramica del database |
| [docs/IMPORT.md](docs/IMPORT.md) | Come leggere il foglio: nomi, alias, fonte dati Dunkest |
| [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) | Domande da chiarire con l'organizzatore |
| [docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md) | Design system «Arena Night» |
| [docs/product/](docs/product) | Piani di fase (6, proposte di scambio, scambio talenti), audit di prodotto, roadmap |
