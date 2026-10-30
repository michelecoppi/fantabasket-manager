-- Talenti collegati ai giocatori del listone (R-35, R-50): un talento che gioca in NBA compare nel listone e, finché
-- `talents.player_id` è vuoto, sembra un giocatore libero. Un admin lo collega con `admin_link_talents` (proposte per cognome);
-- chi non gioca in NBA resta senza collegamento. Un giocatore sta in al massimo un talento.
-- L'import (`import_replace_season`) cancella e riscrive i talenti: ora conserva i collegamenti per squadra e nome.

create unique index talents_player_id_key on talents (player_id) where player_id is not null;

-- p_items: [{ "id": talento, "player_id": giocatore | null, "expected": giocatore collegato che l'admin vedeva | null }].
-- Tutti in una transazione: con `expected` diverso da quello attuale (un altro admin ha già cambiato) non si salva niente.
create function admin_link_talents(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_talent talents;
  v_player_id int;
  v_player text;
  v_season int;
  v_n int := 0;
begin
  perform admin_guard();
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'INVALID: nessun talento da collegare'; end if;
  select id into v_season from seasons where is_current;

  for v_item in select jsonb_array_elements(p_items) loop
    select * into v_talent from talents where id = (v_item ->> 'id')::int for update;
    if not found then raise exception 'CONFLICT: un talento non c''è più (firmato o tolto da un altro admin?)'; end if;
    if v_talent.player_id is distinct from (v_item ->> 'expected')::int then
      raise exception 'CONFLICT: % è stato collegato da un altro admin', v_talent.display_name;
    end if;
    v_player_id := (v_item ->> 'player_id')::int;
    v_player := null;

    if v_player_id is not null then
      select trim(first_name || ' ' || last_name) into v_player from players where id = v_player_id;
      if v_player is null then raise exception 'INVALID: giocatore inesistente'; end if;
      if exists (select 1 from contracts where season_id = v_season and player_id = v_player_id) then
        raise exception 'INVALID: % ha già un contratto in questa stagione', v_player;
      end if;
    end if;

    begin
      update talents set player_id = v_player_id where id = v_talent.id;
    exception when unique_violation then
      raise exception 'CONFLICT: % è già collegato a un altro talento', v_player;
    end;
    v_n := v_n + 1;

    perform audit_write('talent_link', 'talents', v_talent.id::text,
      jsonb_build_object('player_id', v_talent.player_id), jsonb_build_object('player_id', v_player_id));
  end loop;

  perform audit_write('talent_link', 'talents', null, null, jsonb_build_object('summary',
    case when v_n = 1 and v_player_id is null then format('Talento %s scollegato dal listone', v_talent.display_name)
         when v_n = 1 then format('Talento %s collegato a %s', v_talent.display_name, v_player)
         else format('%s talenti collegati al listone', v_n) end));
  return v_n;
end $$;
revoke all on function admin_link_talents(jsonb) from public, anon;
grant execute on function admin_link_talents(jsonb) to authenticated;

-- Import: identico a 20261027130000, ma i collegamenti dei talenti (squadra + nome) sopravvivono alla riscrittura.
create or replace function import_replace_season(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_year int;
  v_season int;
  v_expected int;
  v_inserted int;
  v_counts jsonb := '{}'::jsonb;
  v_p record;
  v_id int;
  v_orphans int;
  k text;
begin
  if p_payload is null then raise exception 'INVALID: payload mancante'; end if;
  v_year := (p_payload->>'year')::int;
  if v_year is null then raise exception 'INVALID: anno mancante'; end if;
  foreach k in array array['players', 'contracts', 'cuts', 'talents', 'picks', 'rookie_draft', 'last_contracts', 'team_season'] loop
    if jsonb_typeof(p_payload->k) is distinct from 'array' then raise exception 'INVALID: manca l''elenco "%"', k; end if;
  end loop;

  select id into v_season from seasons where year = v_year for update;
  if v_season is null then raise exception 'INVALID: stagione % non trovata', v_year; end if;

  -- Giocatori: aggiorna o crea; la mappa ref -> id vale solo in questa transazione.
  drop table if exists pg_temp.pmap;
  create temporary table pmap (ref text primary key, id int not null) on commit drop;
  for v_p in
    select * from jsonb_to_recordset(p_payload->'players')
      as x(ref text, first_name text, last_name text, pos player_pos, nba_team text, dunkest_credits numeric)
  loop
    if v_p.ref is null or v_p.first_name is null or v_p.last_name is null then raise exception 'INVALID: giocatore incompleto'; end if;
    select id into v_id from players
      where first_name = v_p.first_name and last_name = v_p.last_name and nba_team is not distinct from v_p.nba_team;
    if v_id is null then
      insert into players (first_name, last_name, pos, nba_team, dunkest_credits)
      values (v_p.first_name, v_p.last_name, v_p.pos, v_p.nba_team, v_p.dunkest_credits) returning id into v_id;
    else
      update players set pos = v_p.pos, dunkest_credits = v_p.dunkest_credits where id = v_id;
    end if;
    insert into pmap values (v_p.ref, v_id);
  end loop;
  v_counts := v_counts || jsonb_build_object('players', (select count(*) from pmap));

  -- Svuota la stagione (le tabelle che dipendono da players prima dei giocatori orfani).
  delete from contracts where season_id = v_season;
  delete from cuts where season_id = v_season;
  delete from rookie_draft where season_id = v_season;
  delete from team_season where season_id = v_season;
  -- Collegamenti dei talenti al listone (`admin_link_talents`): il foglio non li conosce, si rimettono dopo l'insert.
  drop table if exists pg_temp.tlinks;
  create temporary table tlinks on commit drop as
    select distinct on (team_id, display_name) team_id, display_name, player_id from talents where player_id is not null order by team_id, display_name, id;
  delete from talents;
  delete from draft_picks where year in (select distinct (x->>'year')::int from jsonb_array_elements(p_payload->'picks') x);
  delete from last_contracts where player_id in (
    select m.id from jsonb_array_elements(p_payload->'last_contracts') x join pmap m on m.ref = x->>'player');

  insert into contracts (season_id, team_id, player_id, slot, years_left, team_option, salary, restriction, is_rookie)
    select v_season, t.id, m.id, x.slot, x.years_left, coalesce(x.team_option, false), x.salary, x.restriction, coalesce(x.is_rookie, false)
    from jsonb_to_recordset(p_payload->'contracts')
      as x(team text, player text, slot roster_slot, years_left numeric, team_option boolean, salary numeric, restriction restriction_kind, is_rookie boolean)
    join teams t on t.name = x.team join pmap m on m.ref = x.player;
  get diagnostics v_inserted = row_count;
  v_expected := jsonb_array_length(p_payload->'contracts');
  if v_inserted <> v_expected then raise exception 'INVALID: contratti con squadra o giocatore sconosciuto (% su %)', v_expected - v_inserted, v_expected; end if;
  v_counts := v_counts || jsonb_build_object('contracts', v_inserted);

  -- Il foglio è post-asta: i tagli sono già definitivi ('cut'), non in attesa dell'asta dei tagliati.
  insert into cuts (season_id, team_id, player_id, paid_salary, years_left, status)
    select v_season, t.id, m.id, x.paid_salary, x.years_left, 'cut'
    from jsonb_to_recordset(p_payload->'cuts') as x(team text, player text, paid_salary numeric, years_left numeric)
    join teams t on t.name = x.team join pmap m on m.ref = x.player;
  get diagnostics v_inserted = row_count;
  if v_inserted <> jsonb_array_length(p_payload->'cuts') then raise exception 'INVALID: tagli con squadra o giocatore sconosciuto'; end if;
  v_counts := v_counts || jsonb_build_object('cuts', v_inserted);

  insert into talents (team_id, display_name, draft_year, entry_credits, notes)
    select t.id, x.display_name, x.draft_year, x.entry_credits, x.notes
    from jsonb_to_recordset(p_payload->'talents') as x(team text, display_name text, draft_year int, entry_credits numeric, notes text)
    join teams t on t.name = x.team;
  get diagnostics v_inserted = row_count;
  if v_inserted <> jsonb_array_length(p_payload->'talents') then raise exception 'INVALID: talenti con squadra sconosciuta'; end if;
  v_counts := v_counts || jsonb_build_object('talents', v_inserted);
  -- Un nome ripetuto nella stessa squadra prende il collegamento solo sulla prima riga (l'indice unico non ne ammette due).
  update talents t set player_id = l.player_id
    from tlinks l
    where t.id = (select min(x.id) from talents x where x.team_id = l.team_id and x.display_name = l.display_name);
  get diagnostics v_inserted = row_count;
  v_counts := v_counts || jsonb_build_object('talent_links', v_inserted);

  insert into draft_picks (year, round, original_team_id, current_team_id, to_confirm, note)
    select x."year", x.round, o.id, c.id, coalesce(x.to_confirm, false), x.note
    from jsonb_to_recordset(p_payload->'picks') as x("year" int, round int, original text, "current" text, to_confirm boolean, note text)
    join teams o on o.name = x.original left join teams c on c.name = x."current"
    where x."current" is null or c.id is not null;
  get diagnostics v_inserted = row_count;
  if v_inserted <> jsonb_array_length(p_payload->'picks') then raise exception 'INVALID: pick con squadra sconosciuta'; end if;
  v_counts := v_counts || jsonb_build_object('picks', v_inserted);

  insert into rookie_draft (season_id, pick_no, team_id, note)
    select v_season, x.pick_no, t.id, x.note
    from jsonb_to_recordset(p_payload->'rookie_draft') as x(pick_no int, team text, note text) join teams t on t.name = x.team;
  get diagnostics v_inserted = row_count;
  if v_inserted <> jsonb_array_length(p_payload->'rookie_draft') then raise exception 'INVALID: rookie draft con squadra sconosciuta'; end if;
  v_counts := v_counts || jsonb_build_object('rookie_draft', v_inserted);

  insert into last_contracts (player_id, team_id, salary, last_contract_on)
    select m.id, t.id, x.salary, x."date"
    from jsonb_to_recordset(p_payload->'last_contracts') as x(player text, team text, salary numeric, "date" date)
    join teams t on t.name = x.team join pmap m on m.ref = x.player;
  get diagnostics v_inserted = row_count;
  if v_inserted <> jsonb_array_length(p_payload->'last_contracts') then raise exception 'INVALID: ultimi contratti con squadra o giocatore sconosciuto'; end if;
  v_counts := v_counts || jsonb_build_object('last_contracts', v_inserted);

  insert into team_season (season_id, team_id, bonus, entry_fee_paid)
    select v_season, t.id, x.bonus, coalesce(x.entry_fee_paid, false)
    from jsonb_to_recordset(p_payload->'team_season') as x(team text, bonus int, entry_fee_paid boolean) join teams t on t.name = x.team;
  get diagnostics v_inserted = row_count;
  if v_inserted <> jsonb_array_length(p_payload->'team_season') then raise exception 'INVALID: squadre della stagione sconosciute'; end if;
  v_counts := v_counts || jsonb_build_object('team_season', v_inserted);

  -- Giocatori che nessuna tabella referenzia più (le altre stagioni li tengono vivi).
  delete from players p
    where not exists (select 1 from contracts where player_id = p.id)
      and not exists (select 1 from cuts where player_id = p.id)
      and not exists (select 1 from talents where player_id = p.id)
      and not exists (select 1 from rookie_draft where player_id = p.id)
      and not exists (select 1 from last_contracts where player_id = p.id)
      and not exists (select 1 from pmap where id = p.id)
      -- Chi ha un id Dunkest fa parte del listone (il job giornaliero lo aggiunge anche se il foglio non lo conosce): non è un orfano.
      and p.dunkest_id is null;
  get diagnostics v_orphans = row_count;
  v_counts := v_counts || jsonb_build_object('players_removed', v_orphans);

  perform audit_write('import', 'seasons', v_season::text, null, jsonb_build_object('year', v_year, 'counts', v_counts));
  return v_counts;
end $$;

revoke all on function import_replace_season(jsonb) from public, anon, authenticated;
grant execute on function import_replace_season(jsonb) to service_role;
