-- Diritti dei talenti come moneta di scambio (R-56, R-35; piano in docs/product/PIANO-SCAMBIO-TALENTI.md, decisioni
-- dell'utente del 2026-10-30). Un movimento di scambio può essere anche `kind: 'talent'`: cambia solo la squadra che possiede
-- il talento (`talents.team_id`), cioè chi può firmarlo; anno di draft, valore d'ingresso e collegamento al listone restano.
-- Un talento non ha stipendio, quindi cap, budget riserve e massimi di rosa non c'entrano: le regole restano in
-- `src/lib/cap.ts` (`evaluateTrade`), qui solo coerenza dei dati (proprietario, versione, lock).
--
-- Compatibile all'indietro: il codice di prima non manda mai movimenti `talent` e non legge le colonne nuove, quindi la
-- migrazione si applica prima del deploy del codice che la usa. Firme delle funzioni invariate (`create or replace`).
--
-- In più:
--  * `admin_sign_talent` blocca la squadra prima del talento (ordine comune stagione -> squadre -> righe): prima bloccava il
--    talento e poi la squadra, e una firma e uno scambio dello stesso talento in contemporanea andavano in deadlock;
--  * D4: approvando una proposta senza contratti (solo talenti e/o pick) non c'è niente da rifare su Dunkest, dove ci sono
--    solo i titolari: la proposta risulta subito «fatta su Dunkest».

-- ---------- Versione dei talenti ----------
-- Cambia solo con il proprietario: collegare o scollegare il talento al listone (`admin_link_talents`) non fa scadere le
-- proposte aperte che lo contengono; un giro A -> B -> A tra invio e approvazione sì (come per le pick).
alter table talents add column version int not null default 1;
create trigger talents_bump_version before update of team_id on talents
  for each row when (old.team_id is distinct from new.team_id) execute function bump_version();

-- ---------- Forma dei movimenti ----------
create or replace function trade_moves_check(p_teams uuid[], p_moves jsonb) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_item jsonb;
  v_from uuid;
  v_to uuid;
  v_team uuid;
begin
  if p_teams is null or cardinality(p_teams) < 2 or array_position(p_teams, null) is not null
     or (select count(distinct t) from unnest(p_teams) t) <> cardinality(p_teams) then
    raise exception 'INVALID: servono almeno due squadre diverse';
  end if;
  if p_moves is null or jsonb_typeof(p_moves) <> 'array' then raise exception 'INVALID: movimenti mancanti'; end if;
  if jsonb_array_length(p_moves) = 0 then raise exception 'INVALID: lo scambio è vuoto'; end if;

  for v_item in select jsonb_array_elements(p_moves) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'kind', '') not in ('contract', 'pick', 'talent') then
      raise exception 'INVALID: movimento di tipo sconosciuto';
    end if;
    if (v_item ->> 'id') is null or (v_item ->> 'version') is null then raise exception 'INVALID: versione mancante'; end if;
    v_from := (v_item ->> 'from')::uuid;
    v_to := (v_item ->> 'to')::uuid;
    if v_from is null or v_to is null or v_from = v_to or not (v_from = any(p_teams)) or not (v_to = any(p_teams)) then
      raise exception 'INVALID: ogni movimento va da una squadra dello scambio a un''altra';
    end if;
    if (v_item ->> 'slot') is not null then
      if v_item ->> 'kind' <> 'contract' then raise exception 'INVALID: lo slot di arrivo vale solo per i giocatori a contratto'; end if;
      if (v_item ->> 'slot') not in ('starter', 'reserve') then raise exception 'INVALID: slot di arrivo non valido'; end if;
    end if;
  end loop;

  if (select count(distinct (m ->> 'kind') || ':' || (m ->> 'id')) from jsonb_array_elements(p_moves) m) <> jsonb_array_length(p_moves) then
    raise exception 'INVALID: un giocatore, un talento o una pick compare due volte';
  end if;
  foreach v_team in array p_teams loop
    if not exists (select 1 from jsonb_array_elements(p_moves) m where m ->> 'from' = v_team::text or m ->> 'to' = v_team::text) then
      raise exception 'INVALID: una squadra dello scambio non cede e non riceve nulla';
    end if;
  end loop;
end $$;

