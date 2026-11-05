-- Notifiche push dell'app installata (Web Push, docs/product/PIANO-NOTIFICHE-PUSH.md). Chi ha attivato le notifiche dalla pagina
-- Account riceve un avviso sul telefono quando c'è una novità su una proposta di scambio che lo riguarda (nuova proposta,
-- risposta, ritiro, approvazione...) e, se è admin, quando una proposta aspetta la sua approvazione.
--
-- Decisione dell'utente (2026-11-05): notifiche push vere, non solo il badge in app né un messaggio privato su Telegram.
--
-- Nuova scrittura dei viewer (dopo `trade_*`, `slot_swap_*` e `draft_lottery_seen`): ognuno registra e toglie i propri
-- dispositivi (`push_subscribe` / `push_unsubscribe`). Nessuna policy di scrittura sulla tabella: si scrive solo con le RPC, che
-- agiscono sempre e solo sull'utente di chi chiama (`auth.uid()`). L'iscrizione non dà accesso ad altro: un indirizzo di notifica
-- da solo non basta a spedire (serve la chiave privata VAPID, che sta solo su Vercel).
--
-- Cosa notificare lo decide il sito (`src/lib/push-notify.ts`, puro e testato) a partire dal registro delle proposte
-- (`trade_proposal_events`, già scritto da tutte le RPC `trade_*` e `admin_*`): nessuna RPC esistente cambia. La coda è la colonna
-- `push_at` dell'evento, come `notified_at` per i rumors di Telegram: la presa segna subito l'ora (niente doppi avvisi), un invio
-- fallito non si riprova (un avviso in ritardo di ore non serve; lo stato vero resta nel badge e nelle pagine).
-- Chi legge le iscrizioni altrui per spedire è solo il job (segreto, come le `dunkest_sync_*`) o un admin: `push_claim` e
-- `push_prune`. Le action dei proprietari passano il segreto del job, che sta solo sul server.

-- ---------- Iscrizioni ----------
create table push_subscriptions (
  id bigserial primary key,
  user_id uuid not null references profiles on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  -- ultima volta che il dispositivo si è registrato (il più vecchio salta oltre i 10 per utente)
  seen_at timestamptz not null default now()
);
create index push_subscriptions_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;
create policy "read own" on push_subscriptions for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on push_subscriptions from anon, authenticated;

-- ---------- Coda: eventi già presi in carico ----------
alter table trade_proposal_events add column push_at timestamptz;
-- Niente arretrato: gli eventi di prima di questa migrazione non si notificano mai.
update trade_proposal_events set push_at = now();

-- ---------- RPC dei proprietari ----------
create function push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'FORBIDDEN: serve un account della lega';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://[^[:space:]]+$' or char_length(p_endpoint) > 2048 then
    raise exception 'INVALID: indirizzo di notifica non valido';
  end if;
  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{60,120}$' or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{12,60}$' then
    raise exception 'INVALID: chiavi di notifica non valide';
  end if;
  -- Lo stesso dispositivo che entra con un altro account passa a quell'account.
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, seen_at)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300), clock_timestamp())
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, seen_at = excluded.seen_at;
  -- Al massimo 10 dispositivi a testa: restano i più recenti.
  delete from push_subscriptions
  where user_id = auth.uid()
    and id not in (select id from push_subscriptions where user_id = auth.uid() order by seen_at desc, id desc limit 10);
end $$;

create function push_unsubscribe(p_endpoint text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN: serve un account della lega'; end if;
  delete from push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

-- ---------- RPC del job ----------
-- Prende in carico gli eventi non ancora notificati (non più vecchi di p_max_age_hours) e li restituisce insieme alle iscrizioni
-- di tutti: { events: [...], subs: [...] }. Chi riceve cosa lo decide il sito. `completes`: l'accettazione che ha portato la
-- proposta alla coda dell'admin (ancora `accepted`, ultima accettazione del registro). Segreto del job o admin con sessione.
create function push_claim(p_secret text, p_max_age_hours int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_events jsonb;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  if p_max_age_hours is null or p_max_age_hours < 1 then raise exception 'INVALID: età massima non valida'; end if;

  with marked as (
    update trade_proposal_events e set push_at = now()
    where e.push_at is null and e.at > now() - make_interval(hours => p_max_age_hours)
    returning e.id, e.proposal_id, e.kind, e.team_id, e.user_id, e.note)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'kind', m.kind,
      'note', m.note,
      'proposal_id', m.proposal_id,
      'actor', m.user_id,
      'team_id', m.team_id,
      'proposer', p.proposer_team_id,
      'counter', p.parent_id is not null,
      'expires_at', p.expires_at,
      'completes', m.kind = 'accepted' and p.status = 'accepted'
        and m.id = (select max(e2.id) from trade_proposal_events e2 where e2.proposal_id = p.id and e2.kind = 'accepted'),
      'teams', (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by o.ord)
                from unnest(p.teams) with ordinality o(id, ord) join teams t on t.id = o.id))
    order by m.id), '[]'::jsonb)
  into v_events
  from marked m
  join trade_proposals p on p.id = m.proposal_id
  where m.kind in ('sent', 'accepted', 'rejected', 'withdrawn', 'superseded', 'approved', 'declined');

  return jsonb_build_object(
    'events', v_events,
    'subs', case when jsonb_array_length(v_events) = 0 then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', s.user_id, 'team_id', pr.team_id, 'admin', pr.role = 'admin',
        'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth) order by s.id)
      from push_subscriptions s join profiles pr on pr.id = s.user_id), '[]'::jsonb) end);
end $$;

-- Toglie gli indirizzi che il servizio di notifica ha dichiarato scaduti (404/410).
create function push_prune(p_secret text, p_endpoints text[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  delete from push_subscriptions where endpoint = any(p_endpoints);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function push_subscribe(text, text, text, text) from public, anon;
revoke all on function push_unsubscribe(text) from public, anon;
revoke all on function push_claim(text, int) from public;
revoke all on function push_prune(text, text[]) from public;
grant execute on function push_subscribe(text, text, text, text) to authenticated;
grant execute on function push_unsubscribe(text) to authenticated;
-- Il cron chiama con la chiave anon e il segreto, senza sessione.
grant execute on function push_claim(text, int) to anon, authenticated;
grant execute on function push_prune(text, text[]) to anon, authenticated;
