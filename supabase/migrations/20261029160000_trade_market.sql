-- Mercato degli scambi aperto o chiuso (Fase 7.1, docs/product/PIANO-PROPOSTE-SCAMBIO.md). Decisione dell'utente
-- (2026-10-29): lo apre e lo chiude un admin dall'interfaccia, il regolamento non fissa finestre (R-55: «dopo l'asta estiva»).
-- È uno stato della stagione, non una regola di lega, quindi sta in `seasons` e non in `league_settings`. Vale per le proposte
-- di scambio tra squadre (7.2): gli admin registrano scambi da /admin/scambio anche a mercato chiuso (R-55, il moderatore
-- ufficializza). Una stagione nuova parte chiusa.

alter table seasons add column trade_market_open boolean not null default false;

create function admin_set_trade_market(p_open boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_season seasons;
begin
  perform admin_guard();
  if p_open is null then raise exception 'INVALID: stato del mercato mancante'; end if;
  -- `for update`: la chiusura stagione (che prende la stagione `for update`) e questo cambio non si sovrappongono.
  select * into v_season from seasons where is_current for update;
  if not found then raise exception 'INVALID: nessuna stagione corrente'; end if;
  if v_season.trade_market_open = p_open then return p_open; end if;

  update seasons set trade_market_open = p_open where id = v_season.id;
  perform audit_write('market', 'seasons', v_season.id::text,
    jsonb_build_object('trade_market_open', v_season.trade_market_open),
    jsonb_build_object('trade_market_open', p_open,
      'summary', format('Mercato degli scambi %s (stagione %s)', case when p_open then 'aperto' else 'chiuso' end, v_season.year)));
  return p_open;
end $$;

revoke all on function admin_set_trade_market(boolean) from public, anon;
grant execute on function admin_set_trade_market(boolean) to authenticated;
