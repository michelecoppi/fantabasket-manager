-- Dati della lega privata su Dunkest (issue #72): classifica, calendario (scontri testa a testa per giornata) e formazioni
-- (quintetto e panchina di ogni scontro). Li scrive il job giornaliero `/api/dunkest` dopo statistiche e infortuni; le pagine
-- leggono solo queste tabelle.
--
-- La fonte è l'API dell'app Fantaking (`fantaking-api.dunkest.com/api/v1`, non documentata, verificata il 2026-10-27) e chiede
-- il token personale di un membro della lega: sta solo nella variabile d'ambiente DUNKEST_TOKEN di Vercel, mai nel database.
-- Qui si registra solo se funziona: da quando (`token_ok_since`) e quando Dunkest lo ha rifiutato (`token_rejected_at`).
--
-- Le RPC `dunkest_league_*` seguono le `dunkest_sync_*` (migrazione 20261027025827): segreto del job o admin, una transazione,
-- solo coerenza dei dati. Il confronto tra formazioni Dunkest e rose dell'app si fa nelle pagine (src/lib/dunkest-league.ts),
-- così segue le rose anche quando cambiano dopo l'aggiornamento.

-- ---------- Configurazione per stagione ----------
-- Lega e torneo Dunkest della stagione (2026-27: lega «DUNKESTARS» 164491, torneo testa a testa «KD FOTO PIEDI» 252941).
-- Senza valori il job salta la parte di lega e registra il motivo.
alter table seasons add column dunkest_league_id int, add column dunkest_tournament_id int;
update seasons set dunkest_league_id = 164491, dunkest_tournament_id = 252941 where year = 2026;

-- Id del giocatore nell'app della lega (Fantaking): non è lo stesso di dunkest.com (`players.dunkest_id`), es. Doncic 3 contro 127.
alter table players add column dunkest_fantasy_id int unique;
-- Nome diverso tra le due fonti (verificato il 2026-10-27): «Alex Sarr» nelle formazioni, Alexandre Sarr nel listone.
update players set dunkest_fantasy_id = 4562
where first_name = 'Alexandre' and last_name = 'Sarr' and dunkest_id = 2449
  and not exists (select 1 from players o where o.dunkest_fantasy_id = 4562);

-- Squadra della lega ↔ squadra Dunkest, esplicito per stagione (mai indovinato dal nome). Una squadra Dunkest senza riga qui
-- ferma il job con un errore chiaro.
create table dunkest_teams (
  season_id int not null references seasons,
  team_id uuid not null references teams,
  dunkest_team_id int not null,
  primary key (season_id, team_id),
  unique (season_id, dunkest_team_id)
);
-- Nomi su Dunkest il 2026-10-27: uguali ai nostri tranne «Chicago Spaccinos» (Spaccinos) e «San Antonio Spurs» (San Antonio).
insert into dunkest_teams (season_id, team_id, dunkest_team_id)
select s.id, t.id, v.dunkest_team_id
from seasons s
join (values
  ('Spaccinos', 3233625), ('Atlanto Non Vinco', 3233650), ('Assago Farmers', 3233688), ('San Antonio', 3233754),
  ('Dame Time', 3233925), ('CUS Cosenza', 3234157), ('Bol Bollerz', 3234455), ('OKCC', 3234648)
) as v(team_name, dunkest_team_id) on true
join teams t on t.name = v.team_name
where s.year = 2026
on conflict do nothing;

-- ---------- Dati ----------
-- Classifica del torneo (testa a testa): si sostituisce per intero a ogni aggiornamento.
create table dunkest_standings (
  season_id int not null references seasons,
  team_id uuid not null references teams,
  position int not null check (position > 0),
  total_pts numeric(8,2) not null,
  wins int not null default 0 check (wins >= 0),
  draws int not null default 0 check (draws >= 0),
  losses int not null default 0 check (losses >= 0),
  updated_at timestamptz not null default now(),
  primary key (season_id, team_id)
);

-- Calendario: uno scontro per riga, con il risultato (punti null = da giocare). `matchday` è il numero di giornata del torneo
-- (1 = la giornata d'inizio), `dunkest_matchday_id` l'id Dunkest della giornata. `winner_team_id` durante una giornata in
-- corso è chi sta vincendo.
create table dunkest_matches (
  id bigint primary key,
  season_id int not null references seasons,
  matchday int not null check (matchday > 0),
  dunkest_matchday_id int not null,
  home_team_id uuid not null references teams,
  away_team_id uuid not null references teams,
  home_pts numeric(7,2),
  away_pts numeric(7,2),
  winner_team_id uuid references teams,
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);
create index dunkest_matches_season_matchday on dunkest_matches (season_id, matchday);

-- Formazione schierata in uno scontro: quintetto (`starter`) e panchina (`bench`, con il sesto uomo). Chi della rosa non c'è
-- sta in tribuna: lo si ricava dalle nostre rose. `player_id` null = giocatore Dunkest non collegato a uno della lega.
create table dunkest_lineups (
  match_id bigint not null references dunkest_matches on delete cascade,
  team_id uuid not null references teams,
  fantasy_player_id int not null,
  player_id int references players on delete set null,
  name text not null,
  pos player_pos,
  role text not null check (role in ('starter', 'bench')),
  court_position int not null,
  is_captain boolean not null default false,
  is_sixth_man boolean not null default false,
  pts numeric(6,2),
  primary key (match_id, team_id, fantasy_player_id)
);

-- Stato della parte di lega, accanto a quello di statistiche e infortuni (stessa riga). `league_error_code`:
-- token_missing (DUNKEST_TOKEN non impostato), token_rejected (Dunkest risponde 401: token scaduto o revocato), error.
alter table dunkest_sync
  add column league_attempt_at timestamptz,
  add column league_success_at timestamptz,
  add column league_error text,
  add column league_error_code text check (league_error_code in ('token_missing', 'token_rejected', 'error')),
  add column league_report jsonb,
  add column calendar_at timestamptz,
  add column token_ok_since timestamptz,
  add column token_ok_at timestamptz,
  add column token_rejected_at timestamptz;

-- Storico: le esecuzioni della parte di lega sono righe a sé (`kind = 'league'`), con conteggi e report in `report`.
alter table dunkest_sync_runs add column kind text not null default 'stats' check (kind in ('stats', 'league'));

do $$
declare t text;
begin
  foreach t in array array['dunkest_teams', 'dunkest_standings', 'dunkest_matches', 'dunkest_lineups'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read" on %I for select to authenticated using (true)', t);
    execute format('create policy "admin write" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- ---------- RPC del job ----------
create function dunkest_league_log(p_secret text, p_ok boolean, p_error text, p_report jsonb) returns void
language sql security definer set search_path = public as $$
  delete from dunkest_sync_runs where at < now() - interval '90 days';
  insert into dunkest_sync_runs (kind, trigger, user_id, ok, links_count, error, report)
  values ('league', case when p_secret is null and is_admin() then 'admin' else 'cron' end, auth.uid(), p_ok,
          (p_report->>'links')::int, p_error, p_report);
$$;
revoke all on function dunkest_league_log(text, boolean, text, jsonb) from public, anon, authenticated;

-- Quello che serve al job: id Dunkest di lega e torneo, squadre collegate, giocatori (con l'id Fantaking già trovato) e le
-- giornate già in calendario, con l'ultima lettura completa del calendario.
create function dunkest_league_source(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_season seasons;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  select * into v_season from seasons where is_current;
  if not found then raise exception 'INVALID: nessuna stagione corrente'; end if;
  if v_season.dunkest_tournament_id is null then raise exception 'INVALID: la stagione % non ha il torneo Dunkest', v_season.year; end if;
  return jsonb_build_object(
    'season_id', v_season.id,
    'league_id', v_season.dunkest_league_id,
    'tournament_id', v_season.dunkest_tournament_id,
    'calendar_at', (select calendar_at from dunkest_sync where id = 1),
    'teams', coalesce((
      select jsonb_agg(jsonb_build_object('team_id', d.team_id, 'dunkest_team_id', d.dunkest_team_id, 'name', t.name) order by t.name)
      from dunkest_teams d join teams t on t.id = d.team_id where d.season_id = v_season.id), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'nba_team', p.nba_team, 'fantasy_id', p.dunkest_fantasy_id) order by p.id)
      from players p), '[]'::jsonb),
    'matchdays', coalesce((
      select jsonb_agg(jsonb_build_object('dunkest_matchday_id', m.dunkest_matchday_id, 'matchday', m.matchday, 'scored', m.scored) order by m.matchday)
      from (select dunkest_matchday_id, matchday, bool_or(home_pts is not null or away_pts is not null) as scored
            from dunkest_matches where season_id = v_season.id group by dunkest_matchday_id, matchday) m), '[]'::jsonb));
end $$;

-- Scrive tutto in una transazione. p_payload:
--   { season_id, full_calendar, standings: [{team_id, position, total_pts, wins, draws, losses}],
--     matches: [{id, matchday, dunkest_matchday_id, home_team_id, away_team_id, home_pts, away_pts, winner_team_id}],
--     lineup_matches: [id...] (scontri di cui si sono lette le formazioni: le loro righe si sostituiscono),
--     lineups: [{match_id, team_id, fantasy_player_id, player_id, name, pos, role, court_position, is_captain, is_sixth_man, pts}],
--     links: [{player_id, fantasy_id}], report }
-- Con full_calendar il calendario della stagione diventa esattamente quello del payload.
create function dunkest_league_apply(p_secret text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_standings int;
  v_matches int;
  v_lineups int;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  if p_payload is null then raise exception 'INVALID: payload mancante'; end if;
  perform 1 from dunkest_sync where id = 1 for update;

  select id into v_season from seasons where is_current;
  if v_season is null or v_season is distinct from (p_payload->>'season_id')::int then
    raise exception 'CONFLICT: la stagione corrente è cambiata durante l''aggiornamento';
  end if;
  -- Classifica vuota = fonte rotta: meglio tenere quella di ieri.
  if jsonb_typeof(p_payload->'standings') is distinct from 'array' or jsonb_array_length(p_payload->'standings') = 0 then
    raise exception 'INVALID: classifica vuota';
  end if;
  if jsonb_typeof(p_payload->'matches') is distinct from 'array' then raise exception 'INVALID: calendario mancante'; end if;
  if coalesce((p_payload->>'full_calendar')::boolean, false) and jsonb_array_length(p_payload->'matches') = 0 then
    raise exception 'INVALID: calendario vuoto';
  end if;
  if jsonb_typeof(p_payload->'lineups') is distinct from 'array' or jsonb_typeof(p_payload->'lineup_matches') is distinct from 'array' then
    raise exception 'INVALID: formazioni mancanti';
  end if;

  -- Id Fantaking nuovi: uno per giocatore e un giocatore per id.
  if jsonb_typeof(p_payload->'links') = 'array' and jsonb_array_length(p_payload->'links') > 0 then
    if exists (select l.fantasy_id from jsonb_to_recordset(p_payload->'links') as l(player_id int, fantasy_id int) group by l.fantasy_id having count(*) > 1)
       or exists (select l.player_id from jsonb_to_recordset(p_payload->'links') as l(player_id int, fantasy_id int) group by l.player_id having count(*) > 1) then
      raise exception 'INVALID: collegamenti duplicati';
    end if;
    update players set dunkest_fantasy_id = null
      where dunkest_fantasy_id in (select l.fantasy_id from jsonb_to_recordset(p_payload->'links') as l(player_id int, fantasy_id int))
        and id not in (select l.player_id from jsonb_to_recordset(p_payload->'links') as l(player_id int, fantasy_id int));
    update players p set dunkest_fantasy_id = l.fantasy_id
      from jsonb_to_recordset(p_payload->'links') as l(player_id int, fantasy_id int) where p.id = l.player_id;
  end if;

  delete from dunkest_standings where season_id = v_season;
  insert into dunkest_standings (season_id, team_id, position, total_pts, wins, draws, losses)
    select v_season, s.team_id, s.position, s.total_pts, coalesce(s.wins, 0), coalesce(s.draws, 0), coalesce(s.losses, 0)
    from jsonb_to_recordset(p_payload->'standings') as s(team_id uuid, position int, total_pts numeric, wins int, draws int, losses int);
  get diagnostics v_standings = row_count;

  if coalesce((p_payload->>'full_calendar')::boolean, false) then
    delete from dunkest_matches where season_id = v_season
      and id not in (select (m->>'id')::bigint from jsonb_array_elements(p_payload->'matches') m);
  end if;
  insert into dunkest_matches (id, season_id, matchday, dunkest_matchday_id, home_team_id, away_team_id, home_pts, away_pts, winner_team_id, updated_at)
    select m.id, v_season, m.matchday, m.dunkest_matchday_id, m.home_team_id, m.away_team_id, m.home_pts, m.away_pts, m.winner_team_id, now()
    from jsonb_to_recordset(p_payload->'matches') as m(id bigint, matchday int, dunkest_matchday_id int, home_team_id uuid, away_team_id uuid,
                                                      home_pts numeric, away_pts numeric, winner_team_id uuid)
  on conflict (id) do update set
    season_id = excluded.season_id, matchday = excluded.matchday, dunkest_matchday_id = excluded.dunkest_matchday_id,
    home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id, home_pts = excluded.home_pts,
    away_pts = excluded.away_pts, winner_team_id = excluded.winner_team_id, updated_at = now();
  get diagnostics v_matches = row_count;

  delete from dunkest_lineups where match_id in (select (x #>> '{}')::bigint from jsonb_array_elements(p_payload->'lineup_matches') x);
  insert into dunkest_lineups (match_id, team_id, fantasy_player_id, player_id, name, pos, role, court_position, is_captain, is_sixth_man, pts)
    select l.match_id, l.team_id, l.fantasy_player_id, l.player_id, l.name, l.pos::player_pos, l.role, l.court_position,
           coalesce(l.is_captain, false), coalesce(l.is_sixth_man, false), l.pts
    from jsonb_to_recordset(p_payload->'lineups') as l(match_id bigint, team_id uuid, fantasy_player_id int, player_id int, name text, pos text,
                                                      role text, court_position int, is_captain boolean, is_sixth_man boolean, pts numeric);
  get diagnostics v_lineups = row_count;

  update dunkest_sync set
    league_attempt_at = now(), league_success_at = now(), league_error = null, league_error_code = null,
    league_report = p_payload->'report',
    calendar_at = case when coalesce((p_payload->>'full_calendar')::boolean, false) then now() else calendar_at end,
    token_ok_since = coalesce(token_ok_since, now()), token_ok_at = now()
  where id = 1;
  perform dunkest_league_log(p_secret, true, null,
    coalesce(p_payload->'report', '{}'::jsonb) || jsonb_build_object('standings', v_standings, 'matches', v_matches, 'lineups', v_lineups,
      'links', case when jsonb_typeof(p_payload->'links') = 'array' then jsonb_array_length(p_payload->'links') else 0 end));
  return jsonb_build_object('standings', v_standings, 'matches', v_matches, 'lineups', v_lineups);
end $$;

-- Tentativo fallito: i dati restano quelli di prima. Con 'token_rejected' il token smette di contare come funzionante.
create function dunkest_league_fail(p_secret text, p_code text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare v_code text := case when p_code in ('token_missing', 'token_rejected') then p_code else 'error' end;
        v_error text := left(coalesce(nullif(p_error, ''), 'errore sconosciuto'), 500);
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  update dunkest_sync set
    league_attempt_at = now(), league_error = v_error, league_error_code = v_code,
    token_rejected_at = case when v_code = 'token_rejected' then now() else token_rejected_at end,
    token_ok_since = case when v_code = 'token_rejected' then null else token_ok_since end
  where id = 1;
  perform dunkest_league_log(p_secret, false, v_error, jsonb_build_object('code', v_code));
end $$;

revoke all on function dunkest_league_source(text) from public;
revoke all on function dunkest_league_apply(text, jsonb) from public;
revoke all on function dunkest_league_fail(text, text, text) from public;
grant execute on function dunkest_league_source(text) to anon, authenticated;
grant execute on function dunkest_league_apply(text, jsonb) to anon, authenticated;
grant execute on function dunkest_league_fail(text, text, text) to anon, authenticated;
