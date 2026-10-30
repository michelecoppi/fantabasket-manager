-- Partite e giornate dei giocatori NBA su Dunkest: leader della notte, leader della giornata (settimana fantasy "M4") e
-- andamento partita per partita. Scritte dal job giornaliero (`/api/dunkest`), come il resto dei dati Dunkest: le pagine
-- leggono solo queste tabelle.
--
-- `dunkest_games`: una riga per giocatore e per giorno di gioco (data americana, come la dà Dunkest), da `/api/stats/table`
-- con `date_from = date_to`. `dunkest_week_stats`: totale per giocatore di una giornata fantasy (settimana Dunkest = numero
-- di giornata della lega, ASSUNZIONE verificata il 2026-10-30 sulle giornate 1-4), somma dei round letti uno a uno.
-- Come `dunkest_lineups`: `player_id` è null se il giocatore non è (ancora) collegato al listone, e si ricollega a ogni
-- aggiornamento; nome, ruolo e squadra sono copiati perché la classifica NBA li mostri anche per chi non è nel listone.

create table dunkest_games (
  season_id int not null references seasons,
  dunkest_id int not null,
  game_date date not null,
  player_id int references players on delete set null,
  name text not null,
  pos player_pos,
  team_code text not null,
  pdk numeric(6,2) not null,
  min numeric(4,1) not null default 0,
  starter boolean not null default false,
  pts int not null default 0,
  reb int not null default 0,
  ast int not null default 0,
  stl int not null default 0,
  blk int not null default 0,
  tov int not null default 0,
  primary key (season_id, dunkest_id, game_date)
);
create index dunkest_games_day on dunkest_games (season_id, game_date, pdk desc);
create index dunkest_games_player on dunkest_games (player_id, game_date);

create table dunkest_week_stats (
  season_id int not null references seasons,
  week int not null check (week > 0),
  dunkest_id int not null,
  player_id int references players on delete set null,
  name text not null,
  pos player_pos,
  team_code text not null,
  gp int not null check (gp > 0),
  pdk numeric(7,2) not null,
  pts int not null default 0,
  reb int not null default 0,
  ast int not null default 0,
  primary key (season_id, week, dunkest_id)
);
create index dunkest_week_stats_leaders on dunkest_week_stats (season_id, week, pdk desc);
create index dunkest_week_stats_player on dunkest_week_stats (player_id);

