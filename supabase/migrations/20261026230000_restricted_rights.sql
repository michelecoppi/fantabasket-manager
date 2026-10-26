-- P2-04 / R-24: il diritto di pareggio (last_contracts.restricted) si consuma alla firma successiva.
--
-- Regola (confermata dall'utente, vedi docs/OPEN-QUESTIONS.md): quando un giocatore con diritto restricted aperto firma un nuovo
-- contratto (qualunque squadra, firma normale o asta dei tagliati), il contratto è unrestricted (niente due prelazioni consecutive)
-- e il diritto vecchio non esiste più. Lo fa un trigger su `contracts`, quindi nella stessa transazione di admin_sign_contract,
-- admin_award_cut e di ogni altro inserimento, senza toccare le RPC.
--
-- Il consumo lascia la riga (serve a R-25: stipendio e data) con restricted = false e ne registra l'esito.

alter table last_contracts
  -- deferrable: il trigger BEFORE INSERT scrive l'id prima che la riga di contracts esista (l'id arriva dal default).
  add column consumed_by_contract_id int references contracts(id) on delete set null deferrable initially deferred,
  add column consumed_at timestamptz;

create function consume_restricted_right() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_right last_contracts%rowtype;
begin
  -- Conta l'ultima riga del giocatore (stessa regola di loadPlayers): se è restricted, il diritto è aperto.
  select * into v_right from last_contracts where player_id = new.player_id order by last_contract_on desc, id desc limit 1 for update;
  if not found or not v_right.restricted then
    return new;
  end if;

  new.restriction := 'unrestricted';
  update last_contracts set restricted = false, consumed_at = now(), consumed_by_contract_id = new.id where id = v_right.id;
  return new;
end $$;

create trigger contracts_consume_right before insert on contracts for each row execute function consume_restricted_right();

revoke all on function consume_restricted_right() from public, anon, authenticated;

-- Arretrato: chi ha già un contratto nella stagione corrente non può avere un diritto ancora aperto. Si consumano le righe
-- rimaste restricted; i contratti non si toccano (se uno doveva essere unrestricted lo dice la query di controllo in PLAN.md).
update last_contracts l
set restricted = false, consumed_at = now()
from contracts c
join seasons s on s.id = c.season_id and s.is_current
where c.player_id = l.player_id
  and l.restricted
  and l.id = (select id from last_contracts x where x.player_id = l.player_id order by x.last_contract_on desc, x.id desc limit 1);
