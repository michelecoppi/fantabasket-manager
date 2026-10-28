-- Test delle policy RLS (issue #3): anon, viewer e admin contro ogni tabella e ogni RPC `admin_*`.
-- SQL puro. Serve un Postgres con i ruoli anon/authenticated, lo schema auth (auth.uid(), auth.users) e un `postgres` con
-- BYPASSRLS, cioè l'immagine supabase/postgres o un progetto Supabase, con migrazioni e seed già applicati:
--
--   psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
--
-- In locale, con Docker (la stessa immagine della CI):
--   docker run -d --name rls -e POSTGRES_PASSWORD=postgres -p 54322:5432 supabase/postgres:17.11.0.006
--   export PGHOST=localhost PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres   # attendere ~15 s
--   for f in supabase/migrations/*.sql supabase/seed.sql; do psql -X -q -v ON_ERROR_STOP=1 -f "$f"; done
--   psql -X -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
--   docker rm -f rls
--
-- Esce con errore alla prima deviazione dall'atteso ("RLS: ..."). Tutto sta in una transazione che finisce con ROLLBACK e le
-- righe di prova hanno id espliciti: non cambia i dati e non consuma sequence.
--
-- Atteso (regolamento dei permessi in CLAUDE.md):
--  * anon: non legge niente, non scrive, non esegue nessuna RPC.
--  * viewer: legge tutto tranne audit_log, non scrive, non può promuoversi, le RPC rispondono FORBIDDEN.
--  * admin: legge e scrive tutto, ma audit_log non si modifica né si cancella nemmeno da admin.
--
-- Le tabelle e le RPC si leggono dal catalogo: una tabella nuova senza riga di prova, o con RLS spenta, e una RPC nuova senza
-- `admin_guard()` fanno fallire il test.

begin;

-- ---------- Attrezzi ----------
-- Schema di appoggio (sparisce col rollback). Le funzioni girano coi diritti del ruolo corrente, quindi vedono quello che
-- vedrebbe quell'utente via PostgREST.
create schema rls_t;
grant usage on schema rls_t to anon, authenticated;

create function rls_t.viewer() returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-00000000a001'::uuid $$;
create function rls_t.admin() returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-00000000a002'::uuid $$;
create function rls_t.intruder() returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-00000000a003'::uuid $$;

-- Diventa un ruolo, con i claim JWT che Supabase imposta per ogni richiesta ('postgres' = torna al ruolo di partenza).
-- Imposta anche `request.jwt.claim.sub`: l'auth.uid() dell'immagine supabase/postgres legge solo quello, quello dei
-- progetti hosted legge `request.jwt.claims`.
create function rls_t.become(p_role text, p_uid uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case p_role when 'postgres' then '' else jsonb_strip_nulls(jsonb_build_object('role', p_role, 'sub', p_uid))::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  if p_role = 'postgres' then reset role; else execute format('set local role %I', p_role); end if;
end $$;

-- Esegue p_sql e dice com'è andata: 'rows=N', 'denied' (42501: RLS o GRANT mancante), 'unique' (23505: la RLS ha lasciato
-- passare e ha fermato il vincolo) o 'error: <messaggio>'. Gli altri errori (sintassi, tipi...) restano visibili e non
-- combaciano con nessuna attesa, così un test scritto male non passa a vuoto.
create function rls_t.try(p_sql text) returns text language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return 'rows=' || n;
exception
  when insufficient_privilege then return 'denied';
  when unique_violation then return 'unique';
  when others then return 'error: ' || sqlerrm;
end $$;

-- Righe che il ruolo corrente vede (senza GRANT di SELECT: nessuna).
create function rls_t.seen(p_table text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I', p_table) into n;
  return n;
exception when insufficient_privilege then return 0;
end $$;

create function rls_t.ok(p_what text, p_cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'RLS: %', p_what; end if;
end $$;

-- p_want: pattern LIKE, basta che combaci uno.
create function rls_t.chk(p_what text, p_got text, p_want text[]) returns void language plpgsql as $$
begin
  if p_got is null or not exists (select 1 from unnest(p_want) w where p_got like w) then
    raise exception 'RLS: % -> ottenuto "%", atteso uno tra %', p_what, p_got, p_want;
  end if;
end $$;

-- Impronta del contenuto di una tabella (da chiamare come postgres): dice se un tentativo "a 0 righe" ha davvero lasciato
-- tutto com'era.
create table rls_t.snapshots (tbl text primary key, h text not null);

create function rls_t.snapshot() returns void language plpgsql as $$
declare r record; h text;
begin
  delete from rls_t.snapshots;
  for r in select name from rls_t.tbl loop
    execute format('select md5(coalesce(string_agg(t::text, '','' order by t::text), '''')) from public.%I t', r.name) into h;
    insert into rls_t.snapshots values (r.name, h);
  end loop;
end $$;

create function rls_t.assert_unchanged(p_what text, p_only text default null) returns void language plpgsql as $$
declare r record; h text;
begin
  for r in select tbl, s.h from rls_t.snapshots s where p_only is null or tbl = p_only loop
    execute format('select md5(coalesce(string_agg(t::text, '','' order by t::text), '''')) from public.%I t', r.tbl) into h;
    if h <> r.h then raise exception 'RLS: % ha modificato %', p_what, r.tbl; end if;
  end loop;
end $$;

-- ---------- Dati di prova (come postgres, che salta la RLS) ----------
do $$
begin
  if (select count(*) from teams) < 2 or not exists (select 1 from seasons where is_current) then
    raise exception 'RLS: servono migrazioni e supabase/seed.sql (almeno 2 squadre e la stagione corrente)';
  end if;
end $$;

insert into auth.users (id) values (rls_t.viewer()), (rls_t.admin()), (rls_t.intruder());
insert into profiles (id, display_name, role, team_id) values
  (rls_t.viewer(), 'RLS viewer', 'viewer', (select id from teams order by name limit 1)),
  (rls_t.admin(),  'RLS admin',  'admin',  (select id from teams order by name offset 1 limit 1));

-- Una riga per ogni tabella (seasons, league_settings e teams arrivano dal seed). Id espliciti.
insert into players (id, first_name, last_name, pos, nba_team) values (900001, 'RLS', 'Uno', 'G', 'TST'), (900002, 'RLS', 'Due', 'C', 'TST');
insert into contracts (id, season_id, team_id, player_id, slot, years_left, salary)
  select 900001, s.id, t.id, 900001, 'starter', 1, 10 from seasons s, (select id from teams order by name limit 1) t where s.is_current;
insert into cuts (id, season_id, team_id, player_id, paid_salary)
  select 900001, s.id, t.id, 900002, 3 from seasons s, (select id from teams order by name limit 1) t where s.is_current;
insert into talents (id, team_id, display_name) select 900001, id, 'RLS talento' from teams order by name limit 1;
insert into draft_picks (id, year, round, original_team_id, current_team_id)
  select 900001, 2099, 1, id, id from teams order by name limit 1;
insert into rookie_draft (season_id, pick_no, team_id)
  select s.id, 9001, t.id from seasons s, (select id from teams order by name limit 1) t where s.is_current;
insert into last_contracts (id, player_id, team_id, salary, last_contract_on)
  select 900001, 900001, id, 5, date '2026-01-01' from teams order by name limit 1;
insert into team_season (season_id, team_id)
  select s.id, t.id from seasons s, (select id from teams order by name limit 1) t where s.is_current on conflict do nothing;
insert into trades (id, season_id, payload) select 900001, id, '{}'::jsonb from seasons where is_current;
insert into audit_log (id, user_id, action, table_name) values (900001, rls_t.admin(), 'rls-test', 'rls');
insert into dunkest_stats (season_id, player_id, gp, pdk) select id, 900001, 3, 21.5 from seasons where is_current;
insert into dunkest_injuries (player_id, injured_on, injury, description) values (900002, date '2026-10-19', 'Caviglia', 'GTD: da valutare');
insert into dunkest_sync_runs (id, trigger, ok, stats_count, injuries_count, links_count) values (900001, 'cron', true, 1, 1, 0);
-- dunkest_sync ha già la sua riga unica (migrazione 20261027025827).
insert into dunkest_teams (season_id, team_id, dunkest_team_id)
  select s.id, t.id, 990001 from seasons s, (select id from teams order by name limit 1) t where s.is_current on conflict do nothing;
insert into dunkest_standings (season_id, team_id, position, total_pts, wins, losses)
  select s.id, t.id, 1, 700.5, 3, 0 from seasons s, (select id from teams order by name limit 1) t where s.is_current;
insert into dunkest_matches (id, season_id, matchday, dunkest_matchday_id, home_team_id, away_team_id, home_pts, away_pts)
  select 990001, s.id, 1, 1858, (select id from teams order by name limit 1), (select id from teams order by name offset 1 limit 1), 240.05, 233.15
  from seasons s where s.is_current;
insert into dunkest_lineups (match_id, team_id, fantasy_player_id, player_id, name, pos, role, court_position, pts)
  select 990001, id, 3, 900001, 'RLS Uno', 'G', 'starter', 1, 72.19 from teams order by name limit 1;
insert into dunkest_rosters (season_id, team_id, fantasy_player_id, player_id, name, pos)
  select s.id, t.id, 3, 900001, 'RLS Uno', 'G' from seasons s, (select id from teams order by name limit 1) t where s.is_current;

-- Elenco delle tabelle (con una riga di esempio, copiata per provare gli INSERT) e delle RPC admin_*, letto dal catalogo.
-- `call` chiama la RPC con tutti gli argomenti null: la guardia è la prima istruzione, quindi chi non è admin si ferma lì,
-- e un admin si ferma subito dopo con INVALID/CONFLICT senza scrivere nulla.
create table rls_t.tbl (name text primary key, col text not null, sample jsonb not null);
create table rls_t.rpc (name text primary key, call text not null);
grant select on rls_t.tbl, rls_t.rpc to anon, authenticated;

do $$
declare r record; v_sample jsonb;
begin
  for r in
    select c.relname as name, c.relrowsecurity as rls,
           (select attname from pg_attribute where attrelid = c.oid and attnum > 0 and not attisdropped order by attnum limit 1) as col
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') order by 1
  loop
    if not r.rls then raise exception 'RLS: la tabella % non ha la RLS attiva', r.name; end if;
    execute format('select to_jsonb(t) from public.%I t limit 1', r.name) into v_sample;
    if v_sample is null then
      raise exception 'RLS: la tabella % è vuota, aggiungi una riga di prova in rls.sql', r.name;
    end if;
    insert into rls_t.tbl values (r.name, r.col, v_sample);
  end loop;

  insert into rls_t.rpc
  select p.proname,
         format('select public.%I(%s)', p.proname,
           coalesce((select string_agg('null::' || format_type(a.t, null), ', ' order by a.ord)
                     from unnest(p.proargtypes::oid[]) with ordinality a(t, ord)), ''))
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname like 'admin\_%' and p.proname <> 'admin_guard';
  perform rls_t.ok('nessuna RPC admin_* trovata', exists (select 1 from rls_t.rpc));

  perform rls_t.ok('gli helper dei lock di rosa sono chiamabili dai client',
    not has_function_privilege('authenticated', 'public.roster_lock(jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.lock_current_season()', 'execute')
    and not has_function_privilege('authenticated', 'public.lock_contract_team(int,int)', 'execute'));

  -- Gli helper delle RPC (security definer) non devono essere chiamabili dai client: audit_write permetterebbe di
  -- scrivere righe false nell'audit log.
  perform rls_t.ok('audit_write chiamabile dai client',
    not has_function_privilege('anon', 'public.audit_write(text,text,text,jsonb,jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.audit_write(text,text,text,jsonb,jsonb)', 'execute'));
  perform rls_t.ok('admin_guard chiamabile dai client',
    not has_function_privilege('anon', 'public.admin_guard()', 'execute')
    and not has_function_privilege('authenticated', 'public.admin_guard()', 'execute'));
end $$;

-- ---------- anon: niente ----------
do $$
declare t record; f record;
begin
  perform rls_t.snapshot();
  perform rls_t.become('anon');
  perform rls_t.ok('auth.uid() di anon non è null', auth.uid() is null);

  for t in select * from rls_t.tbl order by name loop
    perform rls_t.ok(format('anon legge %s', t.name), rls_t.seen(t.name) = 0);
    perform rls_t.chk(format('anon INSERT su %s', t.name),
      rls_t.try(format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, %2$L::jsonb)).*', t.name, t.sample)),
      array['denied']);
    perform rls_t.chk(format('anon UPDATE su %s', t.name),
      rls_t.try(format('update public.%1$I set %2$I = %2$I', t.name, t.col)), array['rows=0', 'denied']);
    perform rls_t.chk(format('anon DELETE su %s', t.name),
      rls_t.try(format('delete from public.%I', t.name)), array['rows=0', 'denied']);
  end loop;

  for f in select * from rls_t.rpc order by name loop
    perform rls_t.chk(format('anon esegue %s', f.name), rls_t.try(f.call), array['denied']);
  end loop;

  perform rls_t.become('postgres');
  perform rls_t.assert_unchanged('anon');
end $$;

-- ---------- viewer: sola lettura (audit_log escluso) ----------
do $$
declare t record; f record;
begin
  perform rls_t.snapshot();
  perform rls_t.become('authenticated', rls_t.viewer());
  perform rls_t.ok('auth.uid() non è il viewer (i claim JWT non arrivano alla RLS)', auth.uid() = rls_t.viewer());
  perform rls_t.ok('il viewer risulta admin', not public.is_admin());

  for t in select * from rls_t.tbl order by name loop
    if t.name = 'audit_log' then
      perform rls_t.ok('il viewer legge audit_log', rls_t.seen(t.name) = 0);
    else
      perform rls_t.ok(format('il viewer non legge %s', t.name), rls_t.seen(t.name) > 0);
    end if;
    perform rls_t.chk(format('viewer INSERT su %s', t.name),
      rls_t.try(format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, %2$L::jsonb)).*', t.name, t.sample)),
      array['denied']);
    perform rls_t.chk(format('viewer UPDATE su %s', t.name),
      rls_t.try(format('update public.%1$I set %2$I = %2$I', t.name, t.col)), array['rows=0', 'denied']);
    perform rls_t.chk(format('viewer DELETE su %s', t.name),
      rls_t.try(format('delete from public.%I', t.name)), array['rows=0', 'denied']);
  end loop;

  -- Non può promuoversi né cambiare squadra, né creare un profilo admin.
  perform rls_t.chk('viewer cambia il proprio ruolo',
    rls_t.try(format('update public.profiles set role = ''admin'' where id = %L', rls_t.viewer())), array['rows=0', 'denied']);
  perform rls_t.chk('viewer cambia la propria squadra',
    rls_t.try(format('update public.profiles set team_id = (select id from public.teams order by name desc limit 1) where id = %L', rls_t.viewer())),
    array['rows=0', 'denied']);
  perform rls_t.chk('viewer crea un profilo admin',
    rls_t.try(format('insert into public.profiles (id, display_name, role) values (%L, ''x'', ''admin'')', rls_t.intruder())), array['denied']);
  perform rls_t.chk('viewer scrive una riga di audit_log',
    rls_t.try('insert into public.audit_log (id, action, table_name) values (900002, ''falso'', ''rls'')'), array['denied']);

  for f in select * from rls_t.rpc order by name loop
    perform rls_t.chk(format('viewer esegue %s', f.name), rls_t.try(f.call), array['error: FORBIDDEN%']);
  end loop;

  perform rls_t.become('postgres');
  perform rls_t.assert_unchanged('viewer');
  perform rls_t.ok('il ruolo del viewer è cambiato', (select role from profiles where id = rls_t.viewer()) = 'viewer');
end $$;

-- ---------- admin: scrive tutto, ma non l'audit log ----------
do $$
declare t record; f record; n bigint;
begin
  perform rls_t.snapshot();
  perform rls_t.become('authenticated', rls_t.admin());
  perform rls_t.ok('auth.uid() non è l''admin (i claim JWT non arrivano alla RLS)', auth.uid() = rls_t.admin());
  perform rls_t.ok('l''admin non risulta admin', public.is_admin());

  for t in select * from rls_t.tbl order by name loop
    n := rls_t.seen(t.name);
    perform rls_t.ok(format('l''admin non legge %s', t.name), n > 0);
    -- INSERT di una riga già presente: la RLS lascia passare e ferma il vincolo (23505).
    perform rls_t.chk(format('admin INSERT su %s', t.name),
      rls_t.try(format('insert into public.%1$I select (jsonb_populate_record(null::public.%1$I, %2$L::jsonb)).*', t.name, t.sample)),
      array['unique']);
    perform rls_t.chk(format('admin UPDATE su %s', t.name),
      rls_t.try(format('update public.%1$I set %2$I = %2$I', t.name, t.col)),
      array[case t.name when 'audit_log' then 'rows=0' else 'rows=' || n end]);
  end loop;
  perform rls_t.chk('admin DELETE su audit_log', rls_t.try('delete from public.audit_log'), array['rows=0']);

  perform rls_t.become('postgres');
  perform rls_t.assert_unchanged('admin', 'audit_log');
  perform rls_t.become('authenticated', rls_t.admin());

  -- Controllo positivo del DELETE su una tabella foglia (nessuna FK la referenzia).
  perform rls_t.chk('admin DELETE su last_contracts', rls_t.try('delete from public.last_contracts where id = 900001'), array['rows=1']);

  -- Le RPC passano la guardia: si fermano dopo, con un errore dichiarato (INVALID/CONFLICT).
  for f in select * from rls_t.rpc order by name loop
    perform rls_t.chk(format('admin esegue %s', f.name), rls_t.try(f.call), array['rows=%', 'error: INVALID%', 'error: CONFLICT%']);
  end loop;

  perform rls_t.become('postgres');
end $$;

-- ---------- Hardening (issue #37): privilegi e versioni ----------
do $$
declare t record; f text;
begin
  -- Nessun ruolo API può fare TRUNCATE, REFERENCES o TRIGGER (la RLS non governa TRUNCATE).
  for t in select name from rls_t.tbl order by name loop
    foreach f in array array['TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      perform rls_t.ok(format('anon ha %s su %s', f, t.name), not has_table_privilege('anon', format('public.%I', t.name), f));
      perform rls_t.ok(format('authenticated ha %s su %s', f, t.name), not has_table_privilege('authenticated', format('public.%I', t.name), f));
    end loop;
  end loop;

  -- Versioni null o vecchie: le RPC rifiutano e non scrivono (admin; errore = niente modifiche).
  perform rls_t.become('authenticated', rls_t.admin());
  perform rls_t.chk('update_contract con versione null',
    rls_t.try('select public.admin_update_contract((select id from public.contracts limit 1), null, ''starter'', 1, false, 1, 0)'), array['error: INVALID%']);
  perform rls_t.chk('update_contract con versione vecchia',
    rls_t.try('select public.admin_update_contract(c.id, c.version + 1, ''starter'', 1, false, 1, t.roster_rev) from public.contracts c join public.teams t on t.id = c.team_id limit 1'), array['error: CONFLICT%']);
  perform rls_t.chk('update_contract senza revisione di rosa',
    rls_t.try('select public.admin_update_contract(c.id, c.version, ''starter'', 1, false, 1, null) from public.contracts c limit 1'), array['error: INVALID%']);
  perform rls_t.chk('update_contract con revisione di rosa vecchia',
    rls_t.try('select public.admin_update_contract(c.id, c.version, ''starter'', 1, false, 1, t.roster_rev - 1) from public.contracts c join public.teams t on t.id = c.team_id limit 1'), array['error: CONFLICT%']);
  perform rls_t.chk('sign_contract con revisione di rosa vecchia',
    rls_t.try('select public.admin_sign_contract(900002, t.id, ''reserve'', 1, false, 1, false, null, null, t.roster_rev - 1) from public.teams t limit 1'), array['error: CONFLICT%']);
  perform rls_t.chk('execute_trade senza revisioni di rosa',
    rls_t.try('select public.admin_execute_trade(a.id, b.id, ''{}'', ''{}'', null, null, null) from public.teams a, public.teams b where a.id < b.id limit 1'), array['error: INVALID%']);
  perform rls_t.chk('execute_trade con revisione di rosa vecchia',
    rls_t.try('select public.admin_execute_trade(a.id, b.id, ''{}'', ''{}'', null, null, jsonb_build_object(a.id::text, a.roster_rev - 1, b.id::text, b.roster_rev)) from public.teams a, public.teams b where a.id < b.id limit 1'), array['error: CONFLICT%']);
  perform rls_t.chk('cut_player con versione null',
    rls_t.try('select public.admin_cut_player((select id from public.contracts limit 1), null, 0)'), array['error: INVALID%']);
  perform rls_t.chk('set_pick con versione null',
    rls_t.try('select public.admin_set_pick((select id from public.draft_picks limit 1), null, null, false, null)'), array['error: INVALID%']);
  perform rls_t.chk('set_durations con versione mancante',
    rls_t.try('select public.admin_set_durations(jsonb_build_array(jsonb_build_object(''id'', (select id from public.contracts limit 1), ''years'', 1)))'), array['error: INVALID%']);
  perform rls_t.chk('set_team_season con versione vecchia',
    rls_t.try('select public.admin_set_team_season(ts.team_id, ts.version + 1, true, true) from public.team_season ts limit 1'), array['error: CONFLICT%']);
  perform rls_t.chk('set_team_season senza versione su riga esistente',
    rls_t.try('select public.admin_set_team_season(ts.team_id, null, true, true) from public.team_season ts limit 1'), array['error: INVALID%']);
  perform rls_t.chk('set_team_season con versione giusta',
    rls_t.try('select public.admin_set_team_season(ts.team_id, ts.version, ts.entry_fee_paid, ts.luxury_tax_paid) from public.team_season ts limit 1'), array['rows=1']);
  perform rls_t.become('postgres');
end $$;

-- ---------- R-24 (P2-04): la firma consuma il diritto di pareggio e il contratto è unrestricted ----------
do $$
declare
  t1 uuid := (select id from teams order by name limit 1);
  t2 uuid := (select id from teams order by name offset 1 limit 1);
  sid int := (select id from seasons where is_current);
  cid int; r last_contracts%rowtype; res text;
begin
  insert into players (id, first_name, last_name, pos, nba_team) values (900011, 'RLS', 'Pareggio', 'G', 'TST'), (900012, 'RLS', 'Libero', 'G', 'TST');
  insert into last_contracts (id, player_id, team_id, salary, last_contract_on, restricted)
    values (900011, 900011, t1, 8, date '2026-09-30', true), (900012, 900012, t1, 4, date '2026-09-30', false);

  -- Firma della squadra col diritto (pareggio) tramite la RPC admin, senza passare restriction.
  perform rls_t.become('authenticated', rls_t.admin());
  perform public.admin_sign_contract(900011, t1, 'starter', 2, false, 8, false, null, null, (select roster_rev from teams where id = t1));
  perform rls_t.become('postgres');
  select id into cid from contracts where player_id = 900011 and season_id = sid;
  if (select restriction from contracts where id = cid) is distinct from 'unrestricted' then
    raise exception 'RLS: il secondo contratto dopo un pareggio deve essere unrestricted (R-24)';
  end if;
  select * into r from last_contracts where id = 900011;
  if r.restricted or r.consumed_by_contract_id is distinct from cid or r.consumed_at is null then
    raise exception 'RLS: la firma deve consumare il diritto e registrarne l''esito';
  end if;

  -- Dopo un taglio successivo il vecchio diritto non riemerge: l'ultima riga resta non restricted.
  delete from contracts where id = cid;
  if exists (select 1 from last_contracts where player_id = 900011 and restricted) then
    raise exception 'RLS: il vecchio diritto è riemerso';
  end if;

  -- Un'altra squadra che vince l'asta ottiene comunque un contratto unrestricted (confermato dall'utente).
  insert into last_contracts (id, player_id, team_id, salary, last_contract_on, restricted) values (900013, 900011, t1, 8, date '2026-10-01', true);
  insert into contracts (season_id, team_id, player_id, slot, years_left, salary) values (sid, t2, 900011, 'starter', 1, 9) returning id into cid;
  if (select restriction from contracts where id = cid) is distinct from 'unrestricted'
     or (select restricted from last_contracts where id = 900013) then
    raise exception 'RLS: la firma di un''altra squadra deve consumare il diritto e dare un contratto unrestricted';
  end if;

  -- Senza diritto aperto la restriction scelta resta com''è.
  insert into contracts (season_id, team_id, player_id, slot, years_left, salary) values (sid, t2, 900012, 'starter', 1, 4) returning id into cid;
  if (select restriction from contracts where id = cid) is not null then
    raise exception 'RLS: senza diritto aperto il contratto non deve diventare unrestricted';
  end if;
end $$;

-- ---------- import_replace_season: solo service_role ----------
-- Non è admin_*: niente guardia admin, ma nessun ruolo API può eseguirla (l'import cancella e riscrive una stagione).
-- Il comportamento (atomicità, altre stagioni intatte) è provato in supabase/tests/import.sql.
do $$
declare r text;
begin
  perform rls_t.ok('import_replace_season non esiste', to_regprocedure('public.import_replace_season(jsonb)') is not null);
  perform rls_t.ok('anon esegue import_replace_season', not has_function_privilege('anon', 'public.import_replace_season(jsonb)', 'execute'));
  perform rls_t.ok('authenticated esegue import_replace_season', not has_function_privilege('authenticated', 'public.import_replace_season(jsonb)', 'execute'));
  perform rls_t.ok('service_role non esegue import_replace_season', has_function_privilege('service_role', 'public.import_replace_season(jsonb)', 'execute'));
  foreach r in array array['anon', 'viewer', 'admin'] loop
    if r = 'anon' then perform rls_t.become('anon');
    elsif r = 'viewer' then perform rls_t.become('authenticated', rls_t.viewer());
    else perform rls_t.become('authenticated', rls_t.admin());
    end if;
    perform rls_t.chk(format('%s esegue import_replace_season', r), rls_t.try('select public.import_replace_season(null)'), array['denied']);
  end loop;
  perform rls_t.become('postgres');
  grant usage on schema rls_t to service_role;
  perform rls_t.become('service_role');
  perform rls_t.chk('service_role con payload nullo', rls_t.try('select public.import_replace_season(null)'), array['error: INVALID%']);
  perform rls_t.become('postgres');
end $$;

-- ---------- Job Dunkest (issue #68): segreto o admin ----------
-- Le RPC dunkest_sync_* si eseguono con la chiave anon (il job gira senza sessione): chi non conosce il segreto si ferma con
-- FORBIDDEN, l'admin passa anche senza. Un payload senza statistiche e un tentativo fallito non toccano i dati.
do $$
declare v jsonb; sid int := (select id from seasons where is_current);
begin
  perform rls_t.ok('dunkest_sync_allowed chiamabile dai client',
    not has_function_privilege('anon', 'public.dunkest_sync_allowed(text)', 'execute')
    and not has_function_privilege('authenticated', 'public.dunkest_sync_allowed(text)', 'execute'));
  perform rls_t.ok('dunkest_sync_log chiamabile dai client (storico falso)',
    not has_function_privilege('anon', 'public.dunkest_sync_log(text,boolean,int,int,int,text,jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.dunkest_sync_log(text,boolean,int,int,int,text,jsonb)', 'execute'));
  perform rls_t.ok('private.job_secrets leggibile dai client',
    not has_table_privilege('anon', 'private.job_secrets', 'select') and not has_table_privilege('authenticated', 'private.job_secrets', 'select'));
  insert into private.job_secrets (name, secret_hash) values ('dunkest_sync', sha256(convert_to('rls-segreto-del-job-0123', 'UTF8')))
    on conflict (name) do update set secret_hash = excluded.secret_hash;

  perform rls_t.become('anon');
  perform rls_t.chk('anon senza segreto', rls_t.try('select public.dunkest_sync_source(null)'), array['error: FORBIDDEN%']);
  perform rls_t.chk('anon con segreto sbagliato', rls_t.try('select public.dunkest_sync_source(''rls-segreto-sbagliato-000'')'), array['error: FORBIDDEN%']);
  perform rls_t.chk('anon scrive senza segreto',
    rls_t.try(format('select public.dunkest_sync_apply(null, %L)', jsonb_build_object('season_id', sid, 'stats', '[]'::jsonb, 'injuries', '[]'::jsonb))), array['error: FORBIDDEN%']);
  perform rls_t.chk('anon registra un errore senza segreto', rls_t.try('select public.dunkest_sync_fail(null, ''x'')'), array['error: FORBIDDEN%']);

  v := public.dunkest_sync_source('rls-segreto-del-job-0123');
  perform rls_t.ok('dunkest_sync_source col segreto', (v->>'season_id')::int = sid and jsonb_array_length(v->'players') > 0);
  -- Listone: aggiunta dei giocatori nuovi (solo con il segreto, idempotente, nomi vuoti scartati)
  perform rls_t.chk('anon aggiunge giocatori senza segreto',
    rls_t.try('select public.dunkest_sync_add_players(null, ''[{"dunkest_id": 990101, "first_name": "Rls", "last_name": "Rookie"}]''::jsonb)'), array['error: FORBIDDEN%']);
  v := public.dunkest_sync_add_players('rls-segreto-del-job-0123',
    '[{"dunkest_id": 990101, "first_name": "Rls", "last_name": "Rookie", "pos": "A", "nba_team": "Rls Team", "dunkest_credits": 7.5},
      {"dunkest_id": 990102, "first_name": "", "last_name": "Senzanome", "pos": "G", "nba_team": "Rls Team"}]'::jsonb);
  perform rls_t.ok('add_players: solo il giocatore con nome intero', jsonb_array_length(v) = 1 and (v->0->>'dunkest_id')::int = 990101);
  perform rls_t.ok('add_players: seconda chiamata uguale non duplica',
    jsonb_array_length(public.dunkest_sync_add_players('rls-segreto-del-job-0123',
      '[{"dunkest_id": 990101, "first_name": "Rls", "last_name": "Rookie", "pos": "A", "nba_team": "Rls Team"}]'::jsonb)) = 0);
  perform rls_t.chk('add_players: troppi giocatori',
    rls_t.try(format('select public.dunkest_sync_add_players(''rls-segreto-del-job-0123'', %L)', (select jsonb_agg(jsonb_build_object('dunkest_id', 991000 + g, 'first_name', 'R', 'last_name', 'L' || g)) from generate_series(1, 101) g))),
    array['error: INVALID%']);
  perform rls_t.chk('payload senza statistiche',
    rls_t.try(format('select public.dunkest_sync_apply(''rls-segreto-del-job-0123'', %L)', jsonb_build_object('season_id', sid, 'stats', '[]'::jsonb, 'injuries', '[]'::jsonb))),
    array['error: INVALID%']);
  perform rls_t.chk('collegamenti duplicati',
    rls_t.try(format('select public.dunkest_sync_apply(''rls-segreto-del-job-0123'', %L)', jsonb_build_object('season_id', sid,
      'links', '[{"player_id": 900001, "dunkest_id": 1}, {"player_id": 900002, "dunkest_id": 1}]'::jsonb,
      'stats', '[{"player_id": 900001, "gp": 1, "pdk": 1}]'::jsonb, 'injuries', '[]'::jsonb))),
    array['error: INVALID%']);
  perform public.dunkest_sync_apply('rls-segreto-del-job-0123', jsonb_build_object('season_id', sid,
    'links', '[{"player_id": 900001, "dunkest_id": 990001}]'::jsonb,
    'stats', '[{"player_id": 900001, "gp": 4, "pdk": 30.5, "min": 31, "pts": 22, "reb": 5, "ast": 6}]'::jsonb,
    'injuries', '[{"player_id": 900001, "injured_on": "2026-10-20", "injury": "Piede", "description": "Indisponibile fino al 20 Nov"}]'::jsonb,
    'source_updated_at', '2026-10-27T02:30:05Z', 'report', '{"provisional": []}'::jsonb));
  perform public.dunkest_sync_fail('rls-segreto-del-job-0123', 'HTTP 503');
  perform rls_t.become('postgres');

  perform rls_t.ok('apply non ha sostituito statistiche e infortuni',
    (select count(*) from dunkest_stats where season_id = sid) = 1
    and (select pdk from dunkest_stats where season_id = sid and player_id = 900001) = 30.5
    and (select count(*) from dunkest_injuries) = 1 and exists (select 1 from dunkest_injuries where player_id = 900001));
  perform rls_t.ok('apply non ha salvato l''id Dunkest', (select dunkest_id from players where id = 900001) = 990001);
  perform rls_t.ok('add_players non ha creato il giocatore con ruolo, squadra e crediti',
    exists (select 1 from players where dunkest_id = 990101 and pos = 'A' and nba_team = 'Rls Team' and dunkest_credits = 7.5)
    and not exists (select 1 from players where last_name = 'Senzanome'));
  delete from players where dunkest_id = 990101;
  perform rls_t.ok('storico delle esecuzioni sbagliato',
    (select count(*) filter (where ok and trigger = 'cron' and stats_count = 1 and links_count = 1) = 1
            and count(*) filter (where not ok and error = 'HTTP 503') = 1
     from dunkest_sync_runs where id <> 900001));
  perform rls_t.ok('fail ha cancellato i dati o non ha registrato il motivo',
    (select last_error = 'HTTP 503' and last_success_at is not null and last_attempt_at >= last_success_at and stats_count = 1 from dunkest_sync));

  perform rls_t.become('authenticated', rls_t.viewer());
  perform rls_t.chk('viewer senza segreto', rls_t.try('select public.dunkest_sync_source(null)'), array['error: FORBIDDEN%']);
  perform rls_t.become('authenticated', rls_t.admin());
  perform rls_t.chk('admin senza segreto', rls_t.try('select public.dunkest_sync_source(null)'), array['rows=%']);
  perform public.dunkest_sync_fail(null, 'prova admin');
  perform rls_t.become('postgres');
  perform rls_t.ok('esecuzione admin non registrata come admin',
    exists (select 1 from dunkest_sync_runs where trigger = 'admin' and user_id = rls_t.admin() and error = 'prova admin'));
  perform rls_t.become('postgres');
end $$;

-- ---------- Job Dunkest, parte di lega (issue #72): classifica, calendario, formazioni ----------
-- Stesse regole delle dunkest_sync_*: segreto o admin. Classifica vuota e tentativi falliti non toccano i dati; un 401 di
-- Dunkest azzera «token funzionante da».
do $$
declare
  v jsonb;
  sid int := (select id from seasons where is_current);
  t1 uuid := (select id from teams order by name limit 1);
  t2 uuid := (select id from teams order by name offset 1 limit 1);
  ok_payload jsonb;
begin
  perform rls_t.ok('dunkest_league_log chiamabile dai client (storico falso)',
    not has_function_privilege('anon', 'public.dunkest_league_log(text,boolean,text,jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.dunkest_league_log(text,boolean,text,jsonb)', 'execute'));
  ok_payload := jsonb_build_object('season_id', sid, 'full_calendar', false,
    'standings', jsonb_build_array(
      jsonb_build_object('team_id', t1, 'position', 2, 'total_pts', 650.25, 'wins', 2, 'losses', 1),
      jsonb_build_object('team_id', t2, 'position', 1, 'total_pts', 721.71, 'wins', 3, 'losses', 0)),
    'matches', jsonb_build_array(jsonb_build_object('id', 990002, 'matchday', 2, 'dunkest_matchday_id', 1859,
      'home_team_id', t2, 'away_team_id', t1, 'home_pts', 292.9, 'away_pts', 243.44, 'winner_team_id', t2)),
    'lineup_matches', '[990002]'::jsonb,
    'lineups', jsonb_build_array(
      jsonb_build_object('match_id', 990002, 'team_id', t2, 'fantasy_player_id', 3, 'player_id', 900001, 'name', 'RLS Uno', 'pos', 'G',
        'role', 'starter', 'court_position', 4, 'is_captain', true, 'pts', 72.19),
      jsonb_build_object('match_id', 990002, 'team_id', t1, 'fantasy_player_id', 1, 'player_id', null, 'name', 'Nikola Jokic', 'pos', 'C',
        'role', 'bench', 'court_position', 6, 'is_sixth_man', true, 'pts', 42.5)),
    'links', '[{"player_id": 900001, "fantasy_id": 77001}]'::jsonb,
    'report', '{"unlinked": ["Nikola Jokic"]}'::jsonb);

  perform rls_t.become('anon');
  perform rls_t.chk('anon legge la sorgente di lega senza segreto', rls_t.try('select public.dunkest_league_source(null)'), array['error: FORBIDDEN%']);
  perform rls_t.chk('anon scrive la lega senza segreto', rls_t.try(format('select public.dunkest_league_apply(null, %L)', ok_payload)), array['error: FORBIDDEN%']);
  perform rls_t.chk('anon registra un errore di lega senza segreto', rls_t.try('select public.dunkest_league_fail(null, ''error'', ''x'')'), array['error: FORBIDDEN%']);

  v := public.dunkest_league_source('rls-segreto-del-job-0123');
  perform rls_t.ok('dunkest_league_source col segreto',
    (v->>'season_id')::int = sid and (v->>'tournament_id')::int = 252941 and jsonb_array_length(v->'teams') > 0
    and jsonb_array_length(v->'players') > 0 and jsonb_array_length(v->'matchdays') = 1 and (v->'matchdays'->0->>'scored')::boolean);
  perform rls_t.chk('classifica vuota',
    rls_t.try(format('select public.dunkest_league_apply(''rls-segreto-del-job-0123'', %L)', ok_payload || '{"standings": []}'::jsonb)), array['error: INVALID%']);
  perform rls_t.chk('calendario completo vuoto',
    rls_t.try(format('select public.dunkest_league_apply(''rls-segreto-del-job-0123'', %L)', ok_payload || '{"full_calendar": true, "matches": []}'::jsonb)), array['error: INVALID%']);
  perform rls_t.chk('collegamenti di lega duplicati',
    rls_t.try(format('select public.dunkest_league_apply(''rls-segreto-del-job-0123'', %L)',
      ok_payload || '{"links": [{"player_id": 900001, "fantasy_id": 5}, {"player_id": 900002, "fantasy_id": 5}]}'::jsonb)), array['error: INVALID%']);
  v := public.dunkest_league_apply('rls-segreto-del-job-0123', ok_payload);
  perform rls_t.ok('apply di lega: conteggi', (v->>'standings')::int = 2 and (v->>'matches')::int = 1 and (v->>'lineups')::int = 2);
  perform public.dunkest_league_fail('rls-segreto-del-job-0123', 'token_rejected', 'HTTP 401');
  perform rls_t.become('postgres');

  perform rls_t.ok('classifica non sostituita',
    (select count(*) from dunkest_standings where season_id = sid) = 2
    and (select position from dunkest_standings where season_id = sid and team_id = t2) = 1);
  perform rls_t.ok('calendario: lo scontro vecchio è sparito senza full_calendar',
    exists (select 1 from dunkest_matches where id = 990001) and exists (select 1 from dunkest_matches where id = 990002 and winner_team_id = t2));
  perform rls_t.ok('formazioni non scritte',
    (select count(*) from dunkest_lineups where match_id = 990002) = 2
    and exists (select 1 from dunkest_lineups where match_id = 990002 and is_captain and pos = 'G' and player_id = 900001)
    and (select count(*) from dunkest_lineups where match_id = 990001) = 1);
  perform rls_t.ok('id Fantaking non salvato', (select dunkest_fantasy_id from players where id = 900001) = 77001);
  perform rls_t.ok('token rifiutato non registrato',
    (select league_error_code = 'token_rejected' and token_ok_since is null and token_rejected_at is not null
            and token_ok_at is not null and league_success_at is not null and league_error = 'HTTP 401' from dunkest_sync));
  perform rls_t.ok('storico di lega sbagliato',
    (select count(*) filter (where ok and (report->>'lineups')::int = 2 and links_count = 1) = 1
            and count(*) filter (where not ok and error = 'HTTP 401' and report->>'code' = 'token_rejected') = 1
     from dunkest_sync_runs where kind = 'league'));

  -- Rose: con la chiave si sostituiscono per intero, senza restano; vuote = fonte rotta.
  perform rls_t.chk('rose vuote',
    rls_t.try(format('select public.dunkest_league_apply(''rls-segreto-del-job-0123'', %L)', ok_payload || '{"rosters": []}'::jsonb)), array['error: INVALID%']);
  v := public.dunkest_league_apply('rls-segreto-del-job-0123', ok_payload || jsonb_build_object('rosters', jsonb_build_array(
    jsonb_build_object('team_id', t2, 'fantasy_player_id', 3, 'player_id', 900001, 'name', 'RLS Uno', 'pos', 'G'),
    jsonb_build_object('team_id', t2, 'fantasy_player_id', 4, 'player_id', null, 'name', 'Ignoto', 'pos', 'C'))));
  perform rls_t.ok('rose non sostituite',
    (v->>'rosters')::int = 2 and (select count(*) from dunkest_rosters where season_id = sid) = 2
    and (select count(*) from dunkest_rosters where season_id = sid and team_id = t2 and player_id is null and pos = 'C') = 1);
  perform public.dunkest_league_apply('rls-segreto-del-job-0123', ok_payload);
  perform rls_t.ok('apply senza rose le ha cancellate', (select count(*) from dunkest_rosters where season_id = sid) = 2);

  -- Calendario completo: resta solo quello del payload.
  perform public.dunkest_league_apply('rls-segreto-del-job-0123', ok_payload || '{"full_calendar": true}'::jsonb);
  perform rls_t.ok('full_calendar non ha tolto lo scontro vecchio',
    not exists (select 1 from dunkest_matches where id = 990001) and (select calendar_at is not null and token_ok_since is not null from dunkest_sync));

  perform rls_t.become('authenticated', rls_t.viewer());
  perform rls_t.chk('viewer legge la sorgente di lega', rls_t.try('select public.dunkest_league_source(null)'), array['error: FORBIDDEN%']);
  perform rls_t.become('authenticated', rls_t.admin());
  perform rls_t.chk('admin legge la sorgente di lega', rls_t.try('select public.dunkest_league_source(null)'), array['rows=%']);
  perform public.dunkest_league_fail(null, 'token_missing', 'DUNKEST_TOKEN non impostato');
  perform rls_t.become('postgres');
  perform rls_t.ok('esecuzione di lega admin non registrata come admin',
    exists (select 1 from dunkest_sync_runs where kind = 'league' and trigger = 'admin' and user_id = rls_t.admin() and report->>'code' = 'token_missing'));
end $$;

-- ---------- admin_swap_slots (issue #72): titolari e riserve allineati a Dunkest ----------
do $$
declare
  v int;
  c contracts;
  rev int;
begin
  select * into c from contracts where id = 900001;
  select roster_rev into rev from teams where id = c.team_id;
  perform rls_t.become('authenticated', rls_t.admin());
  perform rls_t.chk('swap con revisione vecchia',
    rls_t.try(format('select public.admin_swap_slots(%L, %s, %L)', c.team_id, rev + 1, jsonb_build_array(jsonb_build_object('id', c.id, 'version', c.version, 'slot', 'reserve')))),
    array['error: CONFLICT%']);
  perform rls_t.chk('swap con versione vecchia',
    rls_t.try(format('select public.admin_swap_slots(%L, %s, %L)', c.team_id, rev, jsonb_build_array(jsonb_build_object('id', c.id, 'version', c.version + 1, 'slot', 'reserve')))),
    array['error: CONFLICT%']);
  perform rls_t.chk('swap verso talenti',
    rls_t.try(format('select public.admin_swap_slots(%L, %s, %L)', c.team_id, rev, jsonb_build_array(jsonb_build_object('id', c.id, 'version', c.version, 'slot', 'talent')))),
    array['error: INVALID%']);
  perform rls_t.chk('swap di un contratto di un''altra squadra',
    rls_t.try(format('select public.admin_swap_slots((select id from public.teams where id <> %L order by name limit 1), 0, %L)', c.team_id,
      jsonb_build_array(jsonb_build_object('id', c.id, 'version', c.version, 'slot', 'reserve')))),
    array['error: CONFLICT%']);
  perform rls_t.chk('swap senza cambiamenti',
    rls_t.try(format('select public.admin_swap_slots(%L, %s, %L)', c.team_id, rev, jsonb_build_array(jsonb_build_object('id', c.id, 'version', c.version, 'slot', c.slot)))),
    array['error: INVALID%']);
  v := public.admin_swap_slots(c.team_id, rev, jsonb_build_array(jsonb_build_object('id', c.id, 'version', c.version, 'slot', 'reserve')));
  perform rls_t.become('postgres');
  perform rls_t.ok('swap non applicato', v = 1 and (select slot from contracts where id = 900001) = 'reserve');
  perform rls_t.ok('swap senza audit',
    exists (select 1 from audit_log where table_name = 'contracts' and row_id = '900001' and after->>'slot' = 'reserve' and user_id = rls_t.admin())
    and exists (select 1 from audit_log where table_name = 'contracts' and row_id is null and after->>'summary' like 'Titolari e riserve di % allineati a Dunkest (1 contratti)'));
  update contracts set slot = 'starter' where id = 900001;
end $$;

-- ---------- admin_execute_trade: slot di arrivo ----------
do $$
declare
  c contracts;
  o uuid;
  revs jsonb;
  gives_bad jsonb;
  gives_ok jsonb;
  v int;
begin
  select * into c from contracts where id = 900001;
  select id into o from teams where id <> c.team_id order by name limit 1;
  select jsonb_object_agg(id::text, roster_rev) into revs from teams where id in (c.team_id, o);
  gives_bad := jsonb_build_object('contracts', jsonb_build_array(jsonb_build_object('id', c.id, 'version', c.version, 'slot', 'bench')));
  gives_ok := jsonb_build_object('contracts', jsonb_build_array(jsonb_build_object('id', c.id, 'version', c.version, 'slot', 'reserve')));
  perform rls_t.become('authenticated', rls_t.admin());
  perform rls_t.chk('trade con slot di arrivo non valido',
    rls_t.try(format('select public.admin_execute_trade(%L, %L, %L, ''{}'', null, null, %L)', c.team_id, o, gives_bad, revs)), array['error: INVALID%']);
  perform rls_t.chk('trade verso la squadra talenti',
    rls_t.try(format('select public.admin_execute_trade(%L, %L, %L, ''{}'', null, null, %L)', c.team_id, o,
      jsonb_build_object('contracts', jsonb_build_array(jsonb_build_object('id', c.id, 'version', c.version, 'slot', 'talent'))), revs)), array['error: INVALID%']);
  v := public.admin_execute_trade(c.team_id, o, gives_ok, '{}'::jsonb, null, null, revs);
  perform rls_t.become('postgres');
  perform rls_t.ok('trade con slot non applicato',
    (select team_id from contracts where id = 900001) = o and (select slot from contracts where id = 900001) = 'reserve');
  perform rls_t.ok('trade senza audit dello slot',
    exists (select 1 from audit_log where action = 'trade' and table_name = 'contracts' and row_id = '900001'
      and before->>'slot' = c.slot::text and after->>'slot' = 'reserve' and user_id = rls_t.admin()));
  update contracts set team_id = c.team_id, slot = c.slot where id = 900001;
end $$;

do $$ begin
  raise notice 'RLS: tutti i test passati (% tabelle, % RPC)', (select count(*) from rls_t.tbl), (select count(*) from rls_t.rpc);
end $$;

rollback;
