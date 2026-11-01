-- Bot Telegram: «rumors di trade». Quando tutte le squadre di una proposta hanno accettato e manca solo l'approvazione dell'admin
-- (`trade_proposals.status = 'accepted'`), il bot scrive sul canale della lega che c'è un rumor: solo i nomi delle squadre, niente
-- giocatori né pick (le proposte restano private, decisione del 2026-10-29). Serve a due cose: gli admin capiscono che c'è una
-- richiesta da approvare, e nel gruppo sale l'hype.
-- La coda è `trade_proposal_events.notified_at` (campo previsto per il bot e mai usato): l'evento `accepted` con `notified_at` vuoto
-- di una proposta ancora `accepted` è un rumor da dare. Nessuna colonna nuova su `trade_proposals`, così l'invio non ne cambia la
-- versione mentre l'admin la sta guardando. Un rumor è a prova di doppio invio (la presa segna subito l'ora), non di perdita: se
-- l'invio fallisce la presa si libera, se il processo muore a metà il rumor si perde, e va bene (il vero annuncio è quello dello scambio).
-- Chi chiama: il job (segreto), un admin, oppure il proprietario di una squadra della proposta (la action subito dopo la sua
-- risposta). Le regole di lega non c'entrano: qui si legge e si segna.

create function trade_rumor_claim(p_secret text, p_max_age_hours int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_all boolean := dunkest_sync_allowed(p_secret);
  v_team uuid := my_team_id();
  v jsonb;
begin
  if not v_all and v_team is null then raise exception 'FORBIDDEN: serve il segreto del job o un account di squadra'; end if;
  if p_max_age_hours is null or p_max_age_hours < 1 then raise exception 'INVALID: età massima non valida'; end if;
  with due as (
    select distinct p.id
    from trade_proposals p
    join trade_proposal_events e on e.proposal_id = p.id and e.kind = 'accepted' and e.notified_at is null
    where p.status = 'accepted'
      and e.at > now() - make_interval(hours => p_max_age_hours)
      and (v_all or v_team = any(p.teams))),
  marked as (
    update trade_proposal_events e set notified_at = now()
    where e.kind = 'accepted' and e.notified_at is null and e.proposal_id in (select id from due)
    returning e.proposal_id)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'teams', (select jsonb_agg(t.name order by o.ord)
                from unnest(p.teams) with ordinality o(id, ord) join teams t on t.id = o.id))
    order by p.id), '[]'::jsonb)
  into v
  from trade_proposals p
  where p.id in (select proposal_id from marked);
  return v;
end $$;

-- Esito dell'invio: se non è andato, la presa si libera (solo quella appena fatta) e si riprova al giro dopo.
create function trade_rumor_done(p_secret text, p_id int, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid := my_team_id();
begin
  if not dunkest_sync_allowed(p_secret) and not (
    v_team is not null and exists (select 1 from trade_proposals p where p.id = p_id and v_team = any(p.teams))
  ) then raise exception 'FORBIDDEN: serve il segreto del job o un account di squadra'; end if;
  if not p_ok then
    update trade_proposal_events set notified_at = null
    where proposal_id = p_id and kind = 'accepted' and notified_at > now() - interval '5 minutes';
  end if;
end $$;

revoke all on function trade_rumor_claim(text, int) from public;
revoke all on function trade_rumor_done(text, int, boolean) from public;
grant execute on function trade_rumor_claim(text, int) to anon, authenticated;
grant execute on function trade_rumor_done(text, int, boolean) to anon, authenticated;
