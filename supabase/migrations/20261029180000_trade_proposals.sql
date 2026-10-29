-- Proposte di scambio tra squadre (Fase 7.2, docs/product/PIANO-PROPOSTE-SCAMBIO.md). Un proprietario propone, le altre
-- squadre accettano o rifiutano entro `trade_proposal_hours`, un admin approva e lo scambio si esegue nella stessa transazione.
--
-- Decisioni dell'utente (2026-10-29):
--  * le proposte le vedono solo le squadre coinvolte e gli admin; la loro storia sta in un registro privato
--    (`trade_proposal_events`, pensato come coda per il bot Telegram: `notified_at`);
--  * le ore valgono solo per le risposte: accettata da tutte, la proposta resta in coda all'admin senza scadenza;
--  * chiudere il mercato ritira le proposte non ancora approvate;
--  * una risposta per squadra (il primo account che risponde decide, si registra chi è stato);
--  * può approvare qualunque admin, anche se la sua squadra è nello scambio.
--
-- Prima scrittura dei viewer: nessuna policy di scrittura sulle tabelle nuove (nemmeno per gli admin), si scrive solo con le
-- RPC qui sotto, che controllano la squadra di chi chiama (`profiles.team_id`). Le regole di lega restano in `src/lib/cap.ts`
-- (`evaluateTrade` nelle action, di nuovo all'approvazione): qui solo coerenza (chi sei, quale squadra, versioni, scadenza,
-- mercato aperto). Chi chiama una RPC direttamente salta l'action, ma l'approvazione dell'admin rivaluta lo scambio.
--
-- Ordine dei lock, uguale ovunque (vedi 20261026220000_roster_locks.sql): stagione -> squadre -> contratti e pick -> proposte.
-- Una proposta `pending` con `expires_at` passato vale come scaduta (le RPC la rifiutano); `trade_proposals_expire`, chiamata
-- dal cron giornaliero, la marca `expired` per tenere pulito il registro.

insert into league_settings (season_id, key, value)
select s.id, 'trade_proposal_hours', 24 from seasons s
on conflict (season_id, key) do nothing;

-- ---------- Tabelle ----------
create table trade_proposals (
  id serial primary key,
  season_id int not null references seasons,
  proposer_team_id uuid not null references teams,
  proposer_user_id uuid references profiles on delete set null,
  teams uuid[] not null,
  -- stesso formato di admin_execute_trade: [{ kind, id, version, from, to, slot?, label? }]
  moves jsonb not null,
  -- { "<team_id>": roster_rev } al momento dell'invio
  roster_revs jsonb not null,
  message text,
  -- R-57: chi propone chiede l'eccezione al cap, l'admin decide all'approvazione
  cap_exception_reason text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'expired', 'superseded', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  decided_by uuid references profiles on delete set null,
  decision_note text,
  parent_id int references trade_proposals,
  trade_id int references trades,
  dunkest_done_at timestamptz,
  version int not null default 1
);
create index trade_proposals_open on trade_proposals (season_id) where status in ('pending', 'accepted');
create index trade_proposals_teams on trade_proposals using gin (teams);
create trigger trade_proposals_bump_version before update on trade_proposals for each row execute function bump_version();

create table trade_proposal_answers (
  proposal_id int not null references trade_proposals on delete cascade,
  team_id uuid not null references teams,
  user_id uuid references profiles on delete set null,
  answer text not null check (answer in ('accept', 'reject')),
  note text,
  at timestamptz not null default now(),
  primary key (proposal_id, team_id)
);

create table trade_proposal_events (
  id bigserial primary key,
  proposal_id int not null references trade_proposals on delete cascade,
  at timestamptz not null default now(),
  kind text not null
    check (kind in ('sent', 'accepted', 'rejected', 'withdrawn', 'expired', 'superseded', 'approved', 'declined', 'dunkest_done')),
  team_id uuid references teams,
  user_id uuid references profiles on delete set null,
  note text,
  notified_at timestamptz
);
create index trade_proposal_events_proposal on trade_proposal_events (proposal_id);

-- ---------- RLS: lettura alle squadre coinvolte e agli admin, scrittura solo dalle RPC ----------
-- Squadra di chi chiama. Serve alle policy, quindi è eseguibile dagli utenti autenticati (dice solo la propria squadra).
create function my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from profiles where id = auth.uid();
$$;
revoke all on function my_team_id() from public, anon;
grant execute on function my_team_id() to authenticated;

