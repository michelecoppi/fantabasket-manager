-- Scambi tra due o più squadre (R-55, R-56). Ogni giocatore o pick ceduto ha la sua squadra di destinazione.
-- Il numero massimo di squadre è un parametro di lega (`trade_max_teams`, decisione di lega: docs/OPEN-QUESTIONS.md) e lo
-- controlla l'action con src/lib/cap.ts, come cap e massimi di rosa; qui solo la coerenza dei dati.
-- Cambia la firma di admin_execute_trade: migrazione e deploy del codice vanno insieme.

insert into league_settings (season_id, key, value)
select s.id, 'trade_max_teams', 4 from seasons s
on conflict (season_id, key) do nothing;

drop function admin_execute_trade(uuid, uuid, jsonb, jsonb, text, text, jsonb);

-- p_teams: squadre dello scambio, nell'ordine scelto (distinte, almeno due).
-- p_moves: [{ kind: 'contract'|'pick', id, version, from, to, slot?: 'starter'|'reserve', label? }]; `slot` solo per i contratti
-- (senza, il giocatore mantiene lo slot che aveva). Ogni squadra deve comparire in almeno un movimento.
create function admin_execute_trade(
  p_teams uuid[],
  p_moves jsonb,
  p_approved_by text,
  p_override_reason text,
  p_roster_revs jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_trade int;
  v_team uuid;
  v_from uuid;
  v_to uuid;
  v_item jsonb;
  v_c contracts;
  v_p draft_picks;
  v_slot roster_slot;
  v_n_contracts int := 0;
  v_n_picks int := 0;
  v_names text;
  v_revs jsonb := '{}'::jsonb;
begin
  perform admin_guard();
  if p_teams is null or cardinality(p_teams) < 2 or array_position(p_teams, null) is not null
     or (select count(distinct t) from unnest(p_teams) t) <> cardinality(p_teams) then
    raise exception 'INVALID: servono almeno due squadre diverse';
  end if;
  if p_moves is null or jsonb_typeof(p_moves) <> 'array' then raise exception 'INVALID: movimenti mancanti'; end if;
  if p_roster_revs is null or jsonb_typeof(p_roster_revs) <> 'object' then raise exception 'INVALID: revisione della rosa mancante'; end if;
  foreach v_team in array p_teams loop
    if coalesce(p_roster_revs -> v_team::text, 'null'::jsonb) = 'null'::jsonb then
      raise exception 'INVALID: revisione della rosa mancante';
    end if;
    v_revs := v_revs || jsonb_build_object(v_team::text, p_roster_revs -> v_team::text);
  end loop;

  v_season := lock_current_season();
  if (select count(*) from teams where id = any(p_teams)) <> cardinality(p_teams) then
    raise exception 'INVALID: squadra inesistente';
  end if;
  -- roster_lock blocca le squadre in ordine di id: nessun deadlock tra scambi con squadre in comune.
  perform roster_lock(v_revs);

  for v_item in select jsonb_array_elements(p_moves) loop
    if (v_item ->> 'version') is null then raise exception 'INVALID: versione mancante'; end if;
    v_from := (v_item ->> 'from')::uuid;
    v_to := (v_item ->> 'to')::uuid;
    if v_from is null or v_to is null or v_from = v_to or not (v_from = any(p_teams)) or not (v_to = any(p_teams)) then
      raise exception 'INVALID: ogni movimento va da una squadra dello scambio a un''altra';
    end if;

    if v_item ->> 'kind' = 'contract' then
      if (v_item ->> 'slot') is not null and (v_item ->> 'slot') not in ('starter', 'reserve') then
        raise exception 'INVALID: slot di arrivo non valido';
      end if;
      select * into v_c from contracts where id = (v_item ->> 'id')::int for update;
      if not found or v_c.season_id <> v_season or v_c.team_id <> v_from or v_c.version is distinct from (v_item ->> 'version')::int then
        raise exception 'CONFLICT: un contratto dello scambio è cambiato nel frattempo';
      end if;
      v_slot := coalesce((v_item ->> 'slot')::roster_slot, v_c.slot);
      if v_slot <> v_c.slot and (v_c.slot = 'talent' or v_slot = 'talent') then
        raise exception 'INVALID: la squadra talenti non si cambia in uno scambio';
      end if;
      update contracts set team_id = v_to, slot = v_slot where id = v_c.id;
      v_n_contracts := v_n_contracts + 1;
      perform audit_write('trade', 'contracts', v_c.id::text,
        jsonb_build_object('team_id', v_from) || case when v_slot <> v_c.slot then jsonb_build_object('slot', v_c.slot) else '{}'::jsonb end,
        jsonb_build_object('team_id', v_to) || case when v_slot <> v_c.slot then jsonb_build_object('slot', v_slot) else '{}'::jsonb end);
    elsif v_item ->> 'kind' = 'pick' then
      select * into v_p from draft_picks where id = (v_item ->> 'id')::int for update;
      if not found or v_p.current_team_id is distinct from v_from or v_p.version is distinct from (v_item ->> 'version')::int then
        raise exception 'CONFLICT: una pick dello scambio è cambiata nel frattempo';
      end if;
      update draft_picks set current_team_id = v_to where id = v_p.id;
      v_n_picks := v_n_picks + 1;
      perform audit_write('trade', 'draft_picks', v_p.id::text,
        jsonb_build_object('current_team_id', v_from), jsonb_build_object('current_team_id', v_to));
    else
      raise exception 'INVALID: movimento di tipo sconosciuto';
    end if;
  end loop;

  if v_n_contracts + v_n_picks = 0 then raise exception 'INVALID: lo scambio è vuoto'; end if;
  foreach v_team in array p_teams loop
    if not exists (select 1 from jsonb_array_elements(p_moves) m where m ->> 'from' = v_team::text or m ->> 'to' = v_team::text) then
      raise exception 'INVALID: una squadra dello scambio non cede e non riceve nulla';
    end if;
  end loop;

  insert into trades (season_id, status, payload, approved_by, cap_override_reason)
  values (v_season, 'approved', jsonb_build_object('teams', to_jsonb(p_teams), 'moves', p_moves),
    nullif(trim(p_approved_by), ''), nullif(trim(p_override_reason), ''))
  returning id into v_trade;

  select string_agg(t.name, ' ⇄ ' order by x.ord) into v_names
  from unnest(p_teams) with ordinality x(id, ord) join teams t on t.id = x.id;
  perform audit_write('trade', 'trades', v_trade::text, null,
    jsonb_build_object('summary', format('Scambio %s · %s giocatori, %s pick', v_names, v_n_contracts, v_n_picks),
      'cap_override_reason', nullif(trim(p_override_reason), '')));
  return v_trade;
end $$;

revoke all on function admin_execute_trade(uuid[], jsonb, text, text, jsonb) from public, anon;
grant execute on function admin_execute_trade(uuid[], jsonb, text, text, jsonb) to authenticated;
