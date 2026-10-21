-- Fase 3, seconda parte: rimozione contratti, durate in blocco, ciclo dei tagli (R-40..R-42), gestione pick (R-33/R-34),
-- quote e luxury tax pagate. Stesso schema della 0006: una RPC per operazione (transazione + audit_log), regole di lega in
-- TypeScript (`src/lib/cap.ts`), qui solo coerenza dei dati e concorrenza (`version`).

-- ---------- Nuovi parametri di lega ----------
-- R-34: le pick future diventano di proprietà solo N anni prima del draft. R-31: numero di giri del draft.
insert into league_settings (season_id, key, value)
select s.id, v.key, v.value from seasons s, (values ('pick_horizon_years', 3), ('draft_rounds', 5)) as v(key, value)
on conflict (season_id, key) do nothing;

-- ---------- Ciclo dei tagli ----------
-- 'pending'    = tagliato, in attesa dell'asta dei tagliati (R-41); la quota conta nel monte ingaggi
-- 'cut'        = taglio definitivo (R-42): libera il posto, si paga 1/3 fino a fine contratto
-- 'reinstated' = rientrato in rosa (R-42): la quota non si paga più
-- 'awarded'    = preso da un'altra squadra all'asta dei tagliati: la quota non si paga più (ASSUNZIONE, vedi OPEN-QUESTIONS)
alter table cuts drop constraint cuts_status_check;
alter table cuts add constraint cuts_status_check check (status in ('pending', 'cut', 'reinstated', 'awarded'));

-- Dati del contratto di partenza, per poterlo ripristinare se il giocatore rientra.
alter table cuts add column original_salary numeric(5,1);
alter table cuts add column original_slot roster_slot;
alter table cuts add column team_option boolean not null default false;
alter table cuts add column original_is_rookie boolean not null default false;
alter table cuts add column original_restriction restriction_kind;

-- I tagli già presenti arrivano tutti dall'import del foglio post-asta, cioè sono già definitivi.
update cuts set status = 'cut' where status = 'pending';

-- Il taglio ora ricorda i termini del contratto (stessa firma della 0006, quindi restano i permessi).
create or replace function admin_cut_player(p_contract_id int, p_version int, p_paid_salary numeric) returns int
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

-- Taglio definitivo: nessuno lo ha preso all'asta dei tagliati.
create function admin_finalize_cut(p_cut_id int, p_version int) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cut cuts;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  select * into v_cut from cuts where id = p_cut_id for update;
  if not found then raise exception 'CONFLICT: il taglio non esiste più'; end if;
  if v_cut.version <> p_version or v_cut.status <> 'pending' then
    raise exception 'CONFLICT: il taglio è già stato risolto o modificato da un altro admin';
  end if;
  update cuts set status = 'cut' where id = p_cut_id;

  select trim(first_name || ' ' || last_name) into v_player from players where id = v_cut.player_id;
  select name into v_team from teams where id = v_cut.team_id;
  perform audit_write('finalize_cut', 'cuts', p_cut_id::text, jsonb_build_object('status', v_cut.status),
    jsonb_build_object('status', 'cut',
      'summary', format('Taglio definitivo di %s (%s): quota %s crediti', v_player, v_team, v_cut.paid_salary)));
end $$;

