-- Dati Dunkest (issue #68): infortuni, punteggio medio (pdk) e partite giocate, aggiornati una volta al giorno dal job
-- `/api/dunkest` (cron di Vercel). Le pagine leggono solo queste tabelle, mai Dunkest.
--
-- Scrittura: il job gira senza sessione e con la chiave anon (la service_role non va su Vercel). Le RPC `dunkest_sync_*`
-- (security definer) accettano chi conosce il segreto del job, salvato solo come hash in `private.job_secrets` (schema non
-- esposto da PostgREST), oppure un admin (pulsante "Aggiorna ora" in /admin/dunkest). Come le altre RPC garantiscono solo coerenza
-- dei dati; il collegamento giocatore → id Dunkest e il report si calcolano in src/lib/dunkest.ts.
--
-- Installare il segreto (lo stesso valore di CRON_SECRET su Vercel; si salva solo l'hash):
--   node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "<CRON_SECRET>"
--   insert into private.job_secrets (name, secret_hash) values ('dunkest_sync', decode('<hash esadecimale>', 'hex'))
--     on conflict (name) do update set secret_hash = excluded.secret_hash;

-- ---------- Stagione Dunkest e id dei giocatori ----------
-- season_id di Dunkest per /api/stats/table (2026-27 = 29). Una stagione senza valore: il job si ferma con un errore chiaro.
alter table seasons add column dunkest_season_id int;
update seasons set dunkest_season_id = 29 where year = 2026;

-- Id Dunkest del giocatore (link /it/giocatore/<id>/<slug>): una volta trovato vale anche se cambiano nome o squadra.
alter table players add column dunkest_id int unique;

-- ---------- Dati ----------
-- Medie della stagione (come le dà Dunkest, un decimale).
create table dunkest_stats (
  season_id int not null references seasons,
  player_id int not null references players on delete cascade,
  gp int not null check (gp >= 0),
  pdk numeric(5,1) not null,
  min numeric(4,1) not null default 0,
  pts numeric(4,1) not null default 0,
  reb numeric(4,1) not null default 0,
  ast numeric(4,1) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (season_id, player_id)
);

-- Infortuni di oggi: la lista si sostituisce per intero a ogni aggiornamento (chi guarisce sparisce).
create table dunkest_injuries (
  player_id int primary key references players on delete cascade,
  injured_on date,
  injury text not null,
  description text not null default '',
  updated_at timestamptz not null default now()
);

-- Stato del job: una riga sola. `last_success_at` è l'orario mostrato nelle pagine ("aggiornato alle 9:02"); se l'ultimo
-- tentativo è fallito restano i dati precedenti e qui c'è il motivo. `report`: giocatori non collegati (vedi LinkReport).
create table dunkest_sync (
  id int primary key default 1 check (id = 1),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  source_updated_at timestamptz,
  stats_count int,
  injuries_count int,
  report jsonb
);
insert into dunkest_sync (id) values (1);

-- Storico delle esecuzioni (pagina /admin/dunkest): una riga per tentativo, riuscito o no, con chi l'ha avviato.
-- Si tengono 90 giorni.
create table dunkest_sync_runs (
  id serial primary key,
  at timestamptz not null default now(),
  trigger text not null check (trigger in ('cron', 'admin')),
  user_id uuid,
  ok boolean not null,
  stats_count int,
  injuries_count int,
  links_count int,
  error text,
  report jsonb
);
create index dunkest_sync_runs_at on dunkest_sync_runs (at desc);

do $$
declare t text;
begin
  foreach t in array array['dunkest_stats', 'dunkest_injuries', 'dunkest_sync', 'dunkest_sync_runs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read" on %I for select to authenticated using (true)', t);
    execute format('create policy "admin write" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- ---------- Segreto del job ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.job_secrets (
  name text primary key,
  secret_hash bytea not null
);
alter table private.job_secrets enable row level security; -- nessuna policy: solo le funzioni security definer lo leggono
revoke all on private.job_secrets from public, anon, authenticated;

-- Admin (sessione) oppure segreto del job.
create function dunkest_sync_allowed(p_secret text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (
    coalesce(length(p_secret), 0) >= 16
    and exists (select 1 from private.job_secrets where name = 'dunkest_sync' and secret_hash = sha256(convert_to(p_secret, 'UTF8')))
  );
$$;
revoke all on function dunkest_sync_allowed(text) from public, anon, authenticated;

-- Registra un'esecuzione nello storico: 'admin' se l'ha avviata un admin dal pannello (senza segreto), altrimenti 'cron'.
create function dunkest_sync_log(p_secret text, p_ok boolean, p_stats int, p_injuries int, p_links int, p_error text, p_report jsonb) returns void
language sql security definer set search_path = public as $$
  delete from dunkest_sync_runs where at < now() - interval '90 days';
  insert into dunkest_sync_runs (trigger, user_id, ok, stats_count, injuries_count, links_count, error, report)
  values (case when p_secret is null and is_admin() then 'admin' else 'cron' end, auth.uid(), p_ok, p_stats, p_injuries, p_links, p_error, p_report);
$$;
revoke all on function dunkest_sync_log(text, boolean, int, int, int, text, jsonb) from public, anon, authenticated;

-- ---------- RPC del job ----------
-- Quello che serve per collegare i giocatori: stagione corrente (con l'id Dunkest) e tutti i giocatori, con chi è in rosa.
create function dunkest_sync_source(p_secret text) returns jsonb
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
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'nba_team', p.nba_team, 'dunkest_id', p.dunkest_id,
        'rostered', exists (select 1 from contracts c where c.player_id = p.id and c.season_id = v_season.id)) order by p.id)
      from players p), '[]'::jsonb));
end $$;

-- Scrive tutto in una transazione: nuovi id Dunkest, statistiche della stagione e infortuni (sostituiti per intero), stato.
-- p_payload: { season_id, links: [{player_id, dunkest_id}], stats: [{player_id, gp, pdk, min, pts, reb, ast}],
--              injuries: [{player_id, injured_on, injury, description}], source_updated_at, report }
create function dunkest_sync_apply(p_secret text, p_payload jsonb) returns jsonb
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

-- Tentativo fallito (Dunkest non risponde, formato cambiato): si registra il motivo, i dati restano quelli di prima.
create function dunkest_sync_fail(p_secret text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  update dunkest_sync set last_attempt_at = now(), last_error = left(coalesce(nullif(p_error, ''), 'errore sconosciuto'), 500) where id = 1;
  perform dunkest_sync_log(p_secret, false, null, null, null, left(coalesce(nullif(p_error, ''), 'errore sconosciuto'), 500), null);
end $$;

revoke all on function dunkest_sync_source(text) from public;
revoke all on function dunkest_sync_apply(text, jsonb) from public;
revoke all on function dunkest_sync_fail(text, text) from public;
grant execute on function dunkest_sync_source(text) to anon, authenticated;
grant execute on function dunkest_sync_apply(text, jsonb) to anon, authenticated;
grant execute on function dunkest_sync_fail(text, text) to anon, authenticated;
