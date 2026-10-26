-- Test di import_replace_season (P1-03): una stagione si riscrive in blocco, le altre restano intatte e un errore a metà
-- non lascia nulla (nemmeno le cancellazioni). Stesso ambiente e stessa procedura di rls.sql, migrazioni e seed già applicati:
--
--   psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/import.sql
--
-- Tutto in una transazione che finisce con ROLLBACK, con id espliciti e stagioni fittizie (2098, 2099): non cambia i dati.
-- Mai sul database reale.

begin;

create schema imp_t;

create function imp_t.ok(p_what text, p_cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(p_cond, false) then raise exception 'IMPORT: %', p_what; end if;
end $$;

-- Impronta di tutto quello che appartiene alla stagione 2099 (e delle pick 2099, che l'import 2098 non deve toccare).
create function imp_t.fp_2099() returns text language sql as $$
  select md5(concat_ws('|',
    (select coalesce(string_agg(c::text, ',' order by c.id), '') from contracts c join seasons s on s.id = c.season_id where s.year = 2099),
    (select coalesce(string_agg(c::text, ',' order by c.id), '') from cuts c join seasons s on s.id = c.season_id where s.year = 2099),
    (select coalesce(string_agg(r::text, ',' order by r.pick_no), '') from rookie_draft r join seasons s on s.id = r.season_id where s.year = 2099),
    (select coalesce(string_agg(t::text, ',' order by t.team_id), '') from team_season t join seasons s on s.id = t.season_id where s.year = 2099),
    (select coalesce(string_agg(d::text, ',' order by d.id), '') from draft_picks d where d.year = 2099),
    (select coalesce(string_agg(p::text, ',' order by p.id), '') from players p where p.id in (910001, 910002, 910003))
  ))
$$;

-- Impronta globale delle tabelle che l'import può toccare (per provare che un errore non lascia nulla).
create function imp_t.fp_all() returns text language sql as $$
  select md5(concat_ws('|',
    (select coalesce(string_agg(t::text, ',' order by t::text), '') from contracts t),
    (select coalesce(string_agg(t::text, ',' order by t::text), '') from cuts t),
    (select coalesce(string_agg(t::text, ',' order by t::text), '') from talents t),
    (select coalesce(string_agg(t::text, ',' order by t::text), '') from draft_picks t),
    (select coalesce(string_agg(t::text, ',' order by t::text), '') from rookie_draft t),
    (select coalesce(string_agg(t::text, ',' order by t::text), '') from last_contracts t),
    (select coalesce(string_agg(t::text, ',' order by t::text), '') from team_season t),
    (select coalesce(string_agg(t::text, ',' order by t::text), '') from players t),
    (select count(*)::text from audit_log)
  ))
$$;

do $$
begin
  if (select count(*) from teams) < 2 then raise exception 'IMPORT: servono migrazioni e supabase/seed.sql'; end if;
end $$;

-- Stagione 2099 (storico da proteggere): un contratto, un taglio, un rookie draft, una riga team_season, una pick e due giocatori
-- (uno è referenziato solo da last_contracts): l'import 2098 non deve toglierli come "orfani".
insert into seasons (id, year, is_current) values (990098, 2098, false), (990099, 2099, false);
insert into players (id, first_name, last_name, pos, nba_team) values
  (910001, 'Storico', 'Uno', 'G', 'TST'), (910002, 'Storico', 'Due', 'C', 'TST'), (910003, 'Storico', 'Tre', 'A', 'TST');
insert into contracts (id, season_id, team_id, player_id, slot, years_left, salary)
  values (910001, 990099, (select id from teams order by name limit 1), 910001, 'starter', 2, 12);
insert into cuts (id, season_id, team_id, player_id, paid_salary, status)
  values (910001, 990099, (select id from teams order by name limit 1), 910002, 3, 'cut');
insert into rookie_draft (season_id, pick_no, team_id) values (990099, 1, (select id from teams order by name limit 1));
insert into team_season (season_id, team_id, bonus) values (990099, (select id from teams order by name limit 1), 4);
insert into draft_picks (id, year, round, original_team_id, current_team_id)
  select 910001, 2099, 1, id, id from teams order by name limit 1;
insert into last_contracts (id, player_id, team_id, salary, last_contract_on)
  values (910001, 910003, (select id from teams order by name limit 1), 4, date '2099-06-30'); -- storico: tiene vivo il giocatore 910003
-- Dati "vecchi" della stagione 2098, da sostituire.
insert into players (id, first_name, last_name, pos, nba_team) values (910004, 'Vecchio', 'Provvisorio', 'G', null);
insert into contracts (id, season_id, team_id, player_id, slot, years_left, salary)
  values (910002, 990098, (select id from teams order by name limit 1), 910004, 'starter', 1, 5);

create temporary table imp_ctx as
  select (select name from teams order by name limit 1) as t1, (select name from teams order by name offset 1 limit 1) as t2,
         imp_t.fp_2099() as fp99;
grant select on imp_ctx to service_role;
grant usage on schema imp_t to service_role;
grant execute on all functions in schema imp_t to service_role;

-- ---------- Import valido (come service_role, come lo script) ----------
create function pg_temp.payload(p_bad text default null) returns jsonb language sql as $$
  select jsonb_build_object(
    'year', 2098,
    'players', jsonb_build_array(
      jsonb_build_object('ref', 'a', 'first_name', 'Import', 'last_name', 'Alfa', 'pos', 'G', 'nba_team', 'TST', 'dunkest_credits', 10.5),
      jsonb_build_object('ref', 'b', 'first_name', '', 'last_name', 'Beta', 'pos', 'C', 'nba_team', null, 'dunkest_credits', null)),
    'contracts', jsonb_build_array(
      jsonb_build_object('team', c.t1, 'player', 'a', 'slot', 'starter', 'years_left', 2, 'team_option', false, 'salary', 7.5, 'restriction', null, 'is_rookie', false),
      jsonb_build_object('team', c.t2, 'player', 'b', 'slot', case when p_bad = 'slot' then 'bogus' else 'reserve' end,
                         'years_left', null, 'team_option', true, 'salary', 1, 'restriction', 'unrestricted', 'is_rookie', true)),
    'cuts', '[]'::jsonb,
    'talents', jsonb_build_array(jsonb_build_object('team', c.t1, 'display_name', 'Talento', 'draft_year', 2026, 'entry_credits', 2, 'notes', null)),
    'picks', jsonb_build_array(
      jsonb_build_object('year', 2098, 'round', 1, 'original', c.t1, 'current', c.t2, 'to_confirm', false, 'note', 'ceduta'),
      jsonb_build_object('year', 2098, 'round', 2, 'original', c.t1, 'current', null, 'to_confirm', true, 'note', null)),
    'rookie_draft', jsonb_build_array(jsonb_build_object('pick_no', 1, 'team', c.t1, 'note', 'X Y (TST)')),
    'last_contracts', jsonb_build_array(jsonb_build_object('player', 'a', 'team', case when p_bad = 'team' then 'Squadra inesistente' else c.t1 end, 'salary', 3, 'date', '2026-01-01')),
    'team_season', jsonb_build_array(
      jsonb_build_object('team', c.t1, 'bonus', 1, 'entry_fee_paid', true), jsonb_build_object('team', c.t2, 'bonus', 0, 'entry_fee_paid', false)))
  from imp_ctx c
$$;
grant execute on function pg_temp.payload(text) to service_role;
set local role service_role;

do $$
declare r jsonb; fp_before text; n int;
begin
  r := public.import_replace_season(pg_temp.payload());
  perform imp_t.ok('conteggi inattesi: ' || r::text,
    r @> '{"players":2,"contracts":2,"cuts":0,"talents":1,"picks":2,"rookie_draft":1,"last_contracts":1,"team_season":2}'::jsonb);
  perform imp_t.ok('il provvisorio vecchio non è stato tolto', r->>'players_removed' = '1');
  perform imp_t.ok('i contratti 2098 non sono quelli nuovi', (select count(*) from contracts where season_id = 990098) = 2
    and not exists (select 1 from contracts where id = 910002));
  perform imp_t.ok('la stagione 2099 è cambiata', imp_t.fp_2099() = (select fp99 from imp_ctx));
  perform imp_t.ok('la pick 2099 è sparita', exists (select 1 from draft_picks where id = 910001));
  perform imp_t.ok('pick con proprietario ignoto non importata', (select count(*) from draft_picks where year = 2098 and current_team_id is null and to_confirm) = 1);
  perform imp_t.ok('audit_log senza riga di import', exists (select 1 from audit_log where action = 'import' and row_id = '990098'));

  -- Seconda esecuzione identica: stesso risultato, niente duplicati.
  r := public.import_replace_season(pg_temp.payload());
  perform imp_t.ok('secondo import: conteggi diversi', r @> '{"players":2,"contracts":2,"picks":2}'::jsonb and r->>'players_removed' = '0');
  select count(*) into n from players where last_name in ('Alfa', 'Beta');
  perform imp_t.ok('secondo import: giocatori duplicati', n = 2);
  perform imp_t.ok('secondo import: la stagione 2099 è cambiata', imp_t.fp_2099() = (select fp99 from imp_ctx));
end $$;

-- ---------- Rollback: un errore a metà non lascia nulla ----------
-- Gli errori arrivano dopo le cancellazioni e dopo parte degli insert (tipo non valido sul 2° contratto; squadra sconosciuta
-- sugli ultimi contratti): l'RPC è una funzione sola, quindi la transazione la annulla tutta. Il blocco con EXCEPTION usa un
-- savepoint, che si comporta come la transazione di una richiesta PostgREST.
do $$
declare fp text; failed boolean; msg text; bad text;
begin
  foreach bad in array array['slot', 'team'] loop
    fp := imp_t.fp_all();
    failed := false;
    begin
      perform public.import_replace_season(pg_temp.payload(bad));
    exception when others then
      failed := true; msg := sqlerrm;
    end;
    perform imp_t.ok(format('l''import con errore "%s" non è fallito', bad), failed);
    raise notice 'rollback (%): %', bad, msg;
    perform imp_t.ok(format('l''import con errore "%s" ha lasciato modifiche', bad), imp_t.fp_all() = fp);
  end loop;

  -- Payload strutturalmente sbagliati: nessuna modifica.
  fp := imp_t.fp_all();
  failed := false;
  begin perform public.import_replace_season('{"year": 2098}'::jsonb); exception when others then failed := true; end;
  perform imp_t.ok('payload senza elenchi accettato', failed);
  failed := false;
  begin perform public.import_replace_season(jsonb_set(pg_temp.payload(), '{year}', '1900')); exception when others then failed := true; end;
  perform imp_t.ok('stagione inesistente accettata', failed);
  perform imp_t.ok('payload sbagliato ha lasciato modifiche', imp_t.fp_all() = fp);
end $$;

reset role;

do $$ begin raise notice 'IMPORT: tutti i test passati'; end $$;

rollback;
