-- Cambi titolari ↔ riserve chiesti dai proprietari (R-04, docs/product/PIANO-CAMBI-RISERVE.md). Il proprietario chiede dalla
-- pagina della sua squadra di spostare giocatori tra titolari e riserve; un admin fa il cambio su Dunkest, poi lo approva qui e
-- la rosa cambia nella stessa transazione; il bot lo annuncia sul canale della lega.
--
-- Decisioni dell'utente (2026-11-03):
--  * la «data prestabilita» di R-04 è una finestra che un admin apre e chiude (`seasons.slot_swap_open`, come il mercato degli
--    scambi); chiuderla ritira le richieste in attesa;
--  * gli admin vedono le richieste solo dal badge in app, nessun messaggio alla richiesta;
--  * una richiesta in attesa per squadra.
--
-- Nuova scrittura dei viewer (dopo `trade_*` e `draft_lottery_seen`): nessuna policy di scrittura sulla tabella, si scrive solo
-- con le RPC qui sotto, che controllano la squadra di chi chiama (`my_team_id()`). Le regole di lega (ruolo per ruolo, budget
-- riserve, cap con la luxury tax) stanno in `src/lib/cap.ts` (`evaluateSlotSwap`), controllate dall'action all'invio e di nuovo
-- all'approvazione: qui solo coerenza (chi sei, quale squadra, finestra aperta, versioni dei contratti).
--
-- Ordine dei lock, uguale ovunque (20261026220000_roster_locks.sql): stagione -> squadra -> richiesta -> contratti.

alter table seasons add column slot_swap_open boolean not null default false;

create table slot_swap_requests (
  id serial primary key,
  season_id int not null references seasons,
  team_id uuid not null references teams,
  requested_by uuid references profiles on delete set null,
  -- stesso formato di admin_swap_slots: [{ id, version, slot, label? }], slot = dove va il giocatore
  items jsonb not null,
  -- revisione della rosa all'invio (per lo storico: all'approvazione contano le versioni dei contratti)
  roster_rev int not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references profiles on delete set null,
  decision_note text,
  -- coda del bot, come `trades`: approvata e `announced_at` vuoto = da annunciare
  announced_at timestamptz,
  announce_claimed_at timestamptz,
  version int not null default 1
);
create unique index slot_swap_requests_one_pending on slot_swap_requests (team_id) where status = 'pending';
create index slot_swap_requests_season on slot_swap_requests (season_id);
create index slot_swap_requests_to_announce on slot_swap_requests (id) where status = 'approved' and announced_at is null;
create trigger slot_swap_requests_bump_version before update on slot_swap_requests for each row execute function bump_version();

alter table slot_swap_requests enable row level security;
create policy "read own team" on slot_swap_requests for select to authenticated using (is_admin() or team_id = my_team_id());
revoke insert, update, delete on slot_swap_requests from anon, authenticated;

-- ---------- Helper interni (mai chiamabili dai client) ----------
-- Forma della richiesta e contratti ancora della squadra, alla stessa versione e in un altro slot (senza lock: per l'invio).
create function slot_swap_items_check(p_team_id uuid, p_season int, p_items jsonb) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_item jsonb;
  v_c contracts;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID: nessun giocatore da spostare';
  end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'INVALID: troppi giocatori'; end if;
  if (select count(distinct i ->> 'id') from jsonb_array_elements(p_items) i) <> jsonb_array_length(p_items) then
    raise exception 'INVALID: un giocatore compare due volte';
  end if;
  for v_item in select jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) <> 'object' or (v_item ->> 'id') is null or (v_item ->> 'version') is null then
      raise exception 'INVALID: versione mancante';
    end if;
    if coalesce(v_item ->> 'slot', '') not in ('starter', 'reserve') then raise exception 'INVALID: slot non valido'; end if;
    if char_length(v_item ->> 'label') > 200 then raise exception 'INVALID: etichetta troppo lunga'; end if;
    select * into v_c from contracts where id = (v_item ->> 'id')::int;
    if not found or v_c.team_id is distinct from p_team_id or v_c.season_id is distinct from p_season
       or v_c.version is distinct from (v_item ->> 'version')::int then
      raise exception 'CONFLICT: un giocatore della richiesta è cambiato (scambiato, tagliato o modificato)';
    end if;
    if v_c.slot = 'talent' then raise exception 'INVALID: la squadra talenti non entra nei cambi'; end if;
    if v_c.slot::text = v_item ->> 'slot' then raise exception 'INVALID: un giocatore è già in quello slot'; end if;
  end loop;
