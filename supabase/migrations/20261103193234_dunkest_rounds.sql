-- Round delle giornate NBA su Dunkest: per ogni giornata della lega quanti round ha, quando inizia ognuno e quante partite
-- sono già giocate. Servono al countdown della prossima giornata o del prossimo round e ai round completati delle giornate
-- chiuse. Scritti dal job giornaliero (`/api/dunkest`), come il resto dei dati Dunkest: le pagine leggono solo questa tabella.
--
-- Fonte: il calendario NBA dell'app Fantaking (`/leagues/1/config` e `/schedules/<calendario>/matchdays/<giornata>`, pubblici,
-- verificati il 2026-11-03). La giornata della lega si aggancia con lo stesso id Dunkest di `dunkest_matches.dunkest_matchday_id`.
-- Un round non ha un orario suo: `starts_at` è l'inizio della prima partita, `ends_at` l'inizio dell'ultima.

create table dunkest_rounds (
  season_id int not null references seasons,
  matchday int not null check (matchday > 0),
  round int not null check (round > 0),
  dunkest_matchday_id int not null,
  dunkest_round_id int not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  games int not null check (games > 0),
  played int not null,
  primary key (season_id, matchday, round),
  check (ends_at >= starts_at),
  check (played between 0 and games)
);

alter table dunkest_rounds enable row level security;
create policy "read" on dunkest_rounds for select to authenticated using (true);
create policy "admin write" on dunkest_rounds for all to authenticated using (is_admin()) with check (is_admin());

-- Ultima lettura di tutte le giornate (una volta a settimana, come `calendar_at` per il calendario della lega).
alter table dunkest_sync add column rounds_at timestamptz;

-- ---------- RPC del job ----------
-- Giornate della lega (dal calendario già salvato) con quanti round hanno e quanti sono finiti, e l'ultima lettura completa.
create function dunkest_rounds_source(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_season int;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  select id into v_season from seasons where is_current;
  if v_season is null then raise exception 'INVALID: nessuna stagione corrente'; end if;
  return jsonb_build_object(
    'season_id', v_season,
    'rounds_at', (select rounds_at from dunkest_sync where id = 1),
    'matchdays', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dunkest_matchday_id', m.dunkest_matchday_id,
               'matchday', m.matchday,
               'rounds', (select count(*) from dunkest_rounds r where r.season_id = v_season and r.matchday = m.matchday),
               'completed', (select count(*) from dunkest_rounds r where r.season_id = v_season and r.matchday = m.matchday and r.played = r.games))
             order by m.matchday)
      from (select distinct matchday, dunkest_matchday_id from dunkest_matches where season_id = v_season) m), '[]'::jsonb));
end $$;

-- Scrive i round delle giornate lette: una giornata nel payload sostituisce i suoi round (lista vuota = giornata senza partite),
-- una giornata assente non si tocca. La giornata deve esistere nel calendario della lega con lo stesso id Dunkest.
-- p_payload: { season_id, full, matchdays: [{dunkest_matchday_id, matchday,
--              rounds: [{round, dunkest_round_id, starts_at, ends_at, games, played}]}] }
create function dunkest_rounds_apply(p_secret text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_day record;
  v_days int := 0;
  v_rounds int := 0;
  v_n int;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  if p_payload is null or jsonb_typeof(p_payload->'matchdays') is distinct from 'array' then
    raise exception 'INVALID: lista delle giornate mancante';
  end if;
  -- Un aggiornamento alla volta (stessa riga di blocco degli altri job Dunkest).
  perform 1 from dunkest_sync where id = 1 for update;

  select id into v_season from seasons where is_current;
  if v_season is null or v_season is distinct from (p_payload->>'season_id')::int then
    raise exception 'CONFLICT: la stagione corrente è cambiata durante l''aggiornamento';
  end if;

  for v_day in select d.dunkest_matchday_id, d.matchday, d.rounds
               from jsonb_to_recordset(p_payload->'matchdays') as d(dunkest_matchday_id int, matchday int, rounds jsonb) loop
    if jsonb_typeof(v_day.rounds) is distinct from 'array' then raise exception 'INVALID: giornata % senza lista dei round', v_day.matchday; end if;
    if not exists (select 1 from dunkest_matches where season_id = v_season and matchday = v_day.matchday and dunkest_matchday_id = v_day.dunkest_matchday_id) then
      raise exception 'INVALID: la giornata % (id Dunkest %) non è nel calendario della lega', v_day.matchday, v_day.dunkest_matchday_id;
    end if;
    delete from dunkest_rounds where season_id = v_season and matchday = v_day.matchday;
    insert into dunkest_rounds (season_id, matchday, round, dunkest_matchday_id, dunkest_round_id, starts_at, ends_at, games, played)
      select v_season, v_day.matchday, r.round, v_day.dunkest_matchday_id, r.dunkest_round_id, r.starts_at, r.ends_at, r.games, r.played
      from jsonb_to_recordset(v_day.rounds) as r(round int, dunkest_round_id int, starts_at timestamptz, ends_at timestamptz, games int, played int);
    get diagnostics v_n = row_count;
    v_days := v_days + 1;
    v_rounds := v_rounds + v_n;
  end loop;

  if coalesce((p_payload->>'full')::boolean, false) then
    update dunkest_sync set rounds_at = now() where id = 1;
  end if;
  return jsonb_build_object('matchdays', v_days, 'rounds', v_rounds);
end $$;

revoke all on function dunkest_rounds_source(text) from public;
revoke all on function dunkest_rounds_apply(text, jsonb) from public;
grant execute on function dunkest_rounds_source(text) to anon, authenticated;
grant execute on function dunkest_rounds_apply(text, jsonb) to anon, authenticated;
