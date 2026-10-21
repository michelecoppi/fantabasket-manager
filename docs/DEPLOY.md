# Deploy su Vercel (gratis)

Serve: account GitHub (già c'è), account Vercel (piano **Hobby**, nessuna carta richiesta).

## 1. Vercel
1. Vai su vercel.com → **Sign Up** → **Continue with GitHub**.
2. **Add New… → Project** → scegli il repo `fantabasket-manager` → **Import**.
3. Framework: Next.js (rilevato da solo). Non cambiare comandi di build.
4. In **Environment Variables** aggiungi solo queste due (valori dal tuo `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL` — l'indirizzo base, es. `https://xxxx.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — la chiave pubblica `sb_publishable_...`
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

## 4. Aggiornamenti
Ogni push su `main` ripubblica il sito da solo. Le variabili si cambiano da Vercel → Project → Settings → Environment Variables (poi serve un nuovo deploy).

## Sicurezza
- Il sito è privato: senza login ogni pagina rimanda a `/login`, e i dati sono protetti anche nel database (RLS).
- La registrazione libera deve restare **disattivata** (Supabase → Authentication → Sign In / Providers → "Allow new users to sign up" spento).
- Il repo è pubblico: non committare mai `.env*` né chiavi.