alter table trade_proposals enable row level security;
alter table trade_proposal_answers enable row level security;
alter table trade_proposal_events enable row level security;
create policy "read involved" on trade_proposals for select to authenticated
  using (is_admin() or my_team_id() = any(teams));
create policy "read involved" on trade_proposal_answers for select to authenticated
  using (exists (select 1 from trade_proposals p where p.id = proposal_id and (is_admin() or my_team_id() = any(p.teams))));
create policy "read involved" on trade_proposal_events for select to authenticated
  using (exists (select 1 from trade_proposals p where p.id = proposal_id and (is_admin() or my_team_id() = any(p.teams))));
revoke insert, update, delete on trade_proposals, trade_proposal_answers, trade_proposal_events from anon, authenticated;

-- ---------- Helper interni (mai chiamabili dai client) ----------
-- Forma di uno scambio: squadre distinte, movimenti validi, nessun giocatore o pick ripetuto, ogni squadra partecipa.
create function trade_moves_check(p_teams uuid[], p_moves jsonb) returns void
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
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item ->> 'kind', '') not in ('contract', 'pick') then
      raise exception 'INVALID: movimento di tipo sconosciuto';
    end if;
    if (v_item ->> 'id') is null or (v_item ->> 'version') is null then raise exception 'INVALID: versione mancante'; end if;
    v_from := (v_item ->> 'from')::uuid;
    v_to := (v_item ->> 'to')::uuid;
    if v_from is null or v_to is null or v_from = v_to or not (v_from = any(p_teams)) or not (v_to = any(p_teams)) then
      raise exception 'INVALID: ogni movimento va da una squadra dello scambio a un''altra';
    end if;
    if v_item ->> 'kind' = 'contract' and (v_item ->> 'slot') is not null and (v_item ->> 'slot') not in ('starter', 'reserve') then
      raise exception 'INVALID: slot di arrivo non valido';
    end if;
  end loop;

  if (select count(distinct (m ->> 'kind') || ':' || (m ->> 'id')) from jsonb_array_elements(p_moves) m) <> jsonb_array_length(p_moves) then
    raise exception 'INVALID: un giocatore o una pick compare due volte';
  end if;
  foreach v_team in array p_teams loop
    if not exists (select 1 from jsonb_array_elements(p_moves) m where m ->> 'from' = v_team::text or m ->> 'to' = v_team::text) then
      raise exception 'INVALID: una squadra dello scambio non cede e non riceve nulla';
    end if;
  end loop;
end $$;

-- I contratti e le pick dei movimenti sono ancora di chi li cede, alla stessa versione (senza lock: per invio e risposta).
create function trade_moves_current(p_moves jsonb, p_season int) returns boolean
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
      else true end);
$$;

