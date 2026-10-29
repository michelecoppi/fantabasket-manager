-- Bot Telegram (Fase 7.5): annuncia sul canale della lega gli scambi eseguiti. Decisione dell'utente (2026-10-29): sul canale
-- vanno solo gli scambi eseguiti, le proposte restano private. `trades` fa da coda: `announced_at` vuoto = da annunciare.
-- Lo invia l'app (subito dopo l'esecuzione, e il cron giornaliero come rete) con le due RPC qui sotto: segreto del job o
-- sessione admin, come le dunkest_sync_*. Le regole di lega non c'entrano: qui si legge e si segna, niente altro.

alter table trades
  add column announced_at timestamptz,
  -- presa in carico da un invio in corso: esclude gli altri invii per 5 minuti (doppio messaggio se action e cron si incrociano)
  add column announce_claimed_at timestamptz;

-- Gli scambi di prima del bot non si annunciano.
update trades set announced_at = created_at where announced_at is null;
create index trades_to_announce on trades (id) where announced_at is null;

-- Prende gli scambi eseguiti da annunciare, non più vecchi di `p_max_age_hours` (un canale configurato tardi non riceve
-- l'arretrato), e li restituisce già leggibili: nomi delle squadre (con quanti scambi hanno fatto in stagione fino a questo),
-- giocatori con ruolo e stipendio, pick con anno, giro e squadra d'origine.
create function trade_announce_claim(p_secret text, p_max_age_hours int) returns jsonb
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
        select jsonb_agg(m.value || case
            when m.value ->> 'kind' = 'contract' then coalesce((
              select jsonb_build_object(
                'name', case when p.first_name <> '' then p.first_name || ' ' || p.last_name else p.last_name end,
                'pos', p.pos,
                'salary', k.salary)
              from contracts k join players p on p.id = k.player_id
              where k.id = (m.value ->> 'id')::int), '{}'::jsonb)
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

-- Esito dell'invio: annunciato, oppure presa liberata per riprovare al giro dopo.
create function trade_announce_done(p_secret text, p_id int, p_ok boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  if p_ok then
    update trades set announced_at = now(), announce_claimed_at = null where id = p_id and announced_at is null;
  else
    update trades set announce_claimed_at = null where id = p_id and announced_at is null;
  end if;
  return found;
end $$;

revoke all on function trade_announce_claim(text, int) from public;
revoke all on function trade_announce_done(text, int, boolean) from public;
grant execute on function trade_announce_claim(text, int) to anon, authenticated;
grant execute on function trade_announce_done(text, int, boolean) to anon, authenticated;
