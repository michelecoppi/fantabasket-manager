-- Fase 3: chiusura di stagione. Stesso schema delle RPC admin: le regole (bonus R-60, ordine del draft R-32, scadenze R-23/R-24)
-- sono calcolate in TypeScript (`src/lib/season-close.ts`) e passate come piano; qui solo coerenza dei dati (la stagione è
-- ancora quella corrente, contratti e tagli non sono cambiati nel frattempo) e una transazione sola.

-- ---------- Nuovi parametri di lega ----------
-- R-60: bonus/malus di crediti per la stagione successiva, dal 1° all'8° in classifica. R-32: la lottery riguarda le ultime N squadre.
insert into league_settings (season_id, key, value)
select s.id, v.key, v.value from seasons s, (values
  ('rank_bonus_1', 5), ('rank_bonus_2', 4), ('rank_bonus_3', 3), ('rank_bonus_4', 2),
  ('rank_bonus_5', 0), ('rank_bonus_6', -1), ('rank_bonus_7', -2), ('rank_bonus_8', -3),
  ('lottery_teams', 4)
) as v(key, value)
on conflict (season_id, key) do nothing;

-- R-23: chi esce a fine contratto è restricted (il vecchio proprietario può pareggiare l'offerta più alta) o unrestricted.
-- `team_id` di last_contracts è la squadra con il diritto.
alter table last_contracts add column restricted boolean not null default false;

-- R-32/R-33: di chi era la scelta. `team_id` è il proprietario al momento della chiusura; chi legge risolve il proprietario di
-- adesso da draft_picks (year, round, original_team_id), così gli scambi di pick dopo la chiusura si vedono nell'ordine del draft.
alter table rookie_draft add column original_team_id uuid references teams;

-- ---------- Chiusura della stagione corrente ----------
-- p_plan: { season_id, new_year, summary, teams[{team_id, rank, bonus}], carry_contracts[{id, version, years_left, team_option, restriction}],
--           expire_contracts[{id, version, restricted}], carry_cuts[{id, version, years_left}], end_cuts[{id, version}],
--           draft_order[{pick_no, team_id, original_team_id, note}] }. `teams[].tax_eur` (R-12) non si usa: resta nel registro.
-- Le righe della stagione chiusa restano (storico): contratti e tagli che continuano vengono copiati nella stagione nuova.
create function admin_close_season(p_plan jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_old seasons;
  v_new int;
  v_total int;
  v_plan int;
  v_match int;
begin
  perform admin_guard();
  if p_plan is null then raise exception 'INVALID: piano di chiusura mancante'; end if;

  select * into v_old from seasons where is_current for update;
  if not found or v_old.id is distinct from (p_plan->>'season_id')::int then
    raise exception 'CONFLICT: la stagione corrente è cambiata (già chiusa da un altro admin?)';
  end if;
  if (p_plan->>'new_year')::int is distinct from v_old.year + 1 then
    raise exception 'INVALID: la stagione nuova deve essere il %', v_old.year + 1;
  end if;
  if coalesce(jsonb_array_length(p_plan->'teams'), 0) <> (select count(*) from teams) then
    raise exception 'INVALID: la classifica deve comprendere tutte le squadre';
  end if;

  -- Il piano deve coprire esattamente i contratti e i tagli attivi di adesso, alla versione che l'admin ha visto.
  perform 1 from contracts where season_id = v_old.id for update;
  select count(*) into v_total from contracts where season_id = v_old.id;
  with plan as (
    select id, version from jsonb_to_recordset(p_plan->'carry_contracts') as x(id int, version int)
    union all
    select id, version from jsonb_to_recordset(p_plan->'expire_contracts') as x(id int, version int)
  )
  select (select count(*) from plan), count(distinct c.id) into v_plan, v_match
  from plan p join contracts c on c.id = p.id and c.version = p.version and c.season_id = v_old.id;
  if v_total <> v_plan or v_total <> v_match then
    raise exception 'CONFLICT: i contratti sono cambiati dopo l''apertura della pagina';
  end if;

  perform 1 from cuts where season_id = v_old.id and status in ('pending', 'cut') for update;
  select count(*) into v_total from cuts where season_id = v_old.id and status in ('pending', 'cut');
  with plan as (
    select id, version from jsonb_to_recordset(p_plan->'carry_cuts') as x(id int, version int)
    union all
    select id, version from jsonb_to_recordset(p_plan->'end_cuts') as x(id int, version int)
  )
  select (select count(*) from plan), count(distinct c.id) into v_plan, v_match
  from plan p join cuts c on c.id = p.id and c.version = p.version and c.season_id = v_old.id and c.status = 'cut';
  if v_total <> v_plan or v_total <> v_match then
    raise exception 'CONFLICT: i tagli sono cambiati (o sono ancora in asta) dopo l''apertura della pagina';
  end if;

  -- Stagione nuova con gli stessi parametri di lega.
  update seasons set is_current = false where id = v_old.id;
  insert into seasons (year, is_current) values (v_old.year + 1, true) returning id into v_new;
  insert into league_settings (season_id, key, value)
    select v_new, key, value from league_settings where season_id = v_old.id;

  -- Classifica finale della stagione chiusa; bonus (R-60) per la nuova.
  insert into team_season (season_id, team_id, final_rank)
    select v_old.id, x.team_id, x.rank from jsonb_to_recordset(p_plan->'teams') as x(team_id uuid, rank int)
    on conflict (season_id, team_id) do update set final_rank = excluded.final_rank;
  insert into team_season (season_id, team_id, bonus)
    select v_new, x.team_id, x.bonus from jsonb_to_recordset(p_plan->'teams') as x(team_id uuid, bonus int);

  -- Contratti che continuano.
  insert into contracts (season_id, team_id, player_id, slot, years_left, team_option, salary, is_rookie, restriction, notes)
    select v_new, c.team_id, c.player_id, c.slot, x.years_left, x.team_option, c.salary, c.is_rookie, x.restriction, c.notes
    from jsonb_to_recordset(p_plan->'carry_contracts') as x(id int, years_left numeric, team_option boolean, restriction restriction_kind)
    join contracts c on c.id = x.id;

  -- Contratti in scadenza: escono dalla rosa e restano in last_contracts (R-25: prezzo minimo; restricted: diritto di pareggio).
  insert into last_contracts (player_id, team_id, salary, last_contract_on, restricted)
    select c.player_id, c.team_id, c.salary, current_date, x.restricted
    from jsonb_to_recordset(p_plan->'expire_contracts') as x(id int, restricted boolean)
    join contracts c on c.id = x.id;

  -- Quote dei tagli che continuano a pesare sul monte ingaggi.
  insert into cuts (season_id, team_id, player_id, paid_salary, years_left, status,
                    original_salary, original_slot, team_option, original_is_rookie, original_restriction)
    select v_new, c.team_id, c.player_id, c.paid_salary, x.years_left, 'cut',
           c.original_salary, c.original_slot, c.team_option, c.original_is_rookie, c.original_restriction
    from jsonb_to_recordset(p_plan->'carry_cuts') as x(id int, years_left numeric)
    join cuts c on c.id = x.id;

  -- Ordine del draft della stagione nuova (R-32).
  insert into rookie_draft (season_id, pick_no, team_id, original_team_id, note)
    select v_new, x.pick_no, x.team_id, x.original_team_id, nullif(x.note, '')
    from jsonb_to_recordset(p_plan->'draft_order') as x(pick_no int, team_id uuid, original_team_id uuid, note text);

  perform audit_write('close_season', 'seasons', v_new::text,
    jsonb_build_object('season_id', v_old.id, 'year', v_old.year),
    jsonb_build_object('season_id', v_new, 'year', v_old.year + 1, 'summary', p_plan->>'summary', 'teams', p_plan->'teams'));
  return v_new;
end $$;

revoke all on function admin_close_season(jsonb) from public, anon;
grant execute on function admin_close_season(jsonb) to authenticated;
