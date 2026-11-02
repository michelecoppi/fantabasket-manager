-- Sorteggio dell'ordine del draft nell'app (R-32, issue #103). L'admin, con la classifica finale, chiede l'estrazione: il seme
-- casuale nasce qui (mai dal client), l'estrazione si fa qui e si salva una volta sola per stagione, con una riga in audit_log.
-- Chi partecipa e con quanti biglietti lo calcola `src/lib/draft-lottery.ts` dai parametri di lega (come gli altri piani admin);
-- qui si controlla solo che i dati siano coerenti. La stessa procedura è in TypeScript per mostrarla e rifarla nel browser:
-- per ogni scelta, i primi 4 byte di sha256("<seme>:<scelta>") modulo i biglietti delle squadre ancora in gara; chi esce prende
-- la scelta, le altre restano con gli stessi biglietti, l'ultima rimasta prende l'ultima scelta (decisione dell'utente, 2026-11-02).
-- Ogni utente vede la rivelazione animata una volta: lo segna da sé con `draft_lottery_seen`, seconda eccezione alla sola
-- lettura dei viewer dopo le RPC `trade_*` (riguarda solo il proprio flag).

-- ---------- Parametri di lega ----------
-- R-32: biglietti della lottery, dall'ultima della classifica in su (8ª: 4, 7ª: 3, 6ª: 2, 5ª: 1).
insert into league_settings (season_id, key, value)
select s.id, v.key, v.value from seasons s, (values
  ('lottery_weight_1', 4), ('lottery_weight_2', 3), ('lottery_weight_3', 2), ('lottery_weight_4', 1)
) as v(key, value)
on conflict (season_id, key) do nothing;

-- ---------- Tabelle ----------
-- Un sorteggio per stagione: la classifica di `season_id` decide il draft di `draft_year` (= anno della stagione + 1).
create table draft_lotteries (
  season_id int primary key references seasons,
  draft_year int not null,
  ranking uuid[] not null,  -- classifica finale, dal 1° all'ultimo
  entrants uuid[] not null, -- squadre della lottery, dall'ultima della classifica in su
  weights int[] not null,   -- biglietti di ognuna, stesso ordine
  seed text not null,       -- 32 cifre esadecimali casuali, generate dalla RPC
  draws jsonb not null,     -- [{pick, team_id, roll, total}]: roll = biglietto uscito contando da 0, null = ultima rimasta
  drawn_at timestamptz not null default now(),
  drawn_by text not null
);

create table draft_lottery_views ( -- chi ha già visto la rivelazione animata
  season_id int not null references draft_lotteries on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (season_id, user_id)
);

-- Il sorteggio lo leggono tutti; chi ha visto cosa, ognuno per sé (gli admin tutto). Nessuno scrive direttamente, nemmeno gli
-- admin: il sorteggio non si riscrive.
alter table draft_lotteries enable row level security;
alter table draft_lottery_views enable row level security;
create policy "read" on draft_lotteries for select to authenticated using (true);
create policy "read own" on draft_lottery_views for select to authenticated using (user_id = auth.uid() or is_admin());
revoke insert, update, delete on draft_lotteries, draft_lottery_views from anon, authenticated;

-- ---------- Estrazione ----------
-- Pura: stesso seme, stesso risultato (lo rifà `drawLottery` in TypeScript). Indici di p_teams ancora in gara in `v_left`.
create function lottery_draw(p_seed text, p_teams uuid[], p_weights int[]) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_left int[] := array(select generate_subscripts(p_teams, 1) order by 1);
  v_out jsonb := '[]'::jsonb;
  v_total int;
  v_roll bigint;
  v_hash bytea;
  v_acc int;
  v_win int;
  i int;
begin
  for k in 1 .. coalesce(cardinality(p_teams), 0) loop
    select sum(p_weights[x]) into v_total from unnest(v_left) x;
    if cardinality(v_left) = 1 then
      v_win := v_left[1];
      v_roll := null;
    else
      v_hash := sha256(convert_to(p_seed || ':' || k, 'UTF8'));
      v_roll := ((get_byte(v_hash, 0)::bigint << 24) | (get_byte(v_hash, 1) << 16) | (get_byte(v_hash, 2) << 8) | get_byte(v_hash, 3)) % v_total;
      v_acc := 0;
      foreach i in array v_left loop
        v_acc := v_acc + p_weights[i];
        if v_roll < v_acc then v_win := i; exit; end if;
      end loop;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('pick', k, 'team_id', p_teams[v_win], 'roll', v_roll, 'total', v_total));
    v_left := array_remove(v_left, v_win);
  end loop;
  return v_out;
end $$;

revoke all on function lottery_draw(text, uuid[], int[]) from public, anon, authenticated;

-- p_entrants/p_weights: da `lotteryEntrants` (le ultime della classifica dalla peggiore, biglietti da league_settings).
create function admin_draw_lottery(p_season_id int, p_ranking uuid[], p_entrants uuid[], p_weights int[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_season int;
  v_year int;
  v_n int := coalesce(cardinality(p_ranking), 0);
  v_m int := coalesce(cardinality(p_entrants), 0);
  v_seed text;
  v_row draft_lotteries;
begin
  perform admin_guard();
  if p_season_id is null or p_ranking is null or p_entrants is null or p_weights is null then
    raise exception 'INVALID: dati del sorteggio mancanti';
  end if;
  -- In condivisione con la chiusura: non si estrae mentre un altro admin chiude la stagione.
  v_season := lock_current_season();
  if v_season is distinct from p_season_id then raise exception 'CONFLICT: la stagione corrente è cambiata'; end if;
  if exists (select 1 from draft_lotteries where season_id = p_season_id) then
    raise exception 'CONFLICT: il sorteggio di questa stagione è già stato estratto';
  end if;

  if v_n <> (select count(*) from teams)
     or v_n <> (select count(distinct x) from unnest(p_ranking) x join teams t on t.id = x) then
    raise exception 'INVALID: la classifica deve comprendere tutte le squadre, una volta ciascuna';
  end if;
  if v_m < 1 or v_m > v_n or cardinality(p_weights) <> v_m or exists (select 1 from unnest(p_weights) w where w is null or w < 1) then
    raise exception 'INVALID: squadre o biglietti della lottery non validi';
  end if;
  for i in 1 .. v_m loop
    if p_entrants[i] is distinct from p_ranking[v_n - i + 1] then
      raise exception 'INVALID: la lottery deve comprendere le ultime % della classifica, dalla peggiore', v_m;
    end if;
  end loop;

  select year + 1 into v_year from seasons where id = v_season;
  -- gen_random_uuid() usa il generatore casuale forte del server (122 bit casuali).
  v_seed := replace(gen_random_uuid()::text, '-', '');
  begin
    insert into draft_lotteries (season_id, draft_year, ranking, entrants, weights, seed, draws, drawn_by)
    values (v_season, v_year, p_ranking, p_entrants, p_weights, v_seed, lottery_draw(v_seed, p_entrants, p_weights),
            coalesce((select display_name from profiles where id = auth.uid()), 'admin'))
    returning * into v_row;
  exception when unique_violation then
    raise exception 'CONFLICT: il sorteggio di questa stagione è già stato estratto';
  end;

  perform audit_write('draw_lottery', 'draft_lotteries', v_season::text, null, to_jsonb(v_row));
  return to_jsonb(v_row);
end $$;

revoke all on function admin_draw_lottery(int, uuid[], uuid[], int[]) from public, anon;
grant execute on function admin_draw_lottery(int, uuid[], uuid[], int[]) to authenticated;

-- ---------- Rivelazione vista ----------
-- Chi chiama segna sé stesso (nessun parametro utente). true = segnato adesso, false = l'aveva già visto.
create function draft_lottery_seen(p_season_id int) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'FORBIDDEN: serve l''accesso'; end if;
  if not exists (select 1 from draft_lotteries where season_id = p_season_id) then
    raise exception 'INVALID: nessun sorteggio per questa stagione';
  end if;
  insert into draft_lottery_views (season_id, user_id) values (p_season_id, auth.uid()) on conflict do nothing;
  return found;
end $$;

revoke all on function draft_lottery_seen(int) from public, anon;
grant execute on function draft_lottery_seen(int) to authenticated;
