-- Rose su Dunkest e allineamento di titolari e riserve (issue #72, seguito). Decisione dell'utente (2026-10-27): chi è nella
-- rosa Dunkest di una squadra (quintetto, panchina o tribuna, 13 giocatori) è un titolare nell'app. Il job salva le rose; in
-- /admin/dunkest un admin vede lo scambio titolare↔riserva da fare e lo conferma con `admin_swap_slots` (proposta + conferma,
-- non automatico). Se il cap sfora l'app avvisa e allinea lo stesso: la regola sta in src/lib/dunkest-league.ts, non qui.
--
-- Fonte: `GET /api/v1/fantasy-leagues/<lega>/fantasy-teams/<squadra>` (13 giocatori di qualsiasi squadra della lega), verificata
-- il 2026-10-27.

-- Rosa Dunkest di ogni squadra: si sostituisce per intero a ogni aggiornamento. `player_id` null = non collegato.
create table dunkest_rosters (
  season_id int not null references seasons,
  team_id uuid not null references teams,
  fantasy_player_id int not null,
  player_id int references players on delete set null,
  name text not null,
  pos player_pos,
  primary key (season_id, team_id, fantasy_player_id)
);
alter table dunkest_rosters enable row level security;
create policy "read" on dunkest_rosters for select to authenticated using (true);
create policy "admin write" on dunkest_rosters for all to authenticated using (is_admin()) with check (is_admin());

-- Nome diverso tra le due fonti (verificato il 2026-10-27): «Nicolas Claxton» su Dunkest, Nic Claxton nel listone.
update players set dunkest_fantasy_id = 130
where first_name = 'Nic' and last_name = 'Claxton' and dunkest_id = 593
  and not exists (select 1 from players o where o.dunkest_fantasy_id = 130);

-- ---------- Job: anche le rose (stessa transazione di classifica, calendario e formazioni) ----------
-- p_payload come in 20261027112155, più `rosters: [{team_id, fantasy_player_id, player_id, name, pos}]`. Se la chiave manca
-- le rose restano quelle di prima; se c'è non può essere vuota (fonte rotta). Quanti giocatori servono lo controlla il codice.
create or replace function dunkest_league_apply(p_secret text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_standings int;
  v_matches int;
  v_lineups int;
  v_rosters int := null;
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
  if p_payload ? 'rosters' then
    if jsonb_typeof(p_payload->'rosters') is distinct from 'array' or jsonb_array_length(p_payload->'rosters') = 0 then
      raise exception 'INVALID: rose vuote';
    end if;
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

  if p_payload ? 'rosters' then
    delete from dunkest_rosters where season_id = v_season;
    insert into dunkest_rosters (season_id, team_id, fantasy_player_id, player_id, name, pos)
      select v_season, r.team_id, r.fantasy_player_id, r.player_id, r.name, r.pos::player_pos
      from jsonb_to_recordset(p_payload->'rosters') as r(team_id uuid, fantasy_player_id int, player_id int, name text, pos text);
    get diagnostics v_rosters = row_count;
  end if;

  update dunkest_sync set
    league_attempt_at = now(), league_success_at = now(), league_error = null, league_error_code = null,
    league_report = p_payload->'report',
    calendar_at = case when coalesce((p_payload->>'full_calendar')::boolean, false) then now() else calendar_at end,
    token_ok_since = coalesce(token_ok_since, now()), token_ok_at = now()
  where id = 1;
  perform dunkest_league_log(p_secret, true, null,
    coalesce(p_payload->'report', '{}'::jsonb) || jsonb_build_object('standings', v_standings, 'matches', v_matches, 'lineups', v_lineups,
      'rosters', v_rosters, 'links', case when jsonb_typeof(p_payload->'links') = 'array' then jsonb_array_length(p_payload->'links') else 0 end));
  return jsonb_build_object('standings', v_standings, 'matches', v_matches, 'lineups', v_lineups, 'rosters', v_rosters);
end $$;

-- ---------- Admin: titolari e riserve di una squadra in un colpo solo ----------
-- p_items: [{id, version, slot}] (solo 'starter' o 'reserve'). Una transazione, controllo di versione per contratto e di
-- revisione della rosa per la squadra, una riga di audit per contratto più il riepilogo. Le regole (stesso numero di titolari,
-- avvisi di cap e riserve) le controlla l'action con src/lib/dunkest-league.ts e cap.ts.
create function admin_swap_slots(p_team_id uuid, p_roster_rev int, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_item jsonb;
  v_old contracts;
  v_n int := 0;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  if p_team_id is null or p_roster_rev is null then raise exception 'INVALID: squadra o revisione della rosa mancante'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'INVALID: nessun contratto da spostare'; end if;
  v_season := lock_current_season();
  perform roster_lock(jsonb_build_object(p_team_id::text, p_roster_rev));

  for v_item in select jsonb_array_elements(p_items) loop
    if (v_item ->> 'version') is null then raise exception 'INVALID: versione mancante'; end if;
    if (v_item ->> 'slot') not in ('starter', 'reserve') then raise exception 'INVALID: slot non valido'; end if;
    select * into v_old from contracts where id = (v_item ->> 'id')::int for update;
    if not found or v_old.team_id is distinct from p_team_id or v_old.season_id is distinct from v_season then
      raise exception 'CONFLICT: un contratto non è più di questa squadra (tagliato o scambiato da un altro admin?)';
    end if;
    if v_old.version is distinct from (v_item ->> 'version')::int then raise exception 'CONFLICT: un contratto è stato modificato da un altro admin'; end if;
    if v_old.slot::text = v_item ->> 'slot' then continue; end if;
    update contracts set slot = (v_item ->> 'slot')::roster_slot where id = v_old.id;
    v_n := v_n + 1;
    select trim(first_name || ' ' || last_name) into v_player from players where id = v_old.player_id;
    perform audit_write('update', 'contracts', v_old.id::text,
      jsonb_build_object('slot', v_old.slot),
      jsonb_build_object('slot', v_item ->> 'slot', 'summary', format('%s: %s', v_player, case when v_item ->> 'slot' = 'starter' then 'da riserva a titolare' else 'da titolare a riserva' end)));
  end loop;
  if v_n = 0 then raise exception 'INVALID: titolari e riserve sono già così'; end if;
  select name into v_team from teams where id = p_team_id;
  perform audit_write('update', 'contracts', null, null, jsonb_build_object('summary', format('Titolari e riserve di %s allineati a Dunkest (%s contratti)', v_team, v_n)));
  return v_n;
end $$;
revoke all on function admin_swap_slots(uuid, int, jsonb) from public, anon;
grant execute on function admin_swap_slots(uuid, int, jsonb) to authenticated;