do $$
declare t text;
begin
  foreach t in array array['dunkest_games', 'dunkest_week_stats'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read" on %I for select to authenticated using (true)', t);
    execute format('create policy "admin write" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Giorni di gioco letti, con quanti giocatori: per i chip dei leader (una riga per giorno invece di centinaia).
create view dunkest_game_days with (security_invoker = true) as
  select season_id, game_date, count(*)::int as players from dunkest_games group by season_id, game_date;

-- ---------- RPC del job ----------
-- Da dove ripartire: ultimo giorno letto, giornata in corso della lega (l'ultima con punti) e giornate già lette.
create function dunkest_games_source(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_season seasons;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  select * into v_season from seasons where is_current;
  if not found then raise exception 'INVALID: nessuna stagione corrente'; end if;
  if v_season.dunkest_season_id is null then raise exception 'INVALID: la stagione % non ha dunkest_season_id', v_season.year; end if;
  return jsonb_build_object(
    'season_id', v_season.id,
    'dunkest_season_id', v_season.dunkest_season_id,
    'year', v_season.year,
    'last_date', (select max(game_date) from dunkest_games where season_id = v_season.id),
    'current_week', (select max(matchday) from dunkest_matches where season_id = v_season.id and (home_pts is not null or away_pts is not null)),
    'weeks', coalesce((select jsonb_agg(distinct week order by week) from dunkest_week_stats where season_id = v_season.id), '[]'::jsonb));
end $$;

-- Scrive i giorni e le giornate letti. Un giorno (o una giornata) presente nel payload sostituisce le righe che c'erano; uno
-- assente o vuoto non tocca niente, così una fonte che risponde "nessuna partita" per sbaglio non cancella lo storico.
-- p_payload: { season_id, games: [{dunkest_id, game_date, name, pos, team_code, pdk, min, starter, pts, reb, ast, stl, blk, tov}],
--              weeks: [{week, stats: [{dunkest_id, name, pos, team_code, gp, pdk, pts, reb, ast}]}] }
create function dunkest_games_apply(p_secret text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_games int := 0;
  v_weeks int := 0;
  v_week record;
  v_n int;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  if p_payload is null then raise exception 'INVALID: payload mancante'; end if;
  if jsonb_typeof(p_payload->'games') is distinct from 'array' or jsonb_typeof(p_payload->'weeks') is distinct from 'array' then
    raise exception 'INVALID: liste di partite e giornate mancanti';
  end if;
  -- Un aggiornamento alla volta (stessa riga di blocco degli altri job Dunkest).
  perform 1 from dunkest_sync where id = 1 for update;

  select id into v_season from seasons where is_current;
  if v_season is null or v_season is distinct from (p_payload->>'season_id')::int then
    raise exception 'CONFLICT: la stagione corrente è cambiata durante l''aggiornamento';
  end if;

  if jsonb_array_length(p_payload->'games') > 0 then
    delete from dunkest_games
      where season_id = v_season
        and game_date in (select distinct g.game_date from jsonb_to_recordset(p_payload->'games') as g(game_date date));
    insert into dunkest_games (season_id, dunkest_id, game_date, name, pos, team_code, pdk, min, starter, pts, reb, ast, stl, blk, tov)
      select v_season, g.dunkest_id, g.game_date, g.name, g.pos, g.team_code, g.pdk, coalesce(g.min, 0), coalesce(g.starter, false),
             coalesce(g.pts, 0), coalesce(g.reb, 0), coalesce(g.ast, 0), coalesce(g.stl, 0), coalesce(g.blk, 0), coalesce(g.tov, 0)
      from jsonb_to_recordset(p_payload->'games')
        as g(dunkest_id int, game_date date, name text, pos player_pos, team_code text, pdk numeric, min numeric, starter boolean,
             pts int, reb int, ast int, stl int, blk int, tov int);
    get diagnostics v_games = row_count;
  end if;

  for v_week in select w.week, w.stats from jsonb_to_recordset(p_payload->'weeks') as w(week int, stats jsonb) loop
    if v_week.week is null or v_week.week < 1 then raise exception 'INVALID: giornata senza numero'; end if;
    if jsonb_typeof(v_week.stats) is distinct from 'array' or jsonb_array_length(v_week.stats) = 0 then continue; end if;
    delete from dunkest_week_stats where season_id = v_season and week = v_week.week;
    insert into dunkest_week_stats (season_id, week, dunkest_id, name, pos, team_code, gp, pdk, pts, reb, ast)
      select v_season, v_week.week, s.dunkest_id, s.name, s.pos, s.team_code, s.gp, s.pdk, coalesce(s.pts, 0), coalesce(s.reb, 0), coalesce(s.ast, 0)
      from jsonb_to_recordset(v_week.stats)
        as s(dunkest_id int, name text, pos player_pos, team_code text, gp int, pdk numeric, pts int, reb int, ast int);
    get diagnostics v_n = row_count;
    v_weeks := v_weeks + v_n;
  end loop;

  -- Collegamento al listone: l'id Dunkest vale quando una delle statistiche di oggi l'ha già salvato in players.dunkest_id.
  update dunkest_games g set player_id = p.id from players p
    where p.dunkest_id = g.dunkest_id and g.season_id = v_season and g.player_id is distinct from p.id;
  update dunkest_week_stats w set player_id = p.id from players p
    where p.dunkest_id = w.dunkest_id and w.season_id = v_season and w.player_id is distinct from p.id;

  return jsonb_build_object('games', v_games, 'weeks', v_weeks);
end $$;

revoke all on function dunkest_games_source(text) from public;
revoke all on function dunkest_games_apply(text, jsonb) from public;
grant execute on function dunkest_games_source(text) to anon, authenticated;
grant execute on function dunkest_games_apply(text, jsonb) to anon, authenticated;
