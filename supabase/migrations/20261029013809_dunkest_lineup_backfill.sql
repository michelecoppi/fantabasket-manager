-- Storico completo delle formazioni (Fase 6.0). Il job leggeva le formazioni solo intorno all'ultima giornata giocata, quindi
-- una giornata saltata (la 1: il primo giro del 27/10 ha letto solo la 2-4) restava senza formazioni per sempre. Ora la
-- sorgente dice per ogni giornata se ha almeno una formazione salvata (`has_lineups`) e il job recupera quelle giocate che
-- non ce l'hanno (`lineupBackfill` in src/lib/dunkest-league.ts, al massimo 3 per giro). Stessa firma e stessi permessi:
-- cambia solo un campo in più nel JSON, che il codice di prima ignora.
create or replace function dunkest_league_source(p_secret text) returns jsonb
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
      select jsonb_agg(jsonb_build_object('dunkest_matchday_id', m.dunkest_matchday_id, 'matchday', m.matchday, 'scored', m.scored,
                                          'has_lineups', m.has_lineups) order by m.matchday)
      from (select x.dunkest_matchday_id, x.matchday, bool_or(x.home_pts is not null or x.away_pts is not null) as scored,
                   bool_or(exists (select 1 from dunkest_lineups l where l.match_id = x.id)) as has_lineups
            from dunkest_matches x where x.season_id = v_season.id group by x.dunkest_matchday_id, x.matchday) m), '[]'::jsonb));
end $$;

revoke all on function dunkest_league_source(text) from public;
grant execute on function dunkest_league_source(text) to anon, authenticated;
