-- Quali partite conta Dunkest, una per una (issue #98, seguito di 20261104093300). Ogni round di una giornata fantasy è una
-- notte NBA (data americana di `dunkest_rounds.starts_at`), ma comprende solo alcune partite di quella notte: le altre non
-- contano né per la media del sito né per i punti della lega. La risposta di un round elenca i giocatori che ci hanno giocato,
-- quindi: partita valida = il giocatore è nell'elenco del round di quella notte. Verificato il 2026-11-04 sulle giornate 1-5
-- contro `gameValidForDunkest` di `/api/player/games` (Wembanyama, Doncic, Antetokounmpo, Tatum: 28 partite su 28).

-- Chi ha giocato in ogni round, scritto dal job insieme ai totali della giornata (`dunkest_games_apply`).
create table dunkest_round_players (
  season_id int not null references seasons,
  week int not null check (week > 0),
  round int not null check (round > 0),
  dunkest_id int not null,
  primary key (season_id, week, round, dunkest_id)
);
create index dunkest_round_players_player on dunkest_round_players (season_id, dunkest_id);
alter table dunkest_round_players enable row level security;
create policy "read" on dunkest_round_players for select to authenticated using (true);
create policy "admin write" on dunkest_round_players for all to authenticated using (is_admin()) with check (is_admin());

-- Log partita per partita con `valid`: la pagina del giocatore distingue le partite che Dunkest conta.
create view dunkest_game_log with (security_invoker = true) as
  select g.*,
         exists (
           select 1
           from dunkest_round_players rp
           join dunkest_rounds r on r.season_id = rp.season_id and r.matchday = rp.week and r.round = rp.round
           where rp.season_id = g.season_id and rp.dunkest_id = g.dunkest_id
             and g.game_date between (r.starts_at at time zone 'America/New_York')::date and (r.ends_at at time zone 'America/New_York')::date
         ) as valid
  from dunkest_games g;

-- Medie valide: anche i minuti ora contano solo le partite valide (null finché il job non ha letto i round del giocatore).
create or replace view dunkest_valid_stats with (security_invoker = true) as
  with m as (
    select season_id, player_id, round(avg(min), 1) as min
    from dunkest_game_log
    where valid and player_id is not null
    group by season_id, player_id
  )
  select w.season_id, w.player_id,
         sum(w.gp)::int as gp,
         round(sum(w.pdk) / sum(w.gp), 2) as pdk,
         round(sum(w.pts)::numeric / sum(w.gp), 1) as pts,
         round(sum(w.reb)::numeric / sum(w.gp), 1) as reb,
         round(sum(w.ast)::numeric / sum(w.gp), 1) as ast,
         max(m.min) as min
  from dunkest_week_stats w
  left join m on m.season_id = w.season_id and m.player_id = w.player_id
  where w.player_id is not null
  group by w.season_id, w.player_id;

-- Giornate già lette = quelle con l'elenco dei round: le giornate lette prima di questa migrazione risultano da rileggere, e il
-- job le recupera da sole (fino a 2 per giro, `weeksToRead`).
create or replace function dunkest_games_source(p_secret text) returns jsonb
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
    'weeks', coalesce((select jsonb_agg(distinct week order by week) from dunkest_round_players where season_id = v_season.id), '[]'::jsonb));
end $$;

-- Come la versione di 20261030133147, più `rounds` per giornata: [{round, ids: [dunkest_id]}]. Una giornata con statistiche
-- sostituisce anche i suoi round; senza `rounds` (codice del job precedente) i round restano com'erano.
-- p_payload: { season_id, games: [{dunkest_id, game_date, name, pos, team_code, pdk, min, starter, pts, reb, ast, stl, blk, tov}],
--              weeks: [{week, stats: [{dunkest_id, name, pos, team_code, gp, pdk, pts, reb, ast}], rounds: [{round, ids}]}] }
create or replace function dunkest_games_apply(p_secret text, p_payload jsonb) returns jsonb
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

  for v_week in select w.week, w.stats, w.rounds from jsonb_to_recordset(p_payload->'weeks') as w(week int, stats jsonb, rounds jsonb) loop
    if v_week.week is null or v_week.week < 1 then raise exception 'INVALID: giornata senza numero'; end if;
    if jsonb_typeof(v_week.stats) is distinct from 'array' or jsonb_array_length(v_week.stats) = 0 then continue; end if;
    delete from dunkest_week_stats where season_id = v_season and week = v_week.week;
    insert into dunkest_week_stats (season_id, week, dunkest_id, name, pos, team_code, gp, pdk, pts, reb, ast)
      select v_season, v_week.week, s.dunkest_id, s.name, s.pos, s.team_code, s.gp, s.pdk, coalesce(s.pts, 0), coalesce(s.reb, 0), coalesce(s.ast, 0)
      from jsonb_to_recordset(v_week.stats)
        as s(dunkest_id int, name text, pos player_pos, team_code text, gp int, pdk numeric, pts int, reb int, ast int);
    get diagnostics v_n = row_count;
    v_weeks := v_weeks + v_n;
    if jsonb_typeof(v_week.rounds) = 'array' then
      delete from dunkest_round_players where season_id = v_season and week = v_week.week;
      insert into dunkest_round_players (season_id, week, round, dunkest_id)
        select distinct v_season, v_week.week, r.round, i.id::int
        from jsonb_to_recordset(v_week.rounds) as r(round int, ids jsonb)
        cross join lateral jsonb_array_elements_text(r.ids) as i(id)
        where r.round > 0;
    end if;
  end loop;

  -- Collegamento al listone: l'id Dunkest vale quando una delle statistiche di oggi l'ha già salvato in players.dunkest_id.
  update dunkest_games g set player_id = p.id from players p
    where p.dunkest_id = g.dunkest_id and g.season_id = v_season and g.player_id is distinct from p.id;
  update dunkest_week_stats w set player_id = p.id from players p
    where p.dunkest_id = w.dunkest_id and w.season_id = v_season and w.player_id is distinct from p.id;

  return jsonb_build_object('games', v_games, 'weeks', v_weeks);
end $$;
