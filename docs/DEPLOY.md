# Deploy su Vercel (gratis)

Serve: account GitHub (già c'è), account Vercel (piano **Hobby**, nessuna carta richiesta).

## 1. Vercel
1. Vai su vercel.com → **Sign Up** → **Continue with GitHub**.
2. **Add New… → Project** → scegli il repo `fantabasket-manager` → **Import**.
3. Framework: Next.js (rilevato da solo). Non cambiare comandi di build.
4. In **Environment Variables** aggiungi solo queste tre (valori dal tuo `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL` — l'indirizzo base, es. `https://xxxx.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — la chiave pubblica `sb_publishable_...`
   - `NEXT_PUBLIC_SITE_URL` — l'indirizzo pubblico del sito, es. `https://fantabasket-manager-xxxx.vercel.app` (senza `/` finale). Il link di accesso via email punta qui, non all'indirizzo della richiesta. Se manca, ripiega su Origin/Host (va bene solo in locale).
5. **Non** aggiungere `SUPABASE_SERVICE_ROLE_KEY`: salta i permessi del database e serve solo per l'import in locale.
6. **Deploy**. Alla fine ottieni un indirizzo tipo `https://fantabasket-manager-xxxx.vercel.app`.

## 2. Supabase: consentire il nuovo indirizzo
Authentication → **URL Configuration**:
- **Site URL**: l'indirizzo Vercel.
- **Redirect URLs**: aggiungi `https://<tuo-indirizzo>.vercel.app/auth/callback` (tieni anche `http://localhost:3000/auth/callback` per lo sviluppo).

Senza questo il login con password funziona lo stesso, ma il link via email rimanda all'indirizzo sbagliato.

## 3. Tenere sveglio Supabase (opzionale ma consigliato)
Il workflow `.github/workflows/keepalive.yml` interroga Supabase ogni 3 giorni. Nel repo GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
- `SUPABASE_URL` — stesso valore di `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_ANON_KEY` — stessa chiave pubblica

Poi **Actions → Supabase keep-alive → Run workflow** per provarlo: deve finire con `HTTP 200`.

**Cron di Vercel (principale).** `vercel.json` chiama ogni giorno `/api/keepalive`, che fa una query leggera. Parte da sola dopo il deploy e non si ferma se il repo resta fermo. Facoltativo: aggiungi la variabile `CRON_SECRET` su Vercel (una stringa casuale lunga) e la route accetterà solo le chiamate del cron. Il workflow GitHub resta come rete di sicurezza, ma GitHub disattiva i workflow schedulati dopo 60 giorni senza attività nel repo.

## 3b. Backup settimanale del database
Il piano gratuito di Supabase non ha backup garantiti. Il workflow `.github/workflows/backup.yml` ogni domenica salva un `pg_dump` dello schema `public` come artifact (90 giorni), **cifrato** perché il repo è pubblico. Secret da aggiungere come sopra:
- `SUPABASE_DB_URL` — Supabase → Connect → **Session pooler** (la stessa di `.env.local`)
- `BACKUP_PASSPHRASE` — una frase lunga e casuale: conservala anche fuori da GitHub, senza di lei il backup non si apre

Provalo con **Actions → Backup database → Run workflow**. Se i workflow schedulati si fermano (60 giorni senza attività) il dump va rilanciato a mano.

**Ripristino.** Scarica l'artifact, poi:
```bash
gpg --decrypt backup.sql.gz.gpg | gunzip > backup.sql
```
Il file contiene schema e dati di `public`. Applicalo su un progetto Supabase **nuovo o vuoto** (con le migrazioni già applicate, `psql "$SUPABASE_DB_URL" -f backup.sql` darebbe errori di oggetti esistenti): per un ripristino parziale copia solo le tabelle che servono. Non ripristinare mai sopra il progetto reale senza averne prima fatto un dump.

## 4. Aggiornamenti
Ogni push su `main` ripubblica il sito da solo. Le variabili si cambiano da Vercel → Project → Settings → Environment Variables (poi serve un nuovo deploy).

## Sicurezza
- Il sito è privato: senza login ogni pagina rimanda a `/login`, e i dati sono protetti anche nel database (RLS).
- La registrazione libera deve restare **disattivata** (Supabase → Authentication → Sign In / Providers → "Allow new users to sign up" spento).
- Il repo è pubblico: non committare mai `.env*` né chiavi.