end $$;

-- Sposta i contratti di una squadra (già bloccata dal chiamante), con versione per contratto e una riga di audit ciascuno.
-- Comune ad admin_swap_slots e admin_approve_slot_swap, così le due strade non divergono. Restituisce quanti ne ha cambiati.
create function slots_apply(p_team_id uuid, p_season int, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_old contracts;
  v_n int := 0;
  v_player text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'INVALID: nessun contratto da spostare'; end if;
  for v_item in select jsonb_array_elements(p_items) loop
    if (v_item ->> 'version') is null then raise exception 'INVALID: versione mancante'; end if;
    if (v_item ->> 'slot') not in ('starter', 'reserve') then raise exception 'INVALID: slot non valido'; end if;
    select * into v_old from contracts where id = (v_item ->> 'id')::int for update;
    if not found or v_old.team_id is distinct from p_team_id or v_old.season_id is distinct from p_season then
      raise exception 'CONFLICT: un contratto non è più di questa squadra (tagliato o scambiato da un altro admin?)';
    end if;
    if v_old.version is distinct from (v_item ->> 'version')::int then raise exception 'CONFLICT: un contratto è stato modificato da un altro admin'; end if;
    if v_old.slot = 'talent' then raise exception 'INVALID: la squadra talenti non entra nei cambi'; end if;
    if v_old.slot::text = v_item ->> 'slot' then continue; end if;
    update contracts set slot = (v_item ->> 'slot')::roster_slot where id = v_old.id;
    v_n := v_n + 1;
    select trim(first_name || ' ' || last_name) into v_player from players where id = v_old.player_id;
    perform audit_write('update', 'contracts', v_old.id::text,
      jsonb_build_object('slot', v_old.slot),
      jsonb_build_object('slot', v_item ->> 'slot', 'summary', format('%s: %s', v_player, case when v_item ->> 'slot' = 'starter' then 'da riserva a titolare' else 'da titolare a riserva' end)));
  end loop;
  return v_n;
end $$;

revoke all on function slot_swap_items_check(uuid, int, jsonb) from public, anon, authenticated;
revoke all on function slots_apply(uuid, int, jsonb) from public, anon, authenticated;

-- ---------- admin_swap_slots: stessa firma e stesso comportamento, ora passa dall'helper comune ----------
create or replace function admin_swap_slots(p_team_id uuid, p_roster_rev int, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_n int;
  v_team text;
begin
  perform admin_guard();
  if p_team_id is null or p_roster_rev is null then raise exception 'INVALID: squadra o revisione della rosa mancante'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then raise exception 'INVALID: nessun contratto da spostare'; end if;
  v_season := lock_current_season();
  perform roster_lock(jsonb_build_object(p_team_id::text, p_roster_rev));
  v_n := slots_apply(p_team_id, v_season, p_items);
  if v_n = 0 then raise exception 'INVALID: titolari e riserve sono già così'; end if;
  select name into v_team from teams where id = p_team_id;
  perform audit_write('update', 'contracts', null, null, jsonb_build_object('summary', format('Titolari e riserve di %s allineati a Dunkest (%s contratti)', v_team, v_n)));
  return v_n;
end $$;

-- ---------- Finestra dei cambi (admin) ----------
create function admin_set_slot_swap_window(p_open boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_season seasons;
  v_n int;
begin
  perform admin_guard();
  if p_open is null then raise exception 'INVALID: stato della finestra mancante'; end if;
  -- `for update`: la chiusura stagione e le richieste in corso (che prendono la stagione `for share`) non si sovrappongono.
  select * into v_season from seasons where is_current for update;
  if not found then raise exception 'INVALID: nessuna stagione corrente'; end if;
  if v_season.slot_swap_open = p_open then return p_open; end if;

  update seasons set slot_swap_open = p_open where id = v_season.id;
  v_n := 0;
  if not p_open then
    update slot_swap_requests set status = 'withdrawn', decided_at = now(), decided_by = auth.uid(), decision_note = 'Finestra dei cambi chiusa'
    where season_id = v_season.id and status = 'pending';
    get diagnostics v_n = row_count;
  end if;
  perform audit_write('slot_swap', 'seasons', v_season.id::text,
    jsonb_build_object('slot_swap_open', v_season.slot_swap_open),
    jsonb_build_object('slot_swap_open', p_open,
      'summary', format('Cambi titolari/riserve %s (stagione %s)%s', case when p_open then 'aperti' else 'chiusi' end, v_season.year,
        case when v_n > 0 then format(', %s richieste ritirate', v_n) else '' end)));
  return p_open;
end $$;

-- ---------- RPC della squadra ----------
-- Invio. p_items: [{id, version, slot, label?}] con lo slot di arrivo; la action ha già controllato le regole (evaluateSlotSwap).
create function slot_swap_request(p_team_id uuid, p_roster_rev int, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := my_team_id();
  v_season int;
  v_id int;
begin
  if auth.uid() is null or v_team is null then raise exception 'FORBIDDEN: serve un account collegato a una squadra'; end if;
  if p_team_id is distinct from v_team then raise exception 'FORBIDDEN: puoi chiedere cambi solo per la tua squadra'; end if;
  if p_roster_rev is null then raise exception 'INVALID: revisione della rosa mancante'; end if;

  v_season := lock_current_season();
  if not (select slot_swap_open from seasons where id = v_season) then raise exception 'INVALID: i cambi tra titolari e riserve sono chiusi'; end if;
  if (select roster_rev from teams where id = v_team) is distinct from p_roster_rev then raise exception 'CONFLICT: la rosa della squadra è cambiata'; end if;
  perform slot_swap_items_check(v_team, v_season, p_items);

  begin
    insert into slot_swap_requests (season_id, team_id, requested_by, items, roster_rev)
    values (v_season, v_team, auth.uid(), p_items, p_roster_rev)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'INVALID: la tua squadra ha già una richiesta in attesa: ritirala per mandarne un''altra';
  end;
  return v_id;
end $$;

-- Ritiro, dalla squadra che l'ha chiesta e prima della decisione dell'admin.
create function slot_swap_withdraw(p_id int, p_version int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := my_team_id();
  v_r slot_swap_requests;
begin
  if auth.uid() is null or v_team is null then raise exception 'FORBIDDEN: serve un account collegato a una squadra'; end if;
  if p_version is null then raise exception 'INVALID: versione mancante'; end if;
  select * into v_r from slot_swap_requests where id = p_id for update;
  if not found or v_r.team_id <> v_team then raise exception 'FORBIDDEN: richiesta non disponibile'; end if;
  if v_r.version is distinct from p_version then raise exception 'CONFLICT: la richiesta è cambiata nel frattempo'; end if;
  if v_r.status <> 'pending' then raise exception 'CONFLICT: la richiesta è già stata decisa o ritirata'; end if;
  update slot_swap_requests set status = 'withdrawn', decided_at = now(), decided_by = auth.uid() where id = p_id returning * into v_r;
  return v_r.version;
end $$;

revoke all on function slot_swap_request(uuid, int, jsonb) from public, anon;
revoke all on function slot_swap_withdraw(int, int) from public, anon;
grant execute on function slot_swap_request(uuid, int, jsonb) to authenticated;
grant execute on function slot_swap_withdraw(int, int) to authenticated;

-- ---------- RPC admin ----------
-- Approva e applica. p_roster_rev: revisione letta dall'action che ha appena rivalutato il cambio con `evaluateSlotSwap` sulla rosa
-- di adesso; i contratti devono essere ancora alla versione dell'invio.
create function admin_approve_slot_swap(p_id int, p_version int, p_roster_rev int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_r slot_swap_requests;
  v_season int;
  v_n int;
  v_team text;
begin
  perform admin_guard();
  if p_id is null or p_version is null or p_roster_rev is null then raise exception 'INVALID: richiesta, versione o revisione della rosa mancante'; end if;
  select * into v_r from slot_swap_requests where id = p_id;
  if not found then raise exception 'CONFLICT: la richiesta non esiste più'; end if;

  v_season := lock_current_season();
  perform roster_lock(jsonb_build_object(v_r.team_id::text, p_roster_rev));
  select * into v_r from slot_swap_requests where id = p_id for update;
  if v_r.version is distinct from p_version then raise exception 'CONFLICT: la richiesta è cambiata nel frattempo'; end if;
  if v_r.status <> 'pending' then raise exception 'CONFLICT: la richiesta è già stata decisa o ritirata'; end if;
  if v_r.season_id <> v_season then raise exception 'CONFLICT: la richiesta è di una stagione chiusa'; end if;

  v_n := slots_apply(v_r.team_id, v_season, v_r.items);
  if v_n <> jsonb_array_length(v_r.items) then raise exception 'CONFLICT: titolari e riserve sono cambiati dopo la richiesta'; end if;
  update slot_swap_requests set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = p_id;
  select name into v_team from teams where id = v_r.team_id;
  perform audit_write('slot_swap', 'slot_swap_requests', p_id::text, jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'approved',
      'summary', format('Cambio titolari/riserve di %s approvato (%s giocatori, richiesta n. %s)', v_team, v_n, p_id)));
  return v_n;
end $$;

-- Respinta, con motivo obbligatorio (lo legge il proprietario).
create function admin_decline_slot_swap(p_id int, p_version int, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_r slot_swap_requests;
  v_team text;
begin
  perform admin_guard();
  if p_id is null or p_version is null then raise exception 'INVALID: richiesta o versione mancante'; end if;
  if nullif(trim(p_note), '') is null then raise exception 'INVALID: scrivi il motivo'; end if;
  if char_length(p_note) > 1000 then raise exception 'INVALID: motivo troppo lungo'; end if;
  select * into v_r from slot_swap_requests where id = p_id for update;
  if not found then raise exception 'CONFLICT: la richiesta non esiste più'; end if;
  if v_r.version is distinct from p_version then raise exception 'CONFLICT: la richiesta è cambiata nel frattempo'; end if;
  if v_r.status <> 'pending' then raise exception 'CONFLICT: la richiesta è già stata decisa o ritirata'; end if;
  update slot_swap_requests set status = 'declined', decided_at = now(), decided_by = auth.uid(), decision_note = trim(p_note)
  where id = p_id returning * into v_r;
  select name into v_team from teams where id = v_r.team_id;
  perform audit_write('slot_swap', 'slot_swap_requests', p_id::text, jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'declined', 'summary', format('Cambio titolari/riserve di %s respinto: %s', v_team, trim(p_note))));
  return v_r.version;
end $$;

revoke all on function admin_set_slot_swap_window(boolean) from public, anon;
revoke all on function admin_approve_slot_swap(int, int, int) from public, anon;
revoke all on function admin_decline_slot_swap(int, int, text) from public, anon;
grant execute on function admin_set_slot_swap_window(boolean) to authenticated;
grant execute on function admin_approve_slot_swap(int, int, int) to authenticated;
grant execute on function admin_decline_slot_swap(int, int, text) to authenticated;

-- ---------- Bot: annuncio dei cambi approvati ----------
-- Come trade_announce_claim: segreto del job o sessione admin; presa di 5 minuti contro i doppi messaggi; i cambi più vecchi di
-- `p_max_age_hours` non si annunciano. Restituisce la squadra e chi sale e chi scende, già leggibili.
create function slot_swap_announce_claim(p_secret text, p_max_age_hours int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  if p_max_age_hours is null or p_max_age_hours < 1 then raise exception 'INVALID: età massima non valida'; end if;
  with c as (
    update slot_swap_requests set announce_claimed_at = now()
    where status = 'approved' and announced_at is null
      and decided_at > now() - make_interval(hours => p_max_age_hours)
      and (announce_claimed_at is null or announce_claimed_at < now() - interval '5 minutes')
    returning *)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'team', t.name,
      'team_id', t.id,
      'season_swaps', (select count(*) from slot_swap_requests x where x.season_id = c.season_id and x.team_id = c.team_id
                         and x.status = 'approved' and x.id <= c.id),
      'items', (
        select jsonb_agg(jsonb_build_object(
            'slot', i.value ->> 'slot',
            'name', coalesce(case when p.first_name <> '' then p.first_name || ' ' || p.last_name else p.last_name end, i.value ->> 'label'),
            'pos', p.pos,
            'salary', k.salary)
          order by i.ord)
        from jsonb_array_elements(c.items) with ordinality i(value, ord)
        left join contracts k on k.id = (i.value ->> 'id')::int
        left join players p on p.id = k.player_id)
    ) order by c.id), '[]'::jsonb)
  into v from c join teams t on t.id = c.team_id;
  return v;
end $$;

-- Esito dell'invio: annunciato, oppure presa liberata per riprovare al giro dopo.
create function slot_swap_announce_done(p_secret text, p_id int, p_ok boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  if p_ok then
    update slot_swap_requests set announced_at = now(), announce_claimed_at = null where id = p_id and announced_at is null;
  else
    update slot_swap_requests set announce_claimed_at = null where id = p_id and announced_at is null;
  end if;
  return found;
end $$;

revoke all on function slot_swap_announce_claim(text, int) from public;
revoke all on function slot_swap_announce_done(text, int, boolean) from public;
grant execute on function slot_swap_announce_claim(text, int) to anon, authenticated;
grant execute on function slot_swap_announce_done(text, int, boolean) to anon, authenticated;
