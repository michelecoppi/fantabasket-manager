-- Albo d'oro: classifiche finali delle stagioni giocate prima dell'app (2022/23 – 2025/26), dagli screenshot di Dunkest
-- mandati dall'utente il 2026-10-29 (file 2022_2023.jpg … 2025_2026.jpg). Le stagioni gestite dall'app si leggono invece da
-- `dunkest_standings` e `team_season`.
--
-- `team_id` collega la riga alla squadra di oggi quando è la stessa squadra (anche se su Dunkest aveva un altro nome:
-- «Oklahoma C.C. Thunder» = OKCC, «San Entony/Antony Spurs» = San Antonio). Le squadre non più in lega hanno `team_id` null e
-- una `former_key` che tiene insieme i nomi della stessa squadra (stesso proprietario: Las Vegas Sinners → LECLERC SCARSO).
-- `replaced_by` = la squadra di oggi entrata al suo posto. Decisioni dell'utente (2026-10-29): chi prende il posto di una
-- squadra uscita non ne eredita la storia (stagioni, record, anelli); la successione si mostra soltanto.
-- I nomi dei proprietari su Dunkest non si salvano (repo pubblico).

create table league_history (
  season_year int not null check (season_year between 2000 and 2100), -- come seasons.year: 2022 = stagione 2022/23
  position int not null check (position between 1 and 20),
  team_name text not null,                                            -- nome su Dunkest in quella stagione
  team_id uuid references teams on delete set null,
  former_key text,                                                    -- squadra uscita: stessa chiave = stessa squadra
  replaced_by uuid references teams on delete set null,
  wins int not null check (wins >= 0),
  losses int not null check (losses >= 0),
  total_pts numeric(8,2) not null check (total_pts >= 0),
  primary key (season_year, position),
  unique (season_year, team_name),
  check (former_key is null or team_id is null),
  check (replaced_by is null or former_key is not null)
);
create unique index league_history_team_once on league_history (season_year, team_id) where team_id is not null;

alter table league_history enable row level security;
create policy "read" on league_history for select to authenticated using (true);
create policy "admin write" on league_history for all to authenticated using (is_admin()) with check (is_admin());

-- `current_team` = nome della squadra oggi in `teams`; per le squadre uscite `former_key` e `successor` (nome in `teams` di chi
-- è entrato al suo posto). Se una squadra attesa manca, la join lascia l'id null: il controllo in fondo lo impedisce.
insert into league_history (season_year, position, team_name, team_id, former_key, replaced_by, wins, losses, total_pts)
select v.season_year, v.position, v.team_name, t.id, f.former_key, n.id, v.wins, v.losses, v.total_pts
from (values
  (2022, 1, 'San Diego Prolet',      null,                40, 24, 17045.53),
  (2022, 2, 'Chicago Spaccinos',     'Spaccinos',         38, 26, 17650.29),
  (2022, 3, 'Oklahoma C.C. Thunder', 'OKCC',              36, 28, 16576.17),
  (2022, 4, 'Bol Bollerz',           'Bol Bollerz',       35, 29, 16946.33),
  (2022, 5, 'Las Vegas Sinners',     null,                33, 31, 16357.17),
  (2022, 6, 'Assago Farmers',        'Assago Farmers',    30, 34, 15597.56),
  (2022, 7, 'Dame Time',             'Dame Time',         26, 38, 16029.79),
  (2022, 8, 'S.S. Olimpica',         null,                18, 46, 14134.87),

  (2023, 1, 'Dame Time',             'Dame Time',         43, 19, 16258.46),
  (2023, 2, 'Bol Bollerz',           'Bol Bollerz',       42, 20, 16297.26),
  (2023, 3, 'Chicago Spaccinos',     'Spaccinos',         37, 25, 15951.65),
  (2023, 4, 'Assago Farmers',        'Assago Farmers',    33, 29, 15911.21),
  (2023, 5, 'Oklahoma C.C. Thunder', 'OKCC',              31, 31, 15446.47),
  (2023, 6, 'San Diego Prolet',      null,                29, 33, 15282.05),
  (2023, 7, 'Atlanto Non Vinco',     'Atlanto Non Vinco', 18, 44, 13736.30),
  (2023, 8, 'LECLERC SCARSO',        null,                15, 47, 13326.79),

  (2024, 1, 'Assago Farmers',        'Assago Farmers',    44, 20, 16289.62),
  (2024, 2, 'San Diego Prolet',      null,                39, 25, 15224.44),
  (2024, 3, 'San Entony Spurs',      'San Antonio',       37, 27, 14995.39),
  (2024, 4, 'Dame Time',             'Dame Time',         35, 29, 14848.54),
  (2024, 5, 'Oklahoma C.C. Thunder', 'OKCC',              34, 30, 15479.37),
  (2024, 6, 'Chicago Spaccinos',     'Spaccinos',         27, 37, 14463.25),
  (2024, 7, 'Atlanto Non Vinco',     'Atlanto Non Vinco', 24, 40, 13829.58),
  (2024, 8, 'Bol Bollerz',           'Bol Bollerz',       16, 48, 12413.85),

  (2025, 1, 'Bol Bollerz',           'Bol Bollerz',       39, 25, 15894.62),
  (2025, 2, 'Oklahoma C.C. Thunder', 'OKCC',              37, 27, 14283.50),
  (2025, 3, 'Atlanto Non Vinco',     'Atlanto Non Vinco', 36, 28, 14875.01),
  (2025, 4, 'Chicago Spaccinos',     'Spaccinos',         35, 29, 14678.43),
  (2025, 5, 'San Antony Spurs',      'San Antonio',       33, 31, 14177.26),
  (2025, 6, 'Dame Time',             'Dame Time',         32, 32, 14217.66),
  (2025, 7, 'Assago Farmers',        'Assago Farmers',    30, 34, 14350.44),
  (2025, 8, 'Cus Cosenza',           'CUS Cosenza',       14, 50, 11843.98)
) as v(season_year, position, team_name, current_team, wins, losses, total_pts)
left join teams t on t.name = v.current_team
left join (values
  ('San Diego Prolet',  'prolet',    'CUS Cosenza'),
  ('S.S. Olimpica',     'olimpica',  'Atlanto Non Vinco'),
  ('Las Vegas Sinners', 'valentino', 'San Antonio'),
  ('LECLERC SCARSO',    'valentino', 'San Antonio')
) as f(team_name, former_key, successor) on f.team_name = v.team_name
left join teams n on n.name = f.successor;

do $$
begin
  -- 32 righe, 26 collegate a una squadra di oggi: se un nome in `teams` è cambiato la migrazione si ferma invece di
  -- scrivere uno storico mezzo scollegato. (Nella CI le migrazioni girano prima del seed, senza squadre: lì si salta.)
  if (select count(*) from league_history) <> 32 then raise exception 'league_history: attese 32 righe'; end if;
  if exists (select 1 from teams) and (select count(team_id) from league_history) <> 26 then
    raise exception 'league_history: attese 26 righe collegate alle squadre di oggi, trovate %', (select count(team_id) from league_history);
  end if;
  if (select count(*) from league_history where team_id is null and former_key is null) > 0 and exists (select 1 from teams) then
    raise exception 'league_history: squadra uscita senza former_key';
  end if;
  if exists (select 1 from teams) and (select count(distinct replaced_by) from league_history) <> 3 then
    raise exception 'league_history: attese 3 successioni (Atlanto, San Antonio, CUS Cosenza)';
  end if;
end $$;
