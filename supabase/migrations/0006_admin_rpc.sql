-- Fase 3 (issue #6): scritture admin atomiche.
--
-- Design:
--  * ogni operazione che tocca più tabelle (firma, modifica, taglio, scambio) è UNA funzione Postgres, quindi una
--    transazione: o si applica tutto o niente. La funzione controlla `is_admin()` al suo interno (security definer);
--  * le regole di lega (cap R-57, 13+3..6 giocatori, 5G/5A/3C, max 3 riserve per ruolo, max 2 pick per giro...) restano in
--    TypeScript (`src/lib/cap.ts`, unica fonte di verità, già testata): la server action valida e poi chiama la RPC.
--    Le funzioni qui sotto garantiscono solo coerenza dei dati (esistenza, proprietà, concorrenza), non le regole;
--  * concorrenza ottimistica: contracts, cuts e draft_picks hanno `version`, incrementata a ogni UPDATE. Il client manda
--    la versione che ha visto; se nel frattempo un altro admin ha modificato la riga, la RPC fallisce con 'CONFLICT: ...'.
--
-- Gli errori hanno un prefisso (FORBIDDEN / CONFLICT / INVALID) che la server action traduce in un messaggio per l'utente.
-- audit_log: per ora lo scrivono le RPC stesse (issue #5 valuterà i trigger).

-- ---------- Versioni per la concorrenza ----------
alter table contracts add column version int not null default 1;
alter table cuts add column version int not null default 1;
alter table draft_picks add column version int not null default 1;

create function bump_version() returns trigger language plpgsql as $$
begin
  new.version := old.version + 1;
  return new;
end $$;

create trigger contracts_bump_version before update on contracts for each row execute function bump_version();
create trigger cuts_bump_version before update on cuts for each row execute function bump_version();
create trigger draft_picks_bump_version before update on draft_picks for each row execute function bump_version();

-- ---------- Nuovi parametri di lega (mai hardcodati nel codice) ----------
-- R-20 / R-22: durata massima di un contratto, option compresa. Le durate ammesse sono 0.5 e gli interi fino a questo valore.
-- R-33: massimo di pick per giro per squadra (ASSUNZIONE: contate per anno di draft, vedi docs/OPEN-QUESTIONS.md).
insert into league_settings (season_id, key, value)
select s.id, v.key, v.value from seasons s, (values ('contract_max_years', 3), ('max_picks_per_round', 2)) as v(key, value)
on conflict (season_id, key) do nothing;

-- ---------- Helper interni ----------
create function admin_guard() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'FORBIDDEN: solo gli admin possono modificare i dati';
  end if;
end $$;

create function audit_write(p_action text, p_table text, p_row_id text, p_before jsonb, p_after jsonb) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (user_id, action, table_name, row_id, before, after)
  values (auth.uid(), p_action, p_table, p_row_id, p_before, p_after);
$$;

-- Gli helper si chiamano solo dalle altre funzioni (che girano come proprietario), mai direttamente dal client.
revoke all on function admin_guard() from public, anon, authenticated;
revoke all on function audit_write(text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- ---------- Firma di un contratto ----------
-- Un giocatore libero entra in una rosa. `p_years` null = durata ancora da fissare (R-51: si sceglie dopo l'asta).
create function admin_sign_contract(
  p_player_id int,
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
  v_season int;
  v_id int;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  select id into v_season from seasons where is_current;
  if v_season is null then raise exception 'INVALID: nessuna stagione corrente'; end if;
  if p_slot = 'talent' then raise exception 'INVALID: la squadra talenti ha una tabella a parte'; end if;

  select trim(first_name || ' ' || last_name) into v_player from players where id = p_player_id;
  select name into v_team from teams where id = p_team_id;
  if v_player is null or v_team is null then raise exception 'INVALID: giocatore o squadra inesistenti'; end if;

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

-- ---------- Modifica di un contratto (durata, slot, team option, stipendio) ----------
create function admin_update_contract(
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
  if p_slot = 'talent' then raise exception 'INVALID: la squadra talenti ha una tabella a parte'; end if;

  select * into v_old from contracts where id = p_contract_id for update;
  if not found then raise exception 'CONFLICT: il contratto non esiste più (tagliato o scambiato da un altro admin?)'; end if;
  if v_old.version <> p_version then raise exception 'CONFLICT: il contratto è stato modificato da un altro admin'; end if;

  update contracts set slot = p_slot, years_left = p_years, team_option = p_team_option, salary = p_salary
  where id = p_contract_id returning * into v_new;

  select trim(first_name || ' ' || last_name) into v_player from players where id = v_old.player_id;
  perform audit_write('update', 'contracts', p_contract_id::text,
    jsonb_build_object('slot', v_old.slot, 'years_left', v_old.years_left, 'team_option', v_old.team_option, 'salary', v_old.salary),
    jsonb_build_object('slot', v_new.slot, 'years_left', v_new.years_left, 'team_option', v_new.team_option, 'salary', v_new.salary,
      'summary', format('Contratto di %s modificato', v_player)));
  return v_new.version;
end $$;

-- ---------- Taglio ----------
-- Il contratto diventa una riga di `cuts` (stato 'pending' = in attesa dell'asta dei tagliati, R-41). `p_paid_salary`
-- (1/3 arrotondato allo 0.5, R-42) lo calcola `cutShare` in cap.ts: qui si controlla solo che sia plausibile.
create function admin_cut_player(p_contract_id int, p_version int, p_paid_salary numeric) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_c contracts;
  v_cut int;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  select * into v_c from contracts where id = p_contract_id for update;
  if not found then raise exception 'CONFLICT: il contratto non esiste più (già tagliato o scambiato?)'; end if;
  if v_c.version <> p_version then raise exception 'CONFLICT: il contratto è stato modificato da un altro admin'; end if;
  if p_paid_salary is null or p_paid_salary < 0 or p_paid_salary > v_c.salary then
    raise exception 'INVALID: la quota del taglio deve stare tra 0 e lo stipendio';
  end if;

  insert into cuts (season_id, team_id, player_id, paid_salary, years_left, status)
  values (v_c.season_id, v_c.team_id, v_c.player_id, p_paid_salary, v_c.years_left, 'pending')
  returning id into v_cut;
  delete from contracts where id = v_c.id;

  select trim(first_name || ' ' || last_name) into v_player from players where id = v_c.player_id;
  select name into v_team from teams where id = v_c.team_id;
  perform audit_write('cut', 'contracts', v_c.id::text, to_jsonb(v_c),
    jsonb_build_object('cut_id', v_cut, 'paid_salary', p_paid_salary,
      'summary', format('%s tagliato da %s · quota %s crediti', v_player, v_team, p_paid_salary)));
  return v_cut;
end $$;

-- ---------- Scambio ----------
-- `p_a_gives` / `p_b_gives`: {"contracts": [{"id": 1, "version": 3}], "picks": [{"id": 7, "version": 1}]}.
-- Ogni riga viene bloccata (for update) e deve appartenere ancora alla squadra che la cede, con la versione vista dall'admin.
-- Il controllo del cap (R-57) è fatto prima in TypeScript; `p_override_reason` è la motivazione dell'eccezione del moderatore.
create function admin_execute_trade(
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
      select * into v_c from contracts where id = (v_item ->> 'id')::int for update;
      if not found or v_c.season_id <> v_season or v_c.team_id <> v_from or v_c.version <> (v_item ->> 'version')::int then
        raise exception 'CONFLICT: un contratto dello scambio è cambiato nel frattempo';
      end if;
      update contracts set team_id = v_to where id = v_c.id;
      v_n_contracts := v_n_contracts + 1;
      perform audit_write('trade', 'contracts', v_c.id::text,
        jsonb_build_object('team_id', v_from), jsonb_build_object('team_id', v_to));
    end loop;

    for v_item in select jsonb_array_elements(coalesce(v_gives -> 'picks', '[]'::jsonb)) loop
      select * into v_p from draft_picks where id = (v_item ->> 'id')::int for update;
      if not found or v_p.current_team_id is distinct from v_from or v_p.version <> (v_item ->> 'version')::int then
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

-- ---------- Permessi ----------
revoke all on function admin_sign_contract(int, uuid, roster_slot, numeric, boolean, numeric, boolean, restriction_kind, text) from public, anon;
revoke all on function admin_update_contract(int, int, roster_slot, numeric, boolean, numeric) from public, anon;
revoke all on function admin_cut_player(int, int, numeric) from public, anon;
revoke all on function admin_execute_trade(uuid, uuid, jsonb, jsonb, text, text) from public, anon;
grant execute on function admin_sign_contract(int, uuid, roster_slot, numeric, boolean, numeric, boolean, restriction_kind, text) to authenticated;
grant execute on function admin_update_contract(int, int, roster_slot, numeric, boolean, numeric) to authenticated;
grant execute on function admin_cut_player(int, int, numeric) to authenticated;
grant execute on function admin_execute_trade(uuid, uuid, jsonb, jsonb, text, text) to authenticated;
