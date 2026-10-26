-- P1-06: serializzazione delle scritture sulle rose e sulla chiusura di stagione.
-- Le regole di lega (massimi di rosa, cap) restano in TypeScript (`src/lib/cap.ts`): la action legge la rosa, valida e chiama la
-- RPC. Qui si garantisce solo che, tra la lettura e la scrittura, la rosa non sia cambiata e la stagione sia ancora quella.
--
--  * `teams.roster_rev`: contatore che un trigger incrementa a ogni inserimento/rimozione/spostamento/cambio di slot o stipendio
--    di un contratto. La action lo legge PRIMA dei contratti e lo rimanda alla RPC, che lo confronta con la riga di squadra
--    bloccata `for update`: se è cambiato risponde CONFLICT (stesso schema delle versioni, vedi `rpcError()`).
--  * Stagione: ogni scrittura prende `seasons ... for share` sulla stagione corrente, `admin_close_season` la prende `for update`
--    (già nella 0008). Una firma o uno scambio che arriva a chiusura in corso aspetta e poi trova la stagione cambiata (CONFLICT).
--  * Ordine dei lock, uguale in ogni RPC: stagione -> squadre (per id crescente) -> righe (contratti, tagli, pick).
--    Le squadre si bloccano sempre prima delle righe, così non ci sono attese circolari (scambi opposti, taglio contro scambio).

alter table teams add column roster_rev int not null default 0;

create function bump_roster_rev() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update teams set roster_rev = roster_rev + 1 where id = old.team_id;
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.team_id is distinct from old.team_id) then
    update teams set roster_rev = roster_rev + 1 where id = new.team_id;
  end if;
  return null;
end $$;

-- Durata e team option non contano per i massimi di rosa: `admin_set_durations` non tocca le squadre.
create trigger contracts_bump_roster_rev after insert or delete or update of team_id, slot, salary on contracts
  for each row execute function bump_roster_rev();

-- ---------- Helper interni ----------
-- Stagione corrente, in condivisione: `admin_close_season` (for update) aspetta le scritture in corso e viceversa.
create function lock_current_season() returns int
language plpgsql security definer set search_path = public as $$
declare v_season int;
begin
  select id into v_season from seasons where is_current for share;
  if v_season is null then raise exception 'CONFLICT: la stagione corrente è cambiata (chiusa da un altro admin?)'; end if;
  return v_season;
end $$;

