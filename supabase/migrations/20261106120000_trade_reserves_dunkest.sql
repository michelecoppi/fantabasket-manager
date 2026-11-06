-- Scambi di sole riserve: niente da rifare su Dunkest (decisione dell'utente del 2026-11-06).
-- Su Dunkest ci sono solo i titolari. La 20261030160000 segnava subito «fatta su Dunkest» solo le proposte senza contratti;
-- ora basta che nessun giocatore a contratto sia titolare prima dello scambio o ci arrivi (slot di arrivo `starter`).
-- Lo slot di partenza si legge prima di `trade_apply`, che lo cambia. Un contratto che non si trova conta come titolare.
-- Stessa regola in TypeScript: `needsDunkest` in src/lib/trade-draft.ts (avvisi della UI e messaggi delle action).
--
-- Compatibile all'indietro: firma invariata (`create or replace`), i grant restano.

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

  -- Su Dunkest ci sono solo i titolari: si guarda prima dello scambio, con gli slot di adesso.
  v_no_dunkest := not exists (
    select 1 from jsonb_array_elements(v_p.moves) m
    where m ->> 'kind' = 'contract'
      and (m ->> 'slot' = 'starter'
        or coalesce((select c.slot::text from contracts c where c.id = (m ->> 'id')::int), 'starter') = 'starter'));

  -- Prima `approved`, così trade_apply non la marca superata insieme alle altre.
  update trade_proposals set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = p_id;
  v_trade := trade_apply(v_p.teams, v_p.moves, p_approved_by, p_override_reason, v_revs);
  update trade_proposals set trade_id = v_trade, dunkest_done_at = case when v_no_dunkest then now() end where id = p_id;
  insert into trade_proposal_events (proposal_id, kind, user_id, note)
  values (p_id, 'approved', auth.uid(), nullif(trim(p_override_reason), ''));
  if v_no_dunkest then
    insert into trade_proposal_events (proposal_id, kind, user_id, note)
    values (p_id, 'dunkest_done', auth.uid(), 'Nessun titolare coinvolto: niente da fare su Dunkest');
  end if;
  perform audit_write('trade_proposal', 'trade_proposals', p_id::text, jsonb_build_object('status', v_p.status),
    jsonb_build_object('status', 'approved', 'trade_id', v_trade,
      'summary', format('Proposta di scambio n. %s approvata ed eseguita (scambio n. %s)', p_id, v_trade)));
  return v_trade;
end $$;
