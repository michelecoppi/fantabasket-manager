# Dati: foglio Excel e modello database

## Cosa c'è in `Dunkest.xlsx`
**Foglio1** (gestione lega, 2026)
| Zona (righe) | Contenuto | Entità DB |
|---|---|---|
| 4-16 | 8 blocchi (ruolo A/C/G, `anni nome`, stipendio) = **titolari** (13 per squadra; intestazioni alle righe 2-3) | `contracts` (status `starter`) |
| 18-23 (sotto riga vuota) | **riserve** (6 per squadra, confermato) | `contracts` (status `reserve`) |
| 26-31 | `MONTE INGAGGI`, `SPAZIO SALARIALE`, `BUDGET SFORATO`, `QUOTA PAGATA`, `SPAZIO S. RISERVE`, `BONUS CAMPIONATO` | **calcolati** (vista) + `team_season` |
| 33-48 | Draft dei 3 anni successivi (a ottobre 2026: 2027/2028/2029), 5 giri, `T` = posseduta, `S(xxx)` = scambiata a xxx. Le `S` spariscono a draft fatto: il foglio non tiene lo storico degli scambi | `draft_picks` |
| 51-52 | Legenda T/S | — |
| 55-58 | **Giocatori tagliati**: `anni nome stipendio` e, nella colonna prezzo, la **quota già divisa** (1/3 arrotondato a 0.5: 5 → 1.5, 10 → 3.5) | `cuts` (`paid_salary`) |
| 71-87 | **Squadra talenti** (nome + anno draft + valore) | `talents` |
| 89 | Rookie al bivio (vuota) | — |
| Colonne AC-AI | **Ultimo contratto**: data (`2026.09`) dell'ultima volta sotto contratto, giocatore, stipendio, squadra; + coppie "nome prezzo" (da chiarire) | `last_contracts` |