-- p_revs: { "<team_id>": <roster_rev atteso | null> }. Blocca le squadre per id crescente; con una revisione attesa la confronta
-- (null = nessun controllo: per le operazioni che non dipendono dai massimi di rosa, come taglio e rimozione).
create function roster_lock(p_revs jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_rev int;
begin
  for r in select key::uuid as team_id, value from jsonb_each(p_revs) order by key::uuid loop
    select roster_rev into v_rev from teams where id = r.team_id for update;
    if not found then raise exception 'INVALID: squadra inesistente'; end if;
    if r.value <> 'null'::jsonb and v_rev is distinct from (r.value #>> '{}')::int then
      raise exception 'CONFLICT: la rosa è stata modificata da un altro admin';
    end if;
  end loop;
end $$;

-- Stagione + squadra del contratto, prima di bloccare il contratto stesso. Restituisce la squadra (il chiamante controlla che
-- il contratto sia ancora lì dopo l'attesa).
create function lock_contract_team(p_contract_id int, p_roster_rev int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_c record;
  v_season int;
begin
  select team_id, season_id into v_c from contracts where id = p_contract_id;
  if not found then raise exception 'CONFLICT: il contratto non esiste più (tagliato o scambiato da un altro admin?)'; end if;
  v_season := lock_current_season();
  if v_c.season_id is distinct from v_season then raise exception 'CONFLICT: il contratto è di una stagione chiusa'; end if;
  perform roster_lock(jsonb_build_object(v_c.team_id::text, p_roster_rev));
  return v_c.team_id;
end $$;

revoke all on function bump_roster_rev() from public, anon, authenticated;
revoke all on function lock_current_season() from public, anon, authenticated;
revoke all on function roster_lock(jsonb) from public, anon, authenticated;
revoke all on function lock_contract_team(int, int) from public, anon, authenticated;

-- ---------- Firma ----------
drop function admin_sign_contract(int, uuid, roster_slot, numeric, boolean, numeric, boolean, restriction_kind, text);
create function admin_sign_contract(
  p_player_id int,
  p_team_id uuid,
  p_slot roster_slot,
  p_years numeric,
  p_team_option boolean,
  p_salary numeric,
  p_is_rookie boolean,
  p_restriction restriction_kind,
  p_notes text,
  p_roster_rev int
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_id int;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  if p_roster_rev is null then raise exception 'INVALID: revisione della rosa mancante'; end if;
  if p_slot = 'talent' then raise exception 'INVALID: la squadra talenti ha una tabella a parte'; end if;
  v_season := lock_current_season();

  select trim(first_name || ' ' || last_name) into v_player from players where id = p_player_id;
  select name into v_team from teams where id = p_team_id;
  if v_player is null or v_team is null then raise exception 'INVALID: giocatore o squadra inesistenti'; end if;
  perform roster_lock(jsonb_build_object(p_team_id::text, p_roster_rev));

  begin
    insert into contracts (season_id, team_id, player_id, slot, years_left, team_option, salary, is_rookie, restriction, notes)
    values (v_season, p_team_id, p_player_id, p_slot, p_years, p_team_option, p_salary, p_is_rookie, p_restriction, nullif(trim(p_notes), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'CONFLICT: % ha già un contratto in questa stagione', v_player;
  end;

  perform audit_write('sign', 'contracts', v_id::text, null,
    jsonb_build_object('player_id', p_player_id, 'team_id', p_team_id, 'slot', p_slot, 'years_left', p_years,
      'team_option', p_team_option, 'salary', p_salary,
      'summary', format('%s firmato da %s · %s crediti', v_player, v_team, p_salary)));
  return v_id;
end $$;

-- ---------- Modifica ----------
drop function admin_update_contract(int, int, roster_slot, numeric, boolean, numeric);
create function admin_update_contract(
  p_contract_id int,
  p_version int,
  p_slot roster_slot,
  p_years numeric,
  p_team_option boolean,
  p_salary numeric,
  p_roster_rev int
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_old contracts;
  v_new contracts;
  v_player text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  if p_roster_rev is null then raise exception 'INVALID: revisione della rosa mancante'; end if;
  if p_slot = 'talent' then raise exception 'INVALID: la squadra talenti ha una tabella a parte'; end if;

  v_team := lock_contract_team(p_contract_id, p_roster_rev);
  select * into v_old from contracts where id = p_contract_id for update;
  if not found or v_old.team_id is distinct from v_team then raise exception 'CONFLICT: il contratto non esiste più (tagliato o scambiato da un altro admin?)'; end if;
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

-- ---------- Taglio e rimozione: stessa firma, solo l'ordine dei lock (stagione -> squadra -> contratto) ----------
create or replace function admin_cut_player(p_contract_id int, p_version int, p_paid_salary numeric) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_c contracts;
  v_cut int;
  v_player text;
  v_team_name text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  v_team := lock_contract_team(p_contract_id, null);
  select * into v_c from contracts where id = p_contract_id for update;
  if not found or v_c.team_id is distinct from v_team then raise exception 'CONFLICT: il contratto non esiste più (già tagliato o scambiato?)'; end if;
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
  select name into v_team_name from teams where id = v_c.team_id;
  perform audit_write('cut', 'contracts', v_c.id::text, to_jsonb(v_c),
    jsonb_build_object('cut_id', v_cut, 'paid_salary', p_paid_salary,
      'summary', format('%s tagliato da %s · quota %s crediti', v_player, v_team_name, p_paid_salary)));
  return v_cut;
end $$;

create or replace function admin_remove_contract(p_contract_id int, p_version int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_c contracts;
  v_player text;
  v_team_name text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  v_team := lock_contract_team(p_contract_id, null);
  select * into v_c from contracts where id = p_contract_id for update;
  if not found or v_c.team_id is distinct from v_team then raise exception 'CONFLICT: il contratto non esiste più (tagliato o scambiato da un altro admin?)'; end if;
  if v_c.version is distinct from p_version then raise exception 'CONFLICT: il contratto è stato modificato da un altro admin'; end if;
  delete from contracts where id = v_c.id;

  select trim(first_name || ' ' || last_name) into v_player from players where id = v_c.player_id;
  select name into v_team_name from teams where id = v_c.team_id;
  perform audit_write('remove', 'contracts', v_c.id::text, to_jsonb(v_c),
    jsonb_build_object('reason', nullif(trim(p_reason), ''),
      'summary', format('Contratto di %s (%s) rimosso%s', v_player, v_team_name, coalesce(' · ' || nullif(trim(p_reason), ''), ''))));
end $$;

-- ---------- Rientro dal taglio ----------
drop function admin_reinstate_cut(int, int, roster_slot, numeric, numeric, boolean);
create function admin_reinstate_cut(
  p_cut_id int,
  p_version int,
  p_slot roster_slot,
  p_salary numeric,
  p_years numeric,
  p_team_option boolean,
  p_roster_rev int
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_team uuid;
  v_cut cuts;
  v_id int;
  v_player text;
  v_team_name text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  if p_roster_rev is null then raise exception 'INVALID: revisione della rosa mancante'; end if;
  if p_slot = 'talent' then raise exception 'INVALID: la squadra talenti ha una tabella a parte'; end if;
  select team_id into v_team from cuts where id = p_cut_id;
  if not found then raise exception 'CONFLICT: il taglio non esiste più'; end if;
  v_season := lock_current_season();
  perform roster_lock(jsonb_build_object(v_team::text, p_roster_rev));
  select * into v_cut from cuts where id = p_cut_id for update;
  if not found then raise exception 'CONFLICT: il taglio non esiste più'; end if;
  if v_cut.version is distinct from p_version or v_cut.status <> 'pending' or v_cut.team_id is distinct from v_team or v_cut.season_id is distinct from v_season then
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
  select name into v_team_name from teams where id = v_cut.team_id;
  perform audit_write('reinstate', 'cuts', p_cut_id::text, jsonb_build_object('status', v_cut.status),
    jsonb_build_object('status', 'reinstated', 'contract_id', v_id,
      'summary', format('%s rientra in rosa a %s · %s crediti', v_player, v_team_name, p_salary)));
  return v_id;
end $$;

-- ---------- Asta dei tagliati ----------
drop function admin_award_cut(int, int, uuid, roster_slot, numeric, boolean, numeric, boolean, restriction_kind, text);
create function admin_award_cut(
  p_cut_id int,
  p_version int,
  p_team_id uuid,
  p_slot roster_slot,
  p_years numeric,
  p_team_option boolean,
  p_salary numeric,
  p_is_rookie boolean,
  p_restriction restriction_kind,
  p_notes text,
  p_roster_rev int
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_cut cuts;
  v_id int;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  if p_roster_rev is null then raise exception 'INVALID: revisione della rosa mancante'; end if;
  if p_slot = 'talent' then raise exception 'INVALID: la squadra talenti ha una tabella a parte'; end if;
  select name into v_team from teams where id = p_team_id;
  if v_team is null then raise exception 'INVALID: squadra inesistente'; end if;
  v_season := lock_current_season();
  perform roster_lock(jsonb_build_object(p_team_id::text, p_roster_rev));
  select * into v_cut from cuts where id = p_cut_id for update;
  if not found then raise exception 'CONFLICT: il taglio non esiste più'; end if;
  if v_cut.version is distinct from p_version or v_cut.status <> 'pending' or v_cut.season_id is distinct from v_season then
    raise exception 'CONFLICT: il taglio è già stato risolto o modificato da un altro admin';
  end if;
  if v_cut.team_id = p_team_id then
    raise exception 'INVALID: l''ex proprietario non può partecipare all''asta dei tagliati (R-41)';
  end if;

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

-- ---------- Scambio ----------
-- p_roster_revs: { "<team_id>": roster_rev } per entrambe le squadre. Le squadre si bloccano in ordine di id, qualunque sia
-- il verso dello scambio.
drop function admin_execute_trade(uuid, uuid, jsonb, jsonb, text, text);
create function admin_execute_trade(
  p_team_a uuid,
  p_team_b uuid,
  p_a_gives jsonb,
  p_b_gives jsonb,
  p_approved_by text,
  p_override_reason text,
  p_roster_revs jsonb
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
  if p_roster_revs is null or jsonb_typeof(p_roster_revs) <> 'object'
     or coalesce(p_roster_revs -> p_team_a::text, 'null'::jsonb) = 'null'::jsonb
     or coalesce(p_roster_revs -> p_team_b::text, 'null'::jsonb) = 'null'::jsonb then
    raise exception 'INVALID: revisione della rosa mancante';
  end if;
  v_season := lock_current_season();
  select name into v_name_a from teams where id = p_team_a;
  select name into v_name_b from teams where id = p_team_b;
  if v_name_a is null or v_name_b is null then raise exception 'INVALID: squadra inesistente'; end if;
  perform roster_lock(jsonb_build_object(p_team_a::text, p_roster_revs -> p_team_a::text, p_team_b::text, p_roster_revs -> p_team_b::text));

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

revoke all on function admin_sign_contract(int, uuid, roster_slot, numeric, boolean, numeric, boolean, restriction_kind, text, int) from public, anon;
revoke all on function admin_update_contract(int, int, roster_slot, numeric, boolean, numeric, int) from public, anon;
revoke all on function admin_reinstate_cut(int, int, roster_slot, numeric, numeric, boolean, int) from public, anon;
revoke all on function admin_award_cut(int, int, uuid, roster_slot, numeric, boolean, numeric, boolean, restriction_kind, text, int) from public, anon;
revoke all on function admin_execute_trade(uuid, uuid, jsonb, jsonb, text, text, jsonb) from public, anon;
grant execute on function admin_sign_contract(int, uuid, roster_slot, numeric, boolean, numeric, boolean, restriction_kind, text, int) to authenticated;
grant execute on function admin_update_contract(int, int, roster_slot, numeric, boolean, numeric, int) to authenticated;
grant execute on function admin_reinstate_cut(int, int, roster_slot, numeric, numeric, boolean, int) to authenticated;
grant execute on function admin_award_cut(int, int, uuid, roster_slot, numeric, boolean, numeric, boolean, restriction_kind, text, int) to authenticated;
grant execute on function admin_execute_trade(uuid, uuid, jsonb, jsonb, text, text, jsonb) to authenticated;