-- Esecuzione di uno scambio, comune ad admin_execute_trade e admin_approve_trade_proposal (così le due strade non divergono).
-- Stessa logica della 20261028180000_trade_multi.sql; in più, le proposte aperte che muovono gli stessi contratti o pick
-- diventano `superseded`.
create function trade_apply(
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
    else
      select * into v_p from draft_picks where id = (v_item ->> 'id')::int for update;
      if not found or v_p.current_team_id is distinct from v_from or v_p.version is distinct from (v_item ->> 'version')::int then
        raise exception 'CONFLICT: una pick dello scambio è cambiata nel frattempo';
      end if;
      update draft_picks set current_team_id = v_to where id = v_p.id;
      v_n_picks := v_n_picks + 1;
      perform audit_write('trade', 'draft_picks', v_p.id::text,
        jsonb_build_object('current_team_id', v_from), jsonb_build_object('current_team_id', v_to));
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

  -- Le proposte ancora aperte con un giocatore o una pick appena scambiati non si possono più eseguire. Le `pending` già
  -- scadute restano fuori: le marca `trade_proposals_expire`.
  with s as (
    update trade_proposals p
    set status = 'superseded', decided_at = now(), decided_by = auth.uid(),
        decision_note = 'Un giocatore o una pick della proposta è già stato scambiato'
    where (p.status = 'accepted' or (p.status = 'pending' and p.expires_at > now()))
      and exists (
        select 1 from jsonb_array_elements(p.moves) a, jsonb_array_elements(p_moves) b
        where a ->> 'kind' = b ->> 'kind' and a ->> 'id' = b ->> 'id')
    returning p.id)
  insert into trade_proposal_events (proposal_id, kind, user_id, note)
  select id, 'superseded', auth.uid(), format('Scambio n. %s', v_trade) from s;

  return v_trade;
end $$;

-- Chiude una proposta ancora aperta (in attesa e non scaduta, o accettata da tutte): ritiro, respinta, rimandata.
create function trade_proposal_close(p_id int, p_version int, p_status text, p_team uuid, p_note text) returns trade_proposals
language plpgsql security definer set search_path = public as $$
declare
  v_p trade_proposals;
begin
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  select * into v_p from trade_proposals where id = p_id for update;
  if not found then raise exception 'CONFLICT: la proposta non esiste più'; end if;
  if v_p.version is distinct from p_version then raise exception 'CONFLICT: la proposta è cambiata nel frattempo'; end if;
  if not (v_p.status = 'accepted' or (v_p.status = 'pending' and v_p.expires_at > now())) then
    raise exception 'CONFLICT: la proposta è già chiusa (scaduta, rifiutata, ritirata o approvata)';
  end if;
  update trade_proposals
  set status = p_status, decided_at = now(), decided_by = auth.uid(), decision_note = nullif(trim(p_note), '')
  where id = p_id returning * into v_p;
  insert into trade_proposal_events (proposal_id, kind, team_id, user_id, note)
  values (p_id, p_status, p_team, auth.uid(), nullif(trim(p_note), ''));
  return v_p;
end $$;

revoke all on function trade_moves_check(uuid[], jsonb) from public, anon, authenticated;
revoke all on function trade_moves_current(jsonb, int) from public, anon, authenticated;
revoke all on function trade_apply(uuid[], jsonb, text, text, jsonb) from public, anon, authenticated;
revoke all on function trade_proposal_close(int, int, text, uuid, text) from public, anon, authenticated;

-- ---------- admin_execute_trade: stessa firma, ora passa dall'helper comune ----------
create or replace function admin_execute_trade(
  p_teams uuid[],
  p_moves jsonb,
  p_approved_by text,
  p_override_reason text,
  p_roster_revs jsonb
) returns int
language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  return trade_apply(p_teams, p_moves, p_approved_by, p_override_reason, p_roster_revs);
end $$;

-- ---------- RPC delle squadre ----------
-- Invio. p_parent: controproposta. Se la proposta di partenza è ancora aperta si chiude nella stessa transazione: rifiutata
-- se chi controproponde è una controparte che non ha ancora risposto, ritirata se è il proponente.
create function trade_propose(
  p_teams uuid[],
  p_moves jsonb,
  p_roster_revs jsonb,
  p_message text,
  p_cap_reason text,
  p_parent int
) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := my_team_id();
  v_season int;
  v_hours numeric;
  v_t uuid;
  v_parent trade_proposals;
  v_id int;
begin
  if auth.uid() is null or v_team is null then raise exception 'FORBIDDEN: serve un account collegato a una squadra'; end if;
  if not coalesce(v_team = any(p_teams), false) then raise exception 'FORBIDDEN: puoi proporre solo scambi della tua squadra'; end if;
  if char_length(p_message) > 1000 or char_length(p_cap_reason) > 1000 then raise exception 'INVALID: messaggio troppo lungo'; end if;

  v_season := lock_current_season();
  if not (select trade_market_open from seasons where id = v_season) then raise exception 'INVALID: il mercato degli scambi è chiuso'; end if;
  perform trade_moves_check(p_teams, p_moves);
  if p_roster_revs is null or jsonb_typeof(p_roster_revs) <> 'object' then raise exception 'INVALID: revisione della rosa mancante'; end if;
  foreach v_t in array p_teams loop
    if coalesce(p_roster_revs -> v_t::text, 'null'::jsonb) = 'null'::jsonb then raise exception 'INVALID: revisione della rosa mancante'; end if;
    if (select roster_rev from teams where id = v_t) is distinct from (p_roster_revs ->> v_t::text)::int then
      raise exception 'CONFLICT: la rosa di una squadra è cambiata';
    end if;
  end loop;
  if not trade_moves_current(p_moves, v_season) then
    raise exception 'CONFLICT: un giocatore o una pick dello scambio è cambiato';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_moves) m join contracts c on c.id = (m ->> 'id')::int
    where m ->> 'kind' = 'contract' and (m ->> 'slot') is not null and (m ->> 'slot')::roster_slot <> c.slot
      and (c.slot = 'talent' or m ->> 'slot' = 'talent')) then
    raise exception 'INVALID: la squadra talenti non si cambia in uno scambio';
  end if;
  select value into v_hours from league_settings where season_id = v_season and key = 'trade_proposal_hours';
  if v_hours is null or v_hours <= 0 then raise exception 'INVALID: manca il parametro trade_proposal_hours'; end if;

  if p_parent is not null then
    select * into v_parent from trade_proposals where id = p_parent for update;
    if not found or not (v_team = any(v_parent.teams)) then raise exception 'INVALID: proposta di partenza non disponibile'; end if;
    if v_parent.status = 'pending' and v_parent.expires_at > now() then
      if v_parent.proposer_team_id = v_team then
        perform trade_proposal_close(v_parent.id, v_parent.version, 'withdrawn', v_team, 'Sostituita da una nuova proposta');
      else
        begin
          insert into trade_proposal_answers (proposal_id, team_id, user_id, answer, note)
          values (v_parent.id, v_team, auth.uid(), 'reject', 'Controproposta');
        exception when unique_violation then
          raise exception 'INVALID: la tua squadra ha già accettato la proposta di partenza';
        end;
        update trade_proposals set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = v_parent.id;
        insert into trade_proposal_events (proposal_id, kind, team_id, user_id, note)
        values (v_parent.id, 'rejected', v_team, auth.uid(), 'Controproposta');
      end if;
    elsif v_parent.status = 'accepted' then
      if v_parent.proposer_team_id <> v_team then
        raise exception 'INVALID: la proposta di partenza è già stata accettata da tutte le squadre';
      end if;
      perform trade_proposal_close(v_parent.id, v_parent.version, 'withdrawn', v_team, 'Sostituita da una nuova proposta');
    end if;
  end if;

  insert into trade_proposals (season_id, proposer_team_id, proposer_user_id, teams, moves, roster_revs, message,
                               cap_exception_reason, expires_at, parent_id)
  values (v_season, v_team, auth.uid(), p_teams, p_moves, p_roster_revs, nullif(trim(p_message), ''),
          nullif(trim(p_cap_reason), ''), now() + v_hours * interval '1 hour', p_parent)
  returning id into v_id;
  insert into trade_proposal_events (proposal_id, kind, team_id, user_id) values (v_id, 'sent', v_team, auth.uid());
  return v_id;