-- Rientro in rosa: il giocatore torna alla squadra che lo aveva tagliato e la quota non si paga più.
create function admin_reinstate_cut(
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
  if p_slot = 'talent' then raise exception 'INVALID: la squadra talenti ha una tabella a parte'; end if;
  select * into v_cut from cuts where id = p_cut_id for update;
  if not found then raise exception 'CONFLICT: il taglio non esiste più'; end if;
  if v_cut.version <> p_version or v_cut.status <> 'pending' then
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

-- Asta dei tagliati: un'altra squadra lo prende. Firma il contratto e chiude il taglio nella stessa transazione.
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
  if p_slot = 'talent' then raise exception 'INVALID: la squadra talenti ha una tabella a parte'; end if;
  select * into v_cut from cuts where id = p_cut_id for update;
  if not found then raise exception 'CONFLICT: il taglio non esiste più'; end if;
  if v_cut.version <> p_version or v_cut.status <> 'pending' then
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

-- ---------- Rimozione di un contratto ----------
-- Per correggere un errore (firma sbagliata, giocatore inserito per sbaglio): NON paga nessuna quota, a differenza del taglio.
create function admin_remove_contract(p_contract_id int, p_version int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_c contracts;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  select * into v_c from contracts where id = p_contract_id for update;
  if not found then raise exception 'CONFLICT: il contratto non esiste più (tagliato o scambiato da un altro admin?)'; end if;
  if v_c.version <> p_version then raise exception 'CONFLICT: il contratto è stato modificato da un altro admin'; end if;
  delete from contracts where id = v_c.id;

  select trim(first_name || ' ' || last_name) into v_player from players where id = v_c.player_id;
  select name into v_team from teams where id = v_c.team_id;
  perform audit_write('remove', 'contracts', v_c.id::text, to_jsonb(v_c),
    jsonb_build_object('reason', nullif(trim(p_reason), ''),
      'summary', format('Contratto di %s (%s) rimosso%s', v_player, v_team, coalesce(' · ' || nullif(trim(p_reason), ''), ''))));
end $$;

-- ---------- Durate in blocco ----------
-- p_items: [{"id": 1, "version": 3, "years": 2, "team_option": false}]. "years": null = ancora da fissare.
create function admin_set_durations(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_old contracts;
  v_n int := 0;
  v_player text;
begin
  perform admin_guard();
  for v_item in select jsonb_array_elements(p_items) loop
    select * into v_old from contracts where id = (v_item ->> 'id')::int for update;
    if not found then raise exception 'CONFLICT: un contratto non esiste più'; end if;
    if v_old.version <> (v_item ->> 'version')::int then
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

-- ---------- Pick ----------
-- Correzione del proprietario o dello stato "da confermare".
create function admin_set_pick(p_pick_id int, p_version int, p_current_team_id uuid, p_to_confirm boolean, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_old draft_picks;
  v_new draft_picks;
  v_orig text;
  v_to text;
begin
  perform admin_guard();
  select * into v_old from draft_picks where id = p_pick_id for update;
  if not found then raise exception 'CONFLICT: la pick non esiste più'; end if;
  if v_old.version <> p_version then raise exception 'CONFLICT: la pick è stata modificata da un altro admin'; end if;
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

-- Apre un anno di draft: una pick per giro per squadra, ognuna alla sua squadra (R-31, R-34). L'anno lo valida la server action.
create function admin_open_pick_year(p_year int, p_rounds int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  perform admin_guard();
  if p_rounds is null or p_rounds < 1 then raise exception 'INVALID: numero di giri non valido'; end if;
  insert into draft_picks (year, round, original_team_id, current_team_id)
  select p_year, r, t.id, t.id from teams t, generate_series(1, p_rounds) r
  on conflict (year, round, original_team_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'INVALID: le pick del % esistono già', p_year; end if;
  perform audit_write('picks_open', 'draft_picks', null, null,
    jsonb_build_object('year', p_year, 'summary', format('Aperte %s pick per il draft %s', v_n, p_year)));
  return v_n;
end $$;

-- ---------- Quota di iscrizione e luxury tax ----------
create function admin_set_team_season(p_team_id uuid, p_entry_fee_paid boolean, p_luxury_tax_paid boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_team text;
  v_old team_season;
begin
  perform admin_guard();
  select id into v_season from seasons where is_current;
  if v_season is null then raise exception 'INVALID: nessuna stagione corrente'; end if;
  select name into v_team from teams where id = p_team_id;
  if v_team is null then raise exception 'INVALID: squadra inesistente'; end if;

  select * into v_old from team_season where season_id = v_season and team_id = p_team_id;
  insert into team_season (season_id, team_id, entry_fee_paid, luxury_tax_paid)
  values (v_season, p_team_id, p_entry_fee_paid, p_luxury_tax_paid)
  on conflict (season_id, team_id) do update set entry_fee_paid = excluded.entry_fee_paid, luxury_tax_paid = excluded.luxury_tax_paid;

  perform audit_write('season', 'team_season', p_team_id::text,
    jsonb_build_object('entry_fee_paid', v_old.entry_fee_paid, 'luxury_tax_paid', v_old.luxury_tax_paid),
    jsonb_build_object('entry_fee_paid', p_entry_fee_paid, 'luxury_tax_paid', p_luxury_tax_paid,
      'summary', format('%s: quota iscrizione %s, luxury tax %s', v_team,
        case when p_entry_fee_paid then 'pagata' else 'non pagata' end,
        case when p_luxury_tax_paid then 'pagata' else 'non pagata' end)));
end $$;

-- ---------- Permessi ----------
revoke all on function admin_finalize_cut(int, int) from public, anon;
revoke all on function admin_reinstate_cut(int, int, roster_slot, numeric, numeric, boolean) from public, anon;
revoke all on function admin_award_cut(int, int, uuid, roster_slot, numeric, boolean, numeric, boolean, restriction_kind, text) from public, anon;
revoke all on function admin_remove_contract(int, int, text) from public, anon;
revoke all on function admin_set_durations(jsonb) from public, anon;
revoke all on function admin_set_pick(int, int, uuid, boolean, text) from public, anon;
revoke all on function admin_open_pick_year(int, int) from public, anon;
revoke all on function admin_set_team_season(uuid, boolean, boolean) from public, anon;
grant execute on function admin_finalize_cut(int, int) to authenticated;
grant execute on function admin_reinstate_cut(int, int, roster_slot, numeric, numeric, boolean) to authenticated;
grant execute on function admin_award_cut(int, int, uuid, roster_slot, numeric, boolean, numeric, boolean, restriction_kind, text) to authenticated;
grant execute on function admin_remove_contract(int, int, text) to authenticated;
grant execute on function admin_set_durations(jsonb) to authenticated;
grant execute on function admin_set_pick(int, int, uuid, boolean, text) to authenticated;
grant execute on function admin_open_pick_year(int, int) to authenticated;
grant execute on function admin_set_team_season(uuid, boolean, boolean) to authenticated;