-- Contratti, pick e talenti dei movimenti sono ancora di chi li cede, alla stessa versione (senza lock: per invio e risposta).
-- I talenti non dipendono dalla stagione.
create or replace function trade_moves_current(p_moves jsonb, p_season int) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from jsonb_array_elements(p_moves) m
    where case m ->> 'kind'
      when 'contract' then not exists (
        select 1 from contracts c
        where c.id = (m ->> 'id')::int and c.season_id = p_season
          and c.team_id = (m ->> 'from')::uuid and c.version = (m ->> 'version')::int)
      when 'pick' then not exists (
        select 1 from draft_picks d
        where d.id = (m ->> 'id')::int and d.current_team_id = (m ->> 'from')::uuid and d.version = (m ->> 'version')::int)
      when 'talent' then not exists (
        select 1 from talents t
        where t.id = (m ->> 'id')::int and t.team_id = (m ->> 'from')::uuid and t.version = (m ->> 'version')::int)
      else true end);
$$;

-- ---------- Esecuzione ----------
-- Come in 20261029180000_trade_proposals.sql, più il ramo `talent`. Per i talenti il movimento salvato in `trades.payload` ha
-- nome, anno di draft, valore d'ingresso e giocatore collegato letti qui, non dal client: l'import riscrive i talenti con id
-- nuovi e un talento firmato sparisce dalla tabella, ma lo storico e il bot devono sapere chi era.
create or replace function trade_apply(
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
  v_t talents;
  v_slot roster_slot;
  v_n_contracts int := 0;
  v_n_picks int := 0;
  v_n_talents int := 0;
  v_names text;
  v_revs jsonb := '{}'::jsonb;
  v_moves jsonb := '[]'::jsonb;
  v_label text;
begin
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
  perform trade_moves_check(p_teams, p_moves);

  for v_item in select jsonb_array_elements(p_moves) loop
    v_from := (v_item ->> 'from')::uuid;
    v_to := (v_item ->> 'to')::uuid;
    if v_item ->> 'kind' = 'contract' then
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
      select * into v_t from talents where id = (v_item ->> 'id')::int for update;
      if not found or v_t.team_id is distinct from v_from or v_t.version is distinct from (v_item ->> 'version')::int then
        raise exception 'CONFLICT: un talento dello scambio è cambiato nel frattempo';
      end if;
      update talents set team_id = v_to where id = v_t.id;
      v_n_talents := v_n_talents + 1;
      perform audit_write('trade', 'talents', v_t.id::text, jsonb_build_object('team_id', v_from), jsonb_build_object('team_id', v_to));
      select case when p.first_name <> '' then p.first_name || ' ' || p.last_name else p.last_name end into v_label
      from players p where p.id = v_t.player_id;
      v_item := v_item || jsonb_build_object('label', coalesce(v_label, v_t.display_name), 'draft_year', v_t.draft_year,
        'entry_credits', v_t.entry_credits, 'player_id', v_t.player_id);
    end if;
    v_moves := v_moves || jsonb_build_array(v_item);
  end loop;

  insert into trades (season_id, status, payload, approved_by, cap_override_reason)
  values (v_season, 'approved', jsonb_build_object('teams', to_jsonb(p_teams), 'moves', v_moves),
    nullif(trim(p_approved_by), ''), nullif(trim(p_override_reason), ''))
  returning id into v_trade;

  select string_agg(t.name, ' ⇄ ' order by x.ord) into v_names
  from unnest(p_teams) with ordinality x(id, ord) join teams t on t.id = x.id;
  perform audit_write('trade', 'trades', v_trade::text, null,
    jsonb_build_object('summary', format('Scambio %s · %s giocatori, %s pick', v_names, v_n_contracts, v_n_picks)
        || case v_n_talents when 0 then '' when 1 then ', 1 talento' else format(', %s talenti', v_n_talents) end,
      'cap_override_reason', nullif(trim(p_override_reason), '')));

  -- Le proposte ancora aperte con un giocatore, un talento o una pick appena scambiati non si possono più eseguire. Le
  -- `pending` già scadute restano fuori: le marca `trade_proposals_expire`.
  with s as (
    update trade_proposals p
    set status = 'superseded', decided_at = now(), decided_by = auth.uid(),
        decision_note = 'Un giocatore, un talento o una pick della proposta è già stato scambiato'
    where (p.status = 'accepted' or (p.status = 'pending' and p.expires_at > now()))
      and exists (
        select 1 from jsonb_array_elements(p.moves) a, jsonb_array_elements(p_moves) b
        where a ->> 'kind' = b ->> 'kind' and a ->> 'id' = b ->> 'id')
    returning p.id)
  insert into trade_proposal_events (proposal_id, kind, user_id, note)
  select id, 'superseded', auth.uid(), format('Scambio n. %s', v_trade) from s;

  return v_trade;
end $$;

-- ---------- Approvazione di una proposta: D4, niente Dunkest senza contratti ----------
create or replace function admin_approve_trade_proposal(
  p_id int,
  p_version int,
  p_approved_by text,
  p_override_reason text,
  p_roster_revs jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_p trade_proposals;
  v_season int;
  v_t uuid;
  v_revs jsonb := '{}'::jsonb;
  v_trade int;
  v_no_dunkest boolean;
begin
  perform admin_guard();
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  select * into v_p from trade_proposals where id = p_id;
  if not found then raise exception 'CONFLICT: la proposta non esiste più'; end if;
  if p_roster_revs is null or jsonb_typeof(p_roster_revs) <> 'object' then raise exception 'INVALID: revisione della rosa mancante'; end if;
  foreach v_t in array v_p.teams loop
    if coalesce(p_roster_revs -> v_t::text, 'null'::jsonb) = 'null'::jsonb then raise exception 'INVALID: revisione della rosa mancante'; end if;
    v_revs := v_revs || jsonb_build_object(v_t::text, p_roster_revs -> v_t::text);
  end loop;

  -- Stagione e squadre prima della proposta (ordine dei lock comune), poi la proposta.
  v_season := lock_current_season();
  perform roster_lock(v_revs);
  select * into v_p from trade_proposals where id = p_id for update;
  if v_p.version is distinct from p_version then raise exception 'CONFLICT: la proposta è cambiata nel frattempo'; end if;
  if v_p.status <> 'accepted' then raise exception 'CONFLICT: la proposta non è in attesa di approvazione'; end if;
  if v_p.season_id <> v_season then raise exception 'CONFLICT: la proposta è di una stagione chiusa'; end if;

  -- Prima `approved`, così trade_apply non la marca superata insieme alle altre.
  update trade_proposals set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = p_id;
  v_trade := trade_apply(v_p.teams, v_p.moves, p_approved_by, p_override_reason, v_revs);
  -- Su Dunkest ci sono solo i titolari: senza contratti non c'è niente da rifare (decisione dell'utente 2026-10-30).
  v_no_dunkest := not exists (select 1 from jsonb_array_elements(v_p.moves) m where m ->> 'kind' = 'contract');
  update trade_proposals set trade_id = v_trade, dunkest_done_at = case when v_no_dunkest then now() end where id = p_id;
  insert into trade_proposal_events (proposal_id, kind, user_id, note)
  values (p_id, 'approved', auth.uid(), nullif(trim(p_override_reason), ''));
  if v_no_dunkest then
    insert into trade_proposal_events (proposal_id, kind, user_id, note)
    values (p_id, 'dunkest_done', auth.uid(), 'Nessun giocatore a contratto: niente da fare su Dunkest');
  end if;
  perform audit_write('trade_proposal', 'trade_proposals', p_id::text, jsonb_build_object('status', v_p.status),
    jsonb_build_object('status', 'approved', 'trade_id', v_trade,
      'summary', format('Proposta di scambio n. %s approvata ed eseguita (scambio n. %s)', p_id, v_trade)));
  return v_trade;
end $$;

-- ---------- Firma di un talento: la squadra prima del talento ----------
-- Stessa funzione della 20261030013336_sign_talent.sql; cambia solo l'ordine dei lock (come `lock_contract_team`): la squadra
-- del talento si legge senza lock, si blocca la squadra, poi il talento, e si ricontrolla che sia ancora di quella squadra.
create or replace function admin_sign_talent(
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
  v_owner uuid;
  v_id int;
  v_player text;
  v_team text;
begin
  perform admin_guard();
  if p_roster_rev is null then raise exception 'INVALID: revisione della rosa mancante'; end if;
  if p_slot = 'talent' then raise exception 'INVALID: un talento firmato va tra i titolari o le riserve'; end if;
  v_season := lock_current_season();

  select team_id into v_owner from talents where id = p_talent_id;
  if not found then raise exception 'CONFLICT: il talento non c''è più (firmato o tolto da un altro admin?)'; end if;
  if v_owner is distinct from p_team_id then raise exception 'CONFLICT: il talento è passato a un''altra squadra'; end if;
  select trim(first_name || ' ' || last_name) into v_player from players where id = p_player_id;
  select name into v_team from teams where id = p_team_id;
  if v_player is null or v_team is null then raise exception 'INVALID: giocatore o squadra inesistenti'; end if;
  perform roster_lock(jsonb_build_object(p_team_id::text, p_roster_rev));

  select * into v_talent from talents where id = p_talent_id for update;
  if not found then raise exception 'CONFLICT: il talento non c''è più (firmato o tolto da un altro admin?)'; end if;
  if v_talent.team_id is distinct from p_team_id then raise exception 'CONFLICT: il talento è passato a un''altra squadra'; end if;
  if v_talent.player_id is not null and v_talent.player_id is distinct from p_player_id then
    raise exception 'CONFLICT: il talento è collegato a un altro giocatore del listone';
  end if;

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

-- ---------- Annunci del bot: anche i talenti ----------
-- Come in 20261029210000_trade_announcements.sql. Per i talenti valgono i dati salvati nel movimento da `trade_apply` (nome,
-- anno di draft, valore d'ingresso, giocatore collegato) più, se il giocatore è collegato, nome completo, ruolo, squadra NBA,
-- punteggio Dunkest e infortunio di adesso.
create or replace function trade_announce_claim(p_secret text, p_max_age_hours int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  if p_max_age_hours is null or p_max_age_hours < 1 then raise exception 'INVALID: età massima non valida'; end if;
  with c as (
    update trades set announce_claimed_at = now()
    where status = 'approved' and announced_at is null
      and created_at > now() - make_interval(hours => p_max_age_hours)
      and (announce_claimed_at is null or announce_claimed_at < now() - interval '5 minutes')
    returning *)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'created_at', c.created_at,
      'cap_override_reason', c.cap_override_reason,
      'teams', (
        select jsonb_agg(jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'season_trades', (select count(*) from trades x
                              where x.season_id = c.season_id and x.status = 'approved' and x.id <= c.id
                                and x.payload -> 'teams' ? t.id::text))
          order by o.ord)
        from jsonb_array_elements_text(c.payload -> 'teams') with ordinality o(id, ord)
        join teams t on t.id = o.id::uuid),
      'moves', (
        select jsonb_agg(m.value || case m.value ->> 'kind'
            when 'contract' then coalesce((
              select jsonb_build_object(
                'name', case when p.first_name <> '' then p.first_name || ' ' || p.last_name else p.last_name end,
                'pos', p.pos,
                'salary', k.salary,
                'years_left', k.years_left,
                'rookie', k.is_rookie,
                'pdk', s.pdk,
                'gp', s.gp,
                'injury', i.injury)
              from contracts k
              join players p on p.id = k.player_id
              left join dunkest_stats s on s.player_id = k.player_id and s.season_id = c.season_id
              left join dunkest_injuries i on i.player_id = k.player_id
              where k.id = (m.value ->> 'id')::int), '{}'::jsonb)
            when 'talent' then coalesce((
              select jsonb_build_object(
                'name', case when p.first_name <> '' then p.first_name || ' ' || p.last_name else p.last_name end,
                'pos', p.pos,
                'nba_team', p.nba_team,
                'pdk', s.pdk,
                'gp', s.gp,
                'injury', i.injury)
              from players p
              left join dunkest_stats s on s.player_id = p.id and s.season_id = c.season_id
              left join dunkest_injuries i on i.player_id = p.id
              where p.id = (m.value ->> 'player_id')::int), '{}'::jsonb)
            else coalesce((
              select jsonb_build_object('year', d.year, 'round', d.round, 'original_team', ot.name)
              from draft_picks d join teams ot on ot.id = d.original_team_id
              where d.id = (m.value ->> 'id')::int), '{}'::jsonb)
          end
          order by m.ord)
        from jsonb_array_elements(c.payload -> 'moves') with ordinality m(value, ord))
    ) order by c.id), '[]'::jsonb)
  into v from c;
  return v;
end $$;