end $$;

-- Risposta di una controparte. All'ultima accettazione la proposta passa in coda all'admin; un rifiuto la chiude.
create function trade_answer(p_id int, p_version int, p_answer text, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := my_team_id();
  v_season int;
  v_p trade_proposals;
  v_accepts int;
begin
  if auth.uid() is null or v_team is null then raise exception 'FORBIDDEN: serve un account collegato a una squadra'; end if;
  select * into v_p from trade_proposals where id = p_id;
  if not found or not (v_team = any(v_p.teams)) then raise exception 'FORBIDDEN: proposta non disponibile'; end if;
  if v_p.proposer_team_id = v_team then raise exception 'INVALID: la tua squadra ha proposto lo scambio'; end if;
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  if p_answer is null or p_answer not in ('accept', 'reject') then raise exception 'INVALID: risposta non valida'; end if;
  if char_length(p_note) > 1000 then raise exception 'INVALID: nota troppo lunga'; end if;

  v_season := lock_current_season();
  if not (select trade_market_open from seasons where id = v_season) then raise exception 'INVALID: il mercato degli scambi è chiuso'; end if;
  select * into v_p from trade_proposals where id = p_id for update;
  if v_p.version is distinct from p_version then raise exception 'CONFLICT: la proposta è cambiata nel frattempo'; end if;
  if v_p.status <> 'pending' then raise exception 'CONFLICT: la proposta non è più in attesa di risposte'; end if;
  if v_p.expires_at <= now() then raise exception 'CONFLICT: la proposta è scaduta'; end if;
  if v_p.season_id <> v_season then raise exception 'CONFLICT: la proposta è di una stagione chiusa'; end if;
  if p_answer = 'accept' and not trade_moves_current(v_p.moves, v_season) then
    raise exception 'CONFLICT: un giocatore o una pick dello scambio è cambiato, la proposta va rifatta';
  end if;

  begin
    insert into trade_proposal_answers (proposal_id, team_id, user_id, answer, note)
    values (p_id, v_team, auth.uid(), p_answer, nullif(trim(p_note), ''));
  exception when unique_violation then
    raise exception 'CONFLICT: la tua squadra ha già risposto';
  end;
  insert into trade_proposal_events (proposal_id, kind, team_id, user_id, note)
  values (p_id, case p_answer when 'accept' then 'accepted' else 'rejected' end, v_team, auth.uid(), nullif(trim(p_note), ''));

  if p_answer = 'reject' then
    update trade_proposals set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = p_id returning * into v_p;
  else
    select count(*) into v_accepts from trade_proposal_answers where proposal_id = p_id and answer = 'accept';
    if v_accepts >= cardinality(v_p.teams) - 1 then
      update trade_proposals set status = 'accepted' where id = p_id returning * into v_p;
    else
      -- La versione cambia anche con un'accettazione parziale: chi guarda la proposta vede che qualcosa è successo.
      update trade_proposals set version = version where id = p_id returning * into v_p;
    end if;
  end if;
  return v_p.version;
end $$;

-- Ritiro, solo dalla squadra che ha proposto e prima dell'approvazione.
create function trade_withdraw(p_id int, p_version int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := my_team_id();
  v_p trade_proposals;
begin
  if auth.uid() is null or v_team is null then raise exception 'FORBIDDEN: serve un account collegato a una squadra'; end if;
  select * into v_p from trade_proposals where id = p_id;
  if not found or not (v_team = any(v_p.teams)) then raise exception 'FORBIDDEN: proposta non disponibile'; end if;
  if v_p.proposer_team_id <> v_team then raise exception 'FORBIDDEN: può ritirarla solo la squadra che l''ha proposta'; end if;
  return (trade_proposal_close(p_id, p_version, 'withdrawn', v_team, null)).version;
end $$;

-- Scadenza: marca `expired` le proposte in attesa oltre `expires_at` (l'evento porta l'ora della scadenza). Segreto del job
-- (cron giornaliero, come le dunkest_sync_*) o un admin con sessione.
create function trade_proposals_expire(p_secret text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  with e as (
    update trade_proposals set status = 'expired', decided_at = expires_at
    where status = 'pending' and expires_at <= now()
    returning id, expires_at)
  insert into trade_proposal_events (proposal_id, at, kind) select id, expires_at, 'expired' from e;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function trade_propose(uuid[], jsonb, jsonb, text, text, int) from public, anon;
revoke all on function trade_answer(int, int, text, text) from public, anon;
revoke all on function trade_withdraw(int, int) from public, anon;
revoke all on function trade_proposals_expire(text) from public;
grant execute on function trade_propose(uuid[], jsonb, jsonb, text, text, int) to authenticated;
grant execute on function trade_answer(int, int, text, text) to authenticated;
grant execute on function trade_withdraw(int, int) to authenticated;
grant execute on function trade_proposals_expire(text) to anon, authenticated;

-- ---------- RPC admin ----------
-- Approva ed esegue. p_roster_revs: revisioni lette dall'action che ha appena rivalutato lo scambio con `evaluateTrade`
-- (possono essere più recenti di quelle dell'invio: contano le versioni di contratti e pick).
create function admin_approve_trade_proposal(
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
  update trade_proposals set trade_id = v_trade where id = p_id;
  insert into trade_proposal_events (proposal_id, kind, user_id, note)
  values (p_id, 'approved', auth.uid(), nullif(trim(p_override_reason), ''));
  perform audit_write('trade_proposal', 'trade_proposals', p_id::text, jsonb_build_object('status', v_p.status),
    jsonb_build_object('status', 'approved', 'trade_id', v_trade,
      'summary', format('Proposta di scambio n. %s approvata ed eseguita (scambio n. %s)', p_id, v_trade)));
  return v_trade;
end $$;

-- Respinta dall'admin, con motivo obbligatorio.
create function admin_decline_trade_proposal(p_id int, p_version int, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_p trade_proposals;
begin
  perform admin_guard();
  if nullif(trim(p_note), '') is null then raise exception 'INVALID: serve il motivo'; end if;
  v_p := trade_proposal_close(p_id, p_version, 'declined', null, p_note);
  perform audit_write('trade_proposal', 'trade_proposals', p_id::text, null,
    jsonb_build_object('status', 'declined', 'summary', format('Proposta di scambio n. %s respinta: %s', p_id, trim(p_note))));
  return v_p.version;
end $$;

-- Rimandata alle squadre (rose o versioni cambiate dopo l'accettazione): `superseded`, il proponente riparte dalla bozza.
create function admin_return_trade_proposal(p_id int, p_version int, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_p trade_proposals;
begin
  perform admin_guard();
  v_p := trade_proposal_close(p_id, p_version, 'superseded', null, coalesce(nullif(trim(p_note), ''), 'Rimandata alle squadre'));
  perform audit_write('trade_proposal', 'trade_proposals', p_id::text, null,
    jsonb_build_object('status', 'superseded', 'summary', format('Proposta di scambio n. %s rimandata alle squadre', p_id)));
  return v_p.version;
end $$;

-- «Fatto su Dunkest»: chiude il ciclo di una proposta approvata. Ripeterlo non cambia nulla.
create function admin_mark_dunkest_done(p_id int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_p trade_proposals;
begin
  perform admin_guard();
  if p_id is null then raise exception 'INVALID: proposta mancante'; end if;
  select * into v_p from trade_proposals where id = p_id for update;
  if not found then raise exception 'CONFLICT: la proposta non esiste più'; end if;
  if v_p.status <> 'approved' then raise exception 'INVALID: la proposta non è stata approvata'; end if;
  if v_p.dunkest_done_at is not null then return v_p.version; end if;
  update trade_proposals set dunkest_done_at = now() where id = p_id returning * into v_p;
  insert into trade_proposal_events (proposal_id, kind, user_id) values (p_id, 'dunkest_done', auth.uid());
  perform audit_write('trade_proposal', 'trade_proposals', p_id::text, null,
    jsonb_build_object('dunkest_done_at', v_p.dunkest_done_at, 'summary', format('Scambio della proposta n. %s registrato su Dunkest', p_id)));
  return v_p.version;
end $$;

-- Chiudere il mercato ritira le proposte non ancora approvate (decisione dell'utente 2026-10-29).
create or replace function admin_set_trade_market(p_open boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_season seasons;
  v_withdrawn int := 0;
begin
  perform admin_guard();
  if p_open is null then raise exception 'INVALID: stato del mercato mancante'; end if;
  -- `for update`: la chiusura stagione (che prende la stagione `for update`) e questo cambio non si sovrappongono, e le
  -- proposte in corso di invio o risposta (stagione `for share`) finiscono prima.
  select * into v_season from seasons where is_current for update;
  if not found then raise exception 'INVALID: nessuna stagione corrente'; end if;
  if v_season.trade_market_open = p_open then return p_open; end if;

  update seasons set trade_market_open = p_open where id = v_season.id;
  if not p_open then
    with w as (
      update trade_proposals
      set status = 'withdrawn', decided_at = now(), decided_by = auth.uid(), decision_note = 'Mercato chiuso'
      where status = 'accepted' or (status = 'pending' and expires_at > now())
      returning id)
    insert into trade_proposal_events (proposal_id, kind, user_id, note) select id, 'withdrawn', auth.uid(), 'Mercato chiuso' from w;
    get diagnostics v_withdrawn = row_count;
  end if;
  perform audit_write('market', 'seasons', v_season.id::text,
    jsonb_build_object('trade_market_open', v_season.trade_market_open),
    jsonb_build_object('trade_market_open', p_open,
      'summary', format('Mercato degli scambi %s (stagione %s)%s', case when p_open then 'aperto' else 'chiuso' end, v_season.year,
        case when v_withdrawn > 0 then format(' · %s proposte ritirate', v_withdrawn) else '' end)));
  return p_open;
end $$;

revoke all on function admin_approve_trade_proposal(int, int, text, text, jsonb) from public, anon;
revoke all on function admin_decline_trade_proposal(int, int, text) from public, anon;
revoke all on function admin_return_trade_proposal(int, int, text) from public, anon;
revoke all on function admin_mark_dunkest_done(int) from public, anon;
grant execute on function admin_approve_trade_proposal(int, int, text, text, jsonb) to authenticated;
grant execute on function admin_decline_trade_proposal(int, int, text) to authenticated;
grant execute on function admin_return_trade_proposal(int, int, text) to authenticated;
grant execute on function admin_mark_dunkest_done(int) to authenticated;
