-- I crediti Dunkest cambiano nel corso della stagione: il job giornaliero li riscrive per tutti i giocatori che compaiono nelle statistiche
-- (prima li scriveva solo per i giocatori aggiunti al listone; chi era in rosa restava a null dopo l'import dal foglio).
-- p_payload.stats[].credits è opzionale: null (non ancora prezzato, o payload vecchio) lascia il valore che c'è.
create or replace function dunkest_sync_apply(p_secret text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_stats int;
  v_injuries int;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  if p_payload is null then raise exception 'INVALID: payload mancante'; end if;
  -- Un aggiornamento alla volta.
  perform 1 from dunkest_sync where id = 1 for update;

  select id into v_season from seasons where is_current;
  if v_season is null or v_season is distinct from (p_payload->>'season_id')::int then
    raise exception 'CONFLICT: la stagione corrente è cambiata durante l''aggiornamento';
  end if;
  -- Una lista di statistiche vuota vuol dire una fonte rotta, non zero partite: meglio tenere i dati di ieri.
  if jsonb_typeof(p_payload->'stats') is distinct from 'array' or jsonb_array_length(p_payload->'stats') = 0 then
    raise exception 'INVALID: nessuna statistica';
  end if;
  if jsonb_typeof(p_payload->'injuries') is distinct from 'array' then raise exception 'INVALID: lista infortuni mancante'; end if;

  -- Collegamenti nuovi: un id Dunkest appartiene a un solo giocatore.
  if jsonb_typeof(p_payload->'links') = 'array' and jsonb_array_length(p_payload->'links') > 0 then
    if exists (select l.dunkest_id from jsonb_to_recordset(p_payload->'links') as l(player_id int, dunkest_id int) group by l.dunkest_id having count(*) > 1)
       or exists (select l.player_id from jsonb_to_recordset(p_payload->'links') as l(player_id int, dunkest_id int) group by l.player_id having count(*) > 1) then
      raise exception 'INVALID: collegamenti duplicati';
    end if;
    update players set dunkest_id = null
      where dunkest_id in (select l.dunkest_id from jsonb_to_recordset(p_payload->'links') as l(player_id int, dunkest_id int))
        and id not in (select l.player_id from jsonb_to_recordset(p_payload->'links') as l(player_id int, dunkest_id int));
    update players p set dunkest_id = l.dunkest_id
      from jsonb_to_recordset(p_payload->'links') as l(player_id int, dunkest_id int) where p.id = l.player_id;
  end if;

  delete from dunkest_stats where season_id = v_season;
  insert into dunkest_stats (season_id, player_id, gp, pdk, min, pts, reb, ast)
    select v_season, s.player_id, s.gp, s.pdk, coalesce(s.min, 0), coalesce(s.pts, 0), coalesce(s.reb, 0), coalesce(s.ast, 0)
    from jsonb_to_recordset(p_payload->'stats') as s(player_id int, gp int, pdk numeric, min numeric, pts numeric, reb numeric, ast numeric);
  get diagnostics v_stats = row_count;

  -- Crediti di oggi (variabili): solo dove Dunkest ne dà uno.
  update players p set dunkest_credits = s.credits
    from jsonb_to_recordset(p_payload->'stats') as s(player_id int, credits numeric)
    where p.id = s.player_id and s.credits is not null and p.dunkest_credits is distinct from s.credits;

  delete from dunkest_injuries where true;
  insert into dunkest_injuries (player_id, injured_on, injury, description)
    select i.player_id, i.injured_on, i.injury, coalesce(i.description, '')
    from jsonb_to_recordset(p_payload->'injuries') as i(player_id int, injured_on date, injury text, description text);
  get diagnostics v_injuries = row_count;

  update dunkest_sync set
    last_attempt_at = now(), last_success_at = now(), last_error = null,
    source_updated_at = (p_payload->>'source_updated_at')::timestamptz,
    stats_count = v_stats, injuries_count = v_injuries, report = p_payload->'report'
  where id = 1;
  perform dunkest_sync_log(p_secret, true, v_stats, v_injuries,
    case when jsonb_typeof(p_payload->'links') = 'array' then jsonb_array_length(p_payload->'links') else 0 end, null, p_payload->'report');
  return jsonb_build_object('stats', v_stats, 'injuries', v_injuries);
end $$;
