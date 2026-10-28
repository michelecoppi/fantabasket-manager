-- Scambi: ogni giocatore ceduto può arrivare come titolare o come riserva (R-04, R-56; docs/OPEN-QUESTIONS.md).
-- Gli item di p_a_gives / p_b_gives accettano un campo opzionale 'slot' ('starter' o 'reserve'): senza, il giocatore mantiene lo
-- slot che aveva. La squadra talenti non si cambia in uno scambio. Le regole (cap, massimi di rosa) le controlla l'action con
-- src/lib/cap.ts; qui solo la coerenza dei dati. Stessa firma di prima: create or replace.
create or replace function admin_execute_trade(
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
  v_slot roster_slot;
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
