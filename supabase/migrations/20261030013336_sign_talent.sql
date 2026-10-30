-- Firma di un talento (R-35, R-26): un admin porta un giocatore della squadra talenti in rosa con un contratto rookie.
-- Se il talento è già collegato al listone (`talents.player_id`, migrazione 20261030013427) il giocatore è quello; altrimenti
-- l'admin lo sceglie alla firma. Nella stessa transazione: contratto nuovo (sempre `is_rookie`), riga del talento tolta,
-- due righe di audit. Le regole (posto in rosa, durata massima del rookie, stipendio) le controlla `cap.ts` nella action.

create function admin_sign_talent(
  p_talent_id int,
  p_team_id uuid,
  p_player_id int,
  p_slot roster_slot,
  p_years numeric,
  p_team_option boolean,
  p_salary numeric,
  p_restriction restriction_kind,
  p_notes text,
  p_roster_rev int
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_talent talents;
  v_id int;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  if p_roster_rev is null then raise exception 'INVALID: revisione della rosa mancante'; end if;
  if p_slot = 'talent' then raise exception 'INVALID: un talento firmato va tra i titolari o le riserve'; end if;
  v_season := lock_current_season();

  select * into v_talent from talents where id = p_talent_id for update;
  if not found then raise exception 'CONFLICT: il talento non c''è più (firmato o tolto da un altro admin?)'; end if;
  if v_talent.team_id is distinct from p_team_id then raise exception 'CONFLICT: il talento è passato a un''altra squadra'; end if;
  if v_talent.player_id is not null and v_talent.player_id is distinct from p_player_id then
    raise exception 'CONFLICT: il talento è collegato a un altro giocatore del listone';
  end if;

  select trim(first_name || ' ' || last_name) into v_player from players where id = p_player_id;
  select name into v_team from teams where id = p_team_id;
  if v_player is null or v_team is null then raise exception 'INVALID: giocatore o squadra inesistenti'; end if;
  perform roster_lock(jsonb_build_object(p_team_id::text, p_roster_rev));

  begin
    insert into contracts (season_id, team_id, player_id, slot, years_left, team_option, salary, is_rookie, restriction, notes)
    values (v_season, p_team_id, p_player_id, p_slot, p_years, p_team_option, p_salary, true, p_restriction, nullif(trim(p_notes), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'CONFLICT: % ha già un contratto in questa stagione', v_player;
  end;

  delete from talents where id = v_talent.id;

  perform audit_write('delete', 'talents', v_talent.id::text, to_jsonb(v_talent), null);
  perform audit_write('sign', 'contracts', v_id::text, null,
    jsonb_build_object('player_id', p_player_id, 'team_id', p_team_id, 'slot', p_slot, 'years_left', p_years,
      'team_option', p_team_option, 'salary', p_salary, 'is_rookie', true, 'talent_id', v_talent.id,
      'summary', format('%s firmato da %s dalla squadra talenti · %s crediti', v_player, v_team, p_salary)));
  return v_id;
end $$;
revoke all on function admin_sign_talent(int, uuid, int, roster_slot, numeric, boolean, numeric, restriction_kind, text, int) from public, anon;
grant execute on function admin_sign_talent(int, uuid, int, roster_slot, numeric, boolean, numeric, restriction_kind, text, int) to authenticated;
