# Roadmap design e visual QA

## Stato Phase 3 — 2026-10-25

**QA autenticato della dashboard completato.** Il Chrome QA isolato, collegato via CDP sulla porta 9222, mostra `http://localhost:3000/`, la headline “Il cap detta il gioco” e le otto franchigie reali. La Phase 4 può partire; restano i limiti espliciti sotto.

### Verificato

- Hero, riepilogo della franchigia assegnata, cap line, league board e valori reali a 1440×900, 1920×1080, 768×1024 e 390×844; nessun overflow orizzontale della pagina e asset caricati.
- Cap negativo, mezzi crediti, bonus, quota, luxury tax e warning presenti nei dati. Dark mode desktop/mobile e fallback strutturale di loading raggiunto con rete rallentata.
- Ordinamento per payroll e spazio, filtri sforate/incomplete, empty reale per sotto floor, reset, refresh e navigazione verso tutte le route principali e una squadra.
- Focus da tastiera visibile; su mobile la voce Admin fuori viewport viene portata automaticamente in vista. Nessuna azione di scrittura admin eseguita.
- Baseline tecnica: 88 test, lint, typecheck, production build e `git diff --check` superati. Screenshot locali in `.claude/qa/screenshots/`, con i before in `.claude/qa/screenshots/before/`.

### Problemi trovati e corretti

- `MainNav`: scrollbar verticale su tutti i viewport e scrollbar orizzontale nativo su mobile. Aggiunta `.main-nav` con overflow verticale nascosto e scrollbar nascosti, preservando scroll orizzontale e focus.
- Filtri dashboard: dopo **Azzera** le righe tornavano a otto ma la select restava sul filtro precedente. Il form viene ora rimontato al cambio di ordinamento/filtro, mantenendo invariati URL e parametri.
- Il profilo Chrome QA era stato creato dentro il progetto e un file `LOCK` bloccava Turbopack. È stato spostato fuori dal repository senza leggerne o copiarne il contenuto; server e browser sono stati riavviati e la sessione autenticata è rimasta valida.

### Limiti e controlli ancora aperti

- Fallback `League pulse` per un profilo senza squadra non verificato: non è stato cambiato alcun profilo per crearlo.
- Error boundary non raggiunto in modo sicuro: bloccare Supabase via CDP intercetta solo il browser, non le richieste server-side. Nessuna modifica ad auth, rete di sistema o dati per provocarlo.
- In sviluppo Next registra il diagnostico `Date.now()` durante il prerender di `UserBadge`; la dashboard resta accessibile e la production build passa. Non sono state cambiate auth o cache fuori scope.
- Non eseguiti test RLS, non essendo cambiate tabelle o RPC.

### Gate per Phase 4

Il gate autenticato della dashboard è superato con before/after reali. Espandere il redesign mantenendo lo stesso procedimento: dati autorizzati, screenshot ai viewport concordati, controlli degli stati e nessuna modifica funzionale per esigenze estetiche.
