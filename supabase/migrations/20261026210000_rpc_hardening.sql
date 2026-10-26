-- Hardening (issue #37): confronti di versione che non ignorano NULL, versioni mancanti rifiutate, `team_season` versionata
-- contro gli aggiornamenti concorrenti (Quote) e privilegi API non necessari revocati.
-- Le RPC sono le stesse della 0006/0007 (ultima definizione di ciascuna): cambia solo `<>` -> `is distinct from` e il controllo
-- esplicito su p_version / version mancante. Niente cambia nei permessi viewer/admin.

-- ---------- team_season: versione per la concorrenza ottimistica ----------
alter table team_season add column version int not null default 1;
create trigger team_season_bump_version before update on team_season for each row execute function bump_version();

-- Nuova firma (con p_version): la vecchia va tolta. p_version = null solo se la riga della squadra non esiste ancora.
drop function admin_set_team_season(uuid, boolean, boolean);
create function admin_set_team_season(p_team_id uuid, p_version int, p_entry_fee_paid boolean, p_luxury_tax_paid boolean) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_team text;
  v_old team_season;
  v_new team_season;
begin
  perform admin_guard();
  select id into v_season from seasons where is_current;
  if v_season is null then raise exception 'INVALID: nessuna stagione corrente'; end if;
  select name into v_team from teams where id = p_team_id;
  if v_team is null then raise exception 'INVALID: squadra inesistente'; end if;
  if p_entry_fee_paid is null or p_luxury_tax_paid is null then raise exception 'INVALID: stato dei pagamenti mancante'; end if;

  select * into v_old from team_season where season_id = v_season and team_id = p_team_id for update;
  if found then
    if p_version is null then raise exception 'INVALID: versione mancante'; end if;
    if v_old.version is distinct from p_version then raise exception 'CONFLICT: le quote della squadra sono state modificate da un altro admin'; end if;
    update team_season set entry_fee_paid = p_entry_fee_paid, luxury_tax_paid = p_luxury_tax_paid
    where season_id = v_season and team_id = p_team_id returning * into v_new;
  else
    if p_version is not null then raise exception 'CONFLICT: la riga delle quote non esiste più'; end if;
    begin
      insert into team_season (season_id, team_id, entry_fee_paid, luxury_tax_paid)
      values (v_season, p_team_id, p_entry_fee_paid, p_luxury_tax_paid) returning * into v_new;
    exception when unique_violation then
      raise exception 'CONFLICT: le quote della squadra sono state create da un altro admin';
    end;
  end if;

  perform audit_write('season', 'team_season', p_team_id::text,
    jsonb_build_object('entry_fee_paid', v_old.entry_fee_paid, 'luxury_tax_paid', v_old.luxury_tax_paid),
    jsonb_build_object('entry_fee_paid', p_entry_fee_paid, 'luxury_tax_paid', p_luxury_tax_paid,
      'summary', format('%s: quota iscrizione %s, luxury tax %s', v_team,
        case when p_entry_fee_paid then 'pagata' else 'non pagata' end,
        case when p_luxury_tax_paid then 'pagata' else 'non pagata' end)));
  return v_new.version;
end $$;

revoke all on function admin_set_team_season(uuid, int, boolean, boolean) from public, anon;
grant execute on function admin_set_team_season(uuid, int, boolean, boolean) to authenticated;

-- ---------- RPC esistenti: versioni confrontate con IS DISTINCT FROM ----------
create or replace function admin_update_contract(
  p_contract_id int,
  p_version int,
  p_slot roster_slot,
  p_years numeric,
  p_team_option boolean,
  p_salary numeric
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_old contracts;
  v_new contracts;
  v_player text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  if p_slot = 'talent' then raise exception 'INVALID: la squadra talenti ha una tabella a parte'; end if;

  select * into v_old from contracts where id = p_contract_id for update;
  if not found then raise exception 'CONFLICT: il contratto non esiste più (tagliato o scambiato da un altro admin?)'; end if;
  if v_old.version is distinct from p_version then raise exception 'CONFLICT: il contratto è stato modificato da un altro admin'; end if;

  update contracts set slot = p_slot, years_left = p_years, team_option = p_team_option, salary = p_salary
  where id = p_contract_id returning * into v_new;

  select trim(first_name || ' ' || last_name) into v_player from players where id = v_old.player_id;
  perform audit_write('update', 'contracts', p_contract_id::text,
    jsonb_build_object('slot', v_old.slot, 'years_left', v_old.years_left, 'team_option', v_old.team_option, 'salary', v_old.salary),
    jsonb_build_object('slot', v_new.slot, 'years_left', v_new.years_left, 'team_option', v_new.team_option, 'salary', v_new.salary,
      'summary', format('Contratto di %s modificato', v_player)));
  return v_new.version;
end $$;

create or replace function admin_cut_player(p_contract_id int, p_version int, p_paid_salary numeric) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_c contracts;
  v_cut int;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  select * into v_c from contracts where id = p_contract_id for update;
  if not found then raise exception 'CONFLICT: il contratto non esiste più (già tagliato o scambiato?)'; end if;
  if v_c.version is distinct from p_version then raise exception 'CONFLICT: il contratto è stato modificato da un altro admin'; end if;
  if p_paid_salary is null or p_paid_salary < 0 or p_paid_salary > v_c.salary then
    raise exception 'INVALID: la quota del taglio deve stare tra 0 e lo stipendio';
  end if;

  insert into cuts (season_id, team_id, player_id, paid_salary, years_left, status,
                    original_salary, original_slot, team_option, original_is_rookie, original_restriction)
  values (v_c.season_id, v_c.team_id, v_c.player_id, p_paid_salary, v_c.years_left, 'pending',
          v_c.salary, v_c.slot, v_c.team_option, v_c.is_rookie, v_c.restriction)
  returning id into v_cut;
  delete from contracts where id = v_c.id;

  select trim(first_name || ' ' || last_name) into v_player from players where id = v_c.player_id;
  select name into v_team from teams where id = v_c.team_id;
  perform audit_write('cut', 'contracts', v_c.id::text, to_jsonb(v_c),
    jsonb_build_object('cut_id', v_cut, 'paid_salary', p_paid_salary,
      'summary', format('%s tagliato da %s · quota %s crediti', v_player, v_team, p_paid_salary)));
  return v_cut;
end $$;

create or replace function admin_execute_trade(
  p_team_a uuid,
  p_team_b uuid,
  p_a_gives jsonb,
  p_b_gives jsonb,
  p_approved_by text,
  p_override_reason text
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_trade int;
  v_from uuid;
  v_to uuid;
  v_gives jsonb;
  v_item jsonb;
  v_c contracts;
  v_p draft_picks;
  v_n_contracts int := 0;
  v_n_picks int := 0;
  v_name_a text;
  v_name_b text;
  i int;
begin
  perform admin_guard();
  if p_team_a is null or p_team_b is null or p_team_a = p_team_b then
    raise exception 'INVALID: servono due squadre diverse';
  end if;
  select id into v_season from seasons where is_current;
  if v_season is null then raise exception 'INVALID: nessuna stagione corrente'; end if;
  select name into v_name_a from teams where id = p_team_a;
  select name into v_name_b from teams where id = p_team_b;
  if v_name_a is null or v_name_b is null then raise exception 'INVALID: squadra inesistente'; end if;

  for i in 1..2 loop
    if i = 1 then v_from := p_team_a; v_to := p_team_b; v_gives := p_a_gives;
    else v_from := p_team_b; v_to := p_team_a; v_gives := p_b_gives; end if;

    for v_item in select jsonb_array_elements(coalesce(v_gives -> 'contracts', '[]'::jsonb)) loop
      if (v_item ->> 'version') is null then raise exception 'INVALID: versione mancante'; end if;
      select * into v_c from contracts where id = (v_item ->> 'id')::int for update;
      if not found or v_c.season_id <> v_season or v_c.team_id <> v_from or v_c.version is distinct from (v_item ->> 'version')::int then
        raise exception 'CONFLICT: un contratto dello scambio è cambiato nel frattempo';
      end if;
      update contracts set team_id = v_to where id = v_c.id;
      v_n_contracts := v_n_contracts + 1;
      perform audit_write('trade', 'contracts', v_c.id::text,
        jsonb_build_object('team_id', v_from), jsonb_build_object('team_id', v_to));
    end loop;

    for v_item in select jsonb_array_elements(coalesce(v_gives -> 'picks', '[]'::jsonb)) loop
      if (v_item ->> 'version') is null then raise exception 'INVALID: versione mancante'; end if;
      select * into v_p from draft_picks where id = (v_item ->> 'id')::int for update;
      if not found or v_p.current_team_id is distinct from v_from or v_p.version is distinct from (v_item ->> 'version')::int then
        raise exception 'CONFLICT: una pick dello scambio è cambiata nel frattempo';
      end if;
      update draft_picks set current_team_id = v_to where id = v_p.id;
      v_n_picks := v_n_picks + 1;
      perform audit_write('trade', 'draft_picks', v_p.id::text,
        jsonb_build_object('current_team_id', v_from), jsonb_build_object('current_team_id', v_to));
    end loop;
  end loop;

  if v_n_contracts + v_n_picks = 0 then raise exception 'INVALID: lo scambio è vuoto'; end if;

  insert into trades (season_id, status, payload, approved_by, cap_override_reason)
  values (v_season, 'approved',
    jsonb_build_object('team_a', p_team_a, 'team_b', p_team_b, 'a_gives', p_a_gives, 'b_gives', p_b_gives),
    nullif(trim(p_approved_by), ''), nullif(trim(p_override_reason), ''))
  returning id into v_trade;

  perform audit_write('trade', 'trades', v_trade::text, null,
    jsonb_build_object('summary', format('Scambio %s ⇄ %s · %s giocatori, %s pick', v_name_a, v_name_b, v_n_contracts, v_n_picks),
      'cap_override_reason', nullif(trim(p_override_reason), '')));
  return v_trade;
end $$;

create or replace function admin_finalize_cut(p_cut_id int, p_version int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cut cuts;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  select * into v_cut from cuts where id = p_cut_id for update;
  if not found then raise exception 'CONFLICT: il taglio non esiste più'; end if;
  if v_cut.version is distinct from p_version or v_cut.status <> 'pending' then
    raise exception 'CONFLICT: il taglio è già stato risolto o modificato da un altro admin';
  end if;
  update cuts set status = 'cut' where id = p_cut_id;

  select trim(first_name || ' ' || last_name) into v_player from players where id = v_cut.player_id;
  select name into v_team from teams where id = v_cut.team_id;
  perform audit_write('finalize_cut', 'cuts', p_cut_id::text, jsonb_build_object('status', v_cut.status),
    jsonb_build_object('status', 'cut',
      'summary', format('Taglio definitivo di %s (%s): quota %s crediti', v_player, v_team, v_cut.paid_salary)));
end $$;

create or replace function admin_reinstate_cut(
  p_cut_id int,
  p_version int,
  p_slot roster_slot,
  p_salary numeric,
  p_years numeric,
  p_team_option boolean
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_cut cuts;
  v_id int;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  if p_slot = 'talent' then raise exception 'INVALID: la squadra talenti ha una tabella a parte'; end if;
  select * into v_cut from cuts where id = p_cut_id for update;
  if not found then raise exception 'CONFLICT: il taglio non esiste più'; end if;
  if v_cut.version is distinct from p_version or v_cut.status <> 'pending' then
    raise exception 'CONFLICT: il taglio è già stato risolto o modificato da un altro admin';
  end if;

  begin
    insert into contracts (season_id, team_id, player_id, slot, years_left, team_option, salary, is_rookie, restriction)
    values (v_cut.season_id, v_cut.team_id, v_cut.player_id, p_slot, p_years, p_team_option, p_salary, v_cut.original_is_rookie, v_cut.original_restriction)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'CONFLICT: il giocatore ha già un contratto in questa stagione';
  end;
  update cuts set status = 'reinstated' where id = p_cut_id;

  select trim(first_name || ' ' || last_name) into v_player from players where id = v_cut.player_id;
  select name into v_team from teams where id = v_cut.team_id;
  perform audit_write('reinstate', 'cuts', p_cut_id::text, jsonb_build_object('status', v_cut.status),
    jsonb_build_object('status', 'reinstated', 'contract_id', v_id,
      'summary', format('%s rientra in rosa a %s · %s crediti', v_player, v_team, p_salary)));
  return v_id;
end $$;

create or replace function admin_award_cut(
  p_cut_id int,
  p_version int,
  p_team_id uuid,
  p_slot roster_slot,
  p_years numeric,
  p_team_option boolean,
  p_salary numeric,
  p_is_rookie boolean,
  p_restriction restriction_kind,
  p_notes text
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_cut cuts;
  v_id int;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  if p_slot = 'talent' then raise exception 'INVALID: la squadra talenti ha una tabella a parte'; end if;
  select * into v_cut from cuts where id = p_cut_id for update;
  if not found then raise exception 'CONFLICT: il taglio non esiste più'; end if;
  if v_cut.version is distinct from p_version or v_cut.status <> 'pending' then
    raise exception 'CONFLICT: il taglio è già stato risolto o modificato da un altro admin';
  end if;
  if v_cut.team_id = p_team_id then
    raise exception 'INVALID: l''ex proprietario non può partecipare all''asta dei tagliati (R-41)';
  end if;
  select name into v_team from teams where id = p_team_id;
  if v_team is null then raise exception 'INVALID: squadra inesistente'; end if;

  begin
    insert into contracts (season_id, team_id, player_id, slot, years_left, team_option, salary, is_rookie, restriction, notes)
    values (v_cut.season_id, p_team_id, v_cut.player_id, p_slot, p_years, p_team_option, p_salary, p_is_rookie, p_restriction, nullif(trim(p_notes), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'CONFLICT: il giocatore ha già un contratto in questa stagione';
  end;
  update cuts set status = 'awarded' where id = p_cut_id;

  select trim(first_name || ' ' || last_name) into v_player from players where id = v_cut.player_id;
  perform audit_write('award', 'cuts', p_cut_id::text, jsonb_build_object('status', v_cut.status),
    jsonb_build_object('status', 'awarded', 'contract_id', v_id, 'team_id', p_team_id,
      'summary', format('%s preso da %s all''asta dei tagliati · %s crediti', v_player, v_team, p_salary)));
  return v_id;
end $$;

create or replace function admin_remove_contract(p_contract_id int, p_version int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c contracts;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  select * into v_c from contracts where id = p_contract_id for update;
  if not found then raise exception 'CONFLICT: il contratto non esiste più (tagliato o scambiato da un altro admin?)'; end if;
  if v_c.version is distinct from p_version then raise exception 'CONFLICT: il contratto è stato modificato da un altro admin'; end if;
  delete from contracts where id = v_c.id;

  select trim(first_name || ' ' || last_name) into v_player from players where id = v_c.player_id;
  select name into v_team from teams where id = v_c.team_id;
  perform audit_write('remove', 'contracts', v_c.id::text, to_jsonb(v_c),
    jsonb_build_object('reason', nullif(trim(p_reason), ''),
      'summary', format('Contratto di %s (%s) rimosso%s', v_player, v_team, coalesce(' · ' || nullif(trim(p_reason), ''), ''))));
end $$;

create or replace function admin_set_durations(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_old contracts;
  v_n int := 0;
  v_player text;
begin
  perform admin_guard();
  for v_item in select jsonb_array_elements(p_items) loop
    if (v_item ->> 'version') is null then raise exception 'INVALID: versione mancante'; end if;
    select * into v_old from contracts where id = (v_item ->> 'id')::int for update;
    if not found then raise exception 'CONFLICT: un contratto non esiste più'; end if;
    if v_old.version is distinct from (v_item ->> 'version')::int then
      raise exception 'CONFLICT: un contratto è stato modificato da un altro admin';
    end if;
    update contracts
    set years_left = (v_item ->> 'years')::numeric, team_option = coalesce((v_item ->> 'team_option')::boolean, false)
    where id = v_old.id;
    v_n := v_n + 1;

    select trim(first_name || ' ' || last_name) into v_player from players where id = v_old.player_id;
    perform audit_write('update', 'contracts', v_old.id::text,
      jsonb_build_object('years_left', v_old.years_left, 'team_option', v_old.team_option),
      jsonb_build_object('years_left', (v_item ->> 'years')::numeric, 'team_option', coalesce((v_item ->> 'team_option')::boolean, false)));
  end loop;
  if v_n = 0 then raise exception 'INVALID: nessun contratto da aggiornare'; end if;
  perform audit_write('update', 'contracts', null, null, jsonb_build_object('summary', format('Durata fissata per %s contratti', v_n)));
  return v_n;
end $$;

create or replace function admin_set_pick(p_pick_id int, p_version int, p_current_team_id uuid, p_to_confirm boolean, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_old draft_picks;
  v_new draft_picks;
  v_orig text;
  v_to text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  select * into v_old from draft_picks where id = p_pick_id for update;
  if not found then raise exception 'CONFLICT: la pick non esiste più'; end if;
  if v_old.version is distinct from p_version then raise exception 'CONFLICT: la pick è stata modificata da un altro admin'; end if;
  if p_current_team_id is not null and not exists (select 1 from teams where id = p_current_team_id) then
    raise exception 'INVALID: squadra inesistente';
  end if;

  update draft_picks set current_team_id = p_current_team_id, to_confirm = p_to_confirm, note = nullif(trim(p_note), '')
  where id = p_pick_id returning * into v_new;

  select name into v_orig from teams where id = v_old.original_team_id;
  select name into v_to from teams where id = p_current_team_id;
  perform audit_write('pick', 'draft_picks', p_pick_id::text,
    jsonb_build_object('current_team_id', v_old.current_team_id, 'to_confirm', v_old.to_confirm, 'note', v_old.note),
    jsonb_build_object('current_team_id', p_current_team_id, 'to_confirm', p_to_confirm, 'note', v_new.note,
      'summary', format('Pick %s %s° giro di %s: proprietario %s%s', v_old.year, v_old.round, v_orig, coalesce(v_to, 'sconosciuto'),
        case when p_to_confirm then ' (da confermare)' else '' end)));
  return v_new.version;
end $$;

-- ---------- Privilegi API non necessari ----------
-- Supabase li concede di default; l'app non usa TRUNCATE, REFERENCES e TRIGGER via PostgREST. SELECT/INSERT/UPDATE/DELETE
-- restano governati dalla RLS come prima. Anche per le tabelle create in futuro.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