**Foglio2** — ordine rookie draft 2026: 40 righe = 5 giri × 8; colonne squadra | cognome | nome | squadra NBA | note ("Da Spacc." = pick ricevuta).
**Foglio3** — elenco dei **free agent** (anche allenatori, es. `Head Coach`): nome, cognome, ruolo (Guard/Forward/Center), squadra NBA, `Cr 26/27` (crediti), `Restricted` (squadra ex-proprietaria che può pareggiare l'offerta, `r` se ex-rookie; 24 righe prima dell'asta; non c'è una colonna proprietario). **Non contiene i giocatori già in rosa.** Prima dell'asta 443 righe utili, dopo ~360 righe di sole celle con spazi; dopo l'asta del 20/10 ne restano ~370 e nessuno è più restricted, quindi il diritto vale solo per l'asta. Come leggerlo: [IMPORT.md](IMPORT.md).

Notazione nome contratto: `<anni> [+1] <Nome> [u|r]` es. `1+1 Tatum u`, `2 Flagg r`: `u` = unrestricted, `r` = restricted alla scadenza; `+1` = team option; `2 Murphy III` = 2 anni, nome "Murphy III". Nel foglio `r` compare solo sui contratti rookie e `u` anche dopo un pareggio (Okongwu): i restricted non-rookie non hanno sigla, si riconoscono da `Restricted` in Foglio3 (vedi `restricted_rights`).
Ruoli nel foglio: A = Ala, C = Centro, G = Guardia.

## Formule da riprodurre (verificate sul foglio)
```
taglio_quota    = round(stipendio / 3 × 2) / 2                      // 1/3 arrotondato a 0.5 (R-42)
monte_ingaggi   = Σ stipendi titolari + Σ quote tagliati (già 1/3 nel foglio)   // verificato su 8/8 squadre
spazio_salariale = cap(250) + bonus_campionato − monte_ingaggi
spazio_riserve  = 80 − Σ stipendi riserve   // verificato su 8/8 squadre
budget_sforato  = spazio_salariale < 0
luxury_tax_eur  = min(max(monte − cap_effettivo, 0), 20) / 4       // R-12, parametri in league_settings
```
Questa logica vive in un solo file (`lib/cap.ts`) con test.

### Numeri di riferimento per i test
Foglio del 21/10/2026, dopo l'asta (titolari 13 per squadra). `src/lib/cap.test.ts` usa il foglio pre-asta: questi valori aggiungono il caso sforato (DAMIANO) e le riserve al limite. `monte = titolari + tagli`, `spazio = 250 + bonus − monte`, `spazio riserve = 80 − riserve`.

| Proprietario | Titolari | Tagli | Monte | Bonus | Spazio | Sforato | Riserve (n) | Somma riserve | Spazio riserve |
|---|---|---|---|---|---|---|---|---|---|
| AMEDEO | 210.5 | 3.5 | 214 | −2 | 34 | no | 6 | 80 | 0 |
| LUGIU | 234 | 10.5 | 244.5 | −3 | 2.5 | no | 5 | 55.5 | 24.5 |
| GABBY | 242 | 0 | 242 | +5 | 13 | no | 6 | 68.5 | 11.5 |
| DAMIANO | 256.5 | 3.5 | 260 | −1 | **−11** | **sì** | 6 | 52 | 28 |
| SCUTI | 248 | 1.5 | 249.5 | +3 | 3.5 | no | 5 | 51.5 | 28.5 |
| SERDE | 240.5 | 0 | 240.5 | +2 | 11.5 | no | 5 | 64.5 | 15.5 |
| CC | 246 | 0 | 246 | +4 | 8 | no | 6 | 67.5 | 12.5 |
| ENTONY | 248 | 1.5 | 249.5 | 0 | 0.5 | no | 6 | 65 | 15 |

Casi utili: AMEDEO ha le riserve al limite (spazio 0), DAMIANO è l'unico sforato (luxury tax teorica da R-12: `min(11, 20) / 4 = 2.75 €`, nel foglio non risulta incassata), ENTONY ha 0.5 di spazio. Tagli arrotondati allo 0.5 (5 → 1.5).

## Bozza schema Postgres (Supabase)
```sql
create type app_role as enum ('admin','viewer');
create type roster_slot as enum ('starter','reserve','talent');
create type pos as enum ('G','A','C');

create table profiles (id uuid primary key references auth.users, display_name text, role app_role not null default 'viewer', team_id uuid);
create table seasons (id serial primary key, year int unique not null, is_current bool default false);
create table league_settings (season_id int references seasons, key text, value numeric, primary key (season_id,key)); -- cap, floor, reserve_budget, tax_rate...
create table teams (id uuid primary key default gen_random_uuid(), name text unique not null, owner_name text not null);
create table players (id serial primary key, first_name text, last_name text, pos pos, nba_team text, dunkest_credits numeric(5,1), unique(first_name,last_name,nba_team));
create table contracts (
  id serial primary key, season_id int references seasons, team_id uuid references teams, player_id int references players,
  slot roster_slot not null, years_left numeric(2,1) not null, team_option bool default false,
  salary numeric(5,1) not null, restriction text check (restriction in ('restricted','unrestricted')), notes text
);
create table cuts (id serial primary key, season_id int, team_id uuid, player_id int, salary numeric(5,1), years_left int, status text); -- paga 1/3
create table draft_picks (id serial primary key, year int, round int check (round between 1 and 5), original_team uuid, current_team uuid, status text, note text);
create table rookie_draft (season_id int, pick_no int, team_id uuid, player_id int, note text);
create table last_contracts (id serial primary key, player_id int, team_id uuid, salary numeric(5,1), ended_on date);
create table restricted_rights (season_id int, player_id int, team_id uuid, is_rookie bool default false, primary key (season_id, player_id)); -- PROPOSTA (non in 0001_init.sql): colonna Restricted di Foglio3, si svuota dopo l'asta
create table team_season (season_id int, team_id uuid, bonus int default 0, entry_fee_paid bool default false, final_rank int, luxury_tax_paid bool default false, primary key(season_id,team_id));
create table trades (id serial primary key, season_id int, created_at timestamptz default now(), status text, payload jsonb, approved_by uuid);
create table audit_log (id bigserial primary key, at timestamptz default now(), user_id uuid, action text, table_name text, row_id text, before jsonb, after jsonb);
```
RLS: `select` per ogni utente autenticato; `insert/update/delete` solo se `exists(select 1 from profiles where id=auth.uid() and role='admin')`.
Seed squadre (owner → team): Amedeo → Assago Farmers, Lugiu → CUS Cosenza, Gabby → Bol Bollerz, Damiano → Dame Time, Scuti → Atlanto Non Vinco, Serde → Spaccinos, CC → OKCC, Antonio → San Antonio.
`team_season.final_rank` è inserita dall'admin a fine stagione (bonus, lottery, luxury tax); `team_season.entry_fee_paid` e `luxury_tax_paid` tracciano i pagamenti.
Lo schema è una **bozza**, da rifinire in fase 1.

Nota: nel foglio alcune squadre non rispettano ancora 5G/5A/3C o le 3 riserve minime (offseason in corso): la validazione deve **avvisare**, non bloccare.
Lo schema eseguibile è in `supabase/migrations/0001_init.sql` (non ancora testato su un database reale).

Collegamento nome breve → giocatore: l'import collega un giocatore al listone solo se coincidono cognome **e** (proprietario in colonna `Restricted` **oppure** stipendio = crediti). Un cognome uguale non basta: l'elenco contiene solo free agent, quindi un omonimo sarebbe un falso collegamento (es. Jahmir Young al posto di Trae Young). I casi non collegati restano giocatori provvisori con il solo nome del foglio.
