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

Notazione nome contratto: `<anni> [+1] <Nome> [u|r]` es. `1+1 Tatum u`, `2 Flagg r`: `u` = unrestricted, `r` = **rookie** (R-26, confermato dall'utente); `+1` = team option; `2 Murphy III` = 2 anni, nome "Murphy III". Nel DB: `contracts.is_rookie` per `r`, `contracts.restriction = 'unrestricted'` per `u` (anche dopo un pareggio, es. Okongwu). Chi non ha sigla non è né rookie né unrestricted: i restricted non-rookie si riconoscono da `Restricted` in Foglio3 (non modellato nel DB: dopo l'asta la colonna è vuota, il diritto vale solo per l'asta).
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

## Schema Postgres (Supabase)
Fonte di verità: `supabase/migrations/` (si parte da `20261021214000_init.sql`, poi una migrazione per modifica; elenco e numerazione in [PLAN.md](../PLAN.md)). Questo file non ripete lo schema per non farlo divergere.
Tabelle principali: `profiles` (ruolo `admin`/`viewer`), `seasons`, `league_settings` (tutti i parametri di regolamento: cap, budget riserve, divisore del floor, luxury tax, massimi di rosa, orizzonte pick...), `teams`, `players`, `contracts`, `cuts` (4 stati: `pending`, `cut`, `reinstated`, `awarded`), `talents`, `draft_picks`, `rookie_draft`, `last_contracts`, `team_season` (bonus, classifica finale, quota e luxury tax pagate), `trades`, `audit_log`.
Dati Dunkest (issue #68, migrazione `20261027025827_dunkest_data.sql`): `players.dunkest_id` (id del sito, trovato dal job e poi stabile), `seasons.dunkest_season_id` (29 = 2026-27), `dunkest_stats` (medie della stagione per giocatore: `gp`, `pdk`, `min`, `pts`, `reb`, `ast`), `dunkest_injuries` (infortuni di oggi, sostituiti per intero), `dunkest_sync` (una riga: ultimo aggiornamento riuscito, ultimo errore, report dei non collegati), `dunkest_sync_runs` (storico delle esecuzioni, 90 giorni). Li scrive solo il job giornaliero tramite le RPC `dunkest_sync_*`; il segreto del job sta come hash in `private.job_secrets` (schema non esposto). Dettagli in [IMPORT.md](IMPORT.md#job-giornaliero-dunkest).

Lega privata su Dunkest (issue #72, migrazione `20261027112155_dunkest_lega.sql`): `seasons.dunkest_league_id` e `dunkest_tournament_id`, `players.dunkest_fantasy_id` (id nell'app della lega, diverso da `dunkest_id`), `dunkest_teams` (squadra della lega → squadra Dunkest per stagione, esplicito), `dunkest_standings` (classifica del torneo testa a testa: posizione, punti totali, vittorie/pareggi/sconfitte), `dunkest_matches` (calendario: uno scontro per riga con numero di giornata e punti, null = da giocare), `dunkest_lineups` (quintetto e panchina di ogni scontro iniziato, con capitano e sesto uomo; `player_id` null = non collegato). In `dunkest_sync` lo stato della parte di lega (`league_*`, `calendar_at`) e del token (`token_ok_since`, `token_ok_at`, `token_rejected_at`); in `dunkest_sync_runs` le esecuzioni hanno `kind` `stats` o `league`. Le scrivono solo le RPC `dunkest_league_*` del job. La classifica Dunkest non alimenta (ancora) `team_season.final_rank`: vedi domanda 7 in [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).
RLS: `select` per ogni utente autenticato; `insert/update/delete` solo se `is_admin()`. Le scritture admin passano da RPC `security definer` (vedi CLAUDE.md).
Seed squadre (owner → team): Amedeo → Assago Farmers, Lugiu → CUS Cosenza, Gabby → Bol Bollerz, Damiano → Dame Time, Scuti → Atlanto Non Vinco, Serde → Spaccinos, CC → OKCC, Antonio → San Antonio.
`team_season.final_rank` è inserita dall'admin a fine stagione in `/admin/chiusura`, che calcola bonus (`rank_bonus_1..8`), ordine del draft (`lottery_teams`) e apre la stagione nuova (`admin_close_season`); `entry_fee_paid` e `luxury_tax_paid` tracciano i pagamenti. Le righe della stagione chiusa (`contracts`, `cuts`, `team_season`) restano come storico; i contratti in scadenza finiscono in `last_contracts` (`restricted` = la squadra può pareggiare, R-23).

Nota: nel foglio alcune squadre non rispettano ancora 5G/5A/3C o le 3 riserve minime (offseason in corso): i minimi **avvisano**, i massimi di rosa bloccano firma/modifica/rientro (`rosterLimitErrors` in `lib/cap.ts`, vedi OPEN-QUESTIONS).

Collegamento nome breve → giocatore: l'import collega un giocatore al listone solo se coincidono cognome **e** (proprietario in colonna `Restricted` **oppure** stipendio = crediti). Un cognome uguale non basta: l'elenco contiene solo free agent, quindi un omonimo sarebbe un falso collegamento (es. Jahmir Young al posto di Trae Young). I casi non collegati restano giocatori provvisori con il solo nome del foglio.
