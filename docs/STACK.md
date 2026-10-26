# Stack e hosting (costo zero, ~8 utenti)

## Scelta consigliata
| Livello | Scelta | Perché |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript + Tailwind** | Un solo progetto per UI e API, ottimo su mobile, tantissima documentazione (utile per lavorare con le AI) |
| Backend / DB | **Supabase** (Postgres + Auth + Row Level Security) | Login pronto (email+password e magic link), ruoli admin/viewer applicati nel DB con RLS, piano free abbondante. Le regole di lega (cap, tagli, scambi) stanno in TypeScript (`src/lib/cap.ts`), non nel SQL |
| Hosting | **Vercel (Hobby)** per l'app + Supabase free per DB | Deploy automatico da GitHub, HTTPS, nessuna carta richiesta |

Carico: 8 utenti, scritture rarissime (solo admin) → un decimo dei limiti free.

## Attenzioni sui piani gratuiti
- Supabase free **mette in pausa il progetto dopo ~7 giorni senza attività**. Mitigazione: il cron di Vercel su `/api/keepalive` (ogni giorno, `vercel.json`) (configurazione in [DEPLOY.md](DEPLOY.md), sezione 3; non dipende dall'attività del repo, a differenza dei workflow schedulati di GitHub), oppure riattivarlo a mano a inizio asta.
- Vercel Hobby è per uso non commerciale: ok per una lega tra amici.
- Backup: workflow settimanale `backup.yml` con `pg_dump` cifrato salvato come artifact (90 giorni), perché il free non ha backup garantiti; ripristino in [DEPLOY.md](DEPLOY.md), sezione 3b.

## Alternative valutate
- **Cloudflare Pages + D1 (SQLite)**: nessuna pausa, ma auth da costruire a mano e meno comodo per RLS. Buona seconda scelta.
- **Firebase**: free, ma modello NoSQL poco adatto a contratti/cap/vincoli relazionali.
- **Google Sheets come backend**: gratis, ma niente permessi seri né vincoli; è quello che stiamo sostituendo.
- **VPS/Raspberry self-hosted**: più manutenzione, nessun vantaggio per 8 utenti.

## Autenticazione
Email+password o magic link (Supabase). 8 account creati dall'admin (inviti), signup pubblico **disattivato** (vedi la sezione Sicurezza di [DEPLOY.md](DEPLOY.md)). Ruolo `admin` assegnato a mano nella tabella `profiles`.
