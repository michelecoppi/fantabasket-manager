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

do $$ begin
  raise notice 'RLS: tutti i test passati (% tabelle, % RPC)', (select count(*) from rls_t.tbl), (select count(*) from rls_t.rpc);
end $$;

rollback;
