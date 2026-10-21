# Stack e hosting (costo zero, ~8 utenti)

## Scelta consigliata
| Livello | Scelta | Perché |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui** | Un solo progetto per UI e API, ottimo su mobile, tantissima documentazione (utile per lavorare con le AI) |
| Backend / DB | **Supabase** (Postgres + Auth + Row Level Security) | Login pronto (magic link/email), ruoli admin/viewer applicati nel DB, SQL vero per i calcoli di cap, piano free abbondante |
| Hosting | **Vercel (Hobby)** per l'app + Supabase free per DB | Deploy automatico da GitHub, HTTPS, nessuna carta richiesta |

Carico: 8 utenti, scritture rarissime (solo admin) → un decimo dei limiti free.

## Attenzioni sui piani gratuiti
- Supabase free **mette in pausa il progetto dopo ~7 giorni senza attività**. Mitigazione: cron gratuito (GitHub Actions) che fa una query ogni pochi giorni, oppure riattivarlo a mano a inizio asta.
- Vercel Hobby è per uso non commerciale: ok per una lega tra amici.
- Backup: export periodico (`pg_dump` o CSV) salvato nel repo privato/Drive, perché il free non ha backup garantiti.

## Alternative valutate
- **Cloudflare Pages + D1 (SQLite)**: nessuna pausa, ma auth da costruire a mano e meno comodo per RLS. Buona seconda scelta.
- **Firebase**: free, ma modello NoSQL poco adatto a contratti/cap/vincoli relazionali.
- **Google Sheets come backend**: gratis, ma niente permessi seri né vincoli; è quello che stiamo sostituendo.
- **VPS/Raspberry self-hosted**: più manutenzione, nessun vantaggio per 8 utenti.

## Autenticazione
Email magic link (Supabase). 8 account creati dall'admin (inviti), signup pubblico **disattivato**. Ruolo `admin` assegnato a mano nella tabella `profiles`.
