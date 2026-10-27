-- Listone aggiornato da Dunkest (issue #68, seguito): il job giornaliero aggiunge a `players` chi ha giocato su Dunkest e
-- il listone non ha (rookie 2026, firme nuove), e qui si sistemano i casi che il nome non risolveva.

-- Aggiunge i giocatori nuovi: [{dunkest_id, first_name, last_name, pos, nba_team, dunkest_credits}]. Idempotente: chi esiste già
-- (stesso nome e squadra, o stesso id Dunkest) viene saltato. Restituisce solo le righe inserite, [{id, dunkest_id}].
create function dunkest_sync_add_players(p_secret text, p_players jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  if jsonb_typeof(p_players) is distinct from 'array' then raise exception 'INVALID: lista giocatori mancante'; end if;
  if jsonb_array_length(p_players) > 100 then raise exception 'INVALID: troppi giocatori nuovi in un colpo solo'; end if;
  with ins as (
    insert into players (first_name, last_name, pos, nba_team, dunkest_credits, dunkest_id)
    select btrim(n.first_name), btrim(n.last_name), n.pos::player_pos, n.nba_team, n.dunkest_credits, n.dunkest_id
    from jsonb_to_recordset(p_players) as n(dunkest_id int, first_name text, last_name text, pos text, nba_team text, dunkest_credits numeric)
    where btrim(coalesce(n.first_name, '')) <> '' and btrim(coalesce(n.last_name, '')) <> '' and n.dunkest_id is not null
    on conflict do nothing
    returning id, dunkest_id)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'dunkest_id', dunkest_id)), '[]'::jsonb) into v_rows from ins;
  return v_rows;
end $$;

revoke all on function dunkest_sync_add_players(text, jsonb) from public;
grant execute on function dunkest_sync_add_players(text, jsonb) to anon, authenticated;

-- ---------- Correzioni una tantum (verificate su Dunkest il 2026-10-27) ----------
-- Ognuna scatta solo se la riga è ancora come l'abbiamo vista e l'id Dunkest non è già di un altro giocatore.

-- «A.Walker» del foglio = Nickeil Alexander-Walker (conferma dell'utente), Atlanta Hawks, id Dunkest 575. Il ruolo resta quello del foglio.
update players set first_name = 'Nickeil', last_name = 'Alexander-Walker', nba_team = 'Atlanta Hawks', dunkest_id = 575
where first_name = '' and last_name = 'A.Walker'
  and not exists (select 1 from players o where o.dunkest_id = 575 or (o.first_name = 'Nickeil' and o.last_name = 'Alexander-Walker' and o.nba_team = 'Atlanta Hawks'));

-- Giocatori in rosa che non hanno ancora giocato nel 2026-27 (non compaiono nelle statistiche): id Dunkest dalle stagioni precedenti.
update players set dunkest_id = 1015 where first_name = 'Cam' and last_name = 'Thomas' and dunkest_id is null and not exists (select 1 from players o where o.dunkest_id = 1015);
update players set dunkest_id = 1142 where first_name = 'Jeremy' and last_name = 'Sochan' and dunkest_id is null and not exists (select 1 from players o where o.dunkest_id = 1142);
update players set dunkest_id = 659 where first_name = 'Kevin' and last_name = 'Porter Jr.' and dunkest_id is null and not exists (select 1 from players o where o.dunkest_id = 659);

-- Infortunati senza statistiche (rookie e rientri): la pagina infortuni dà solo il nome abbreviato, quindi si aggiungono a mano.
-- Crediti nulli dove Dunkest scrive «-».
insert into players (first_name, last_name, pos, nba_team, dunkest_credits, dunkest_id) values
  ('AJ', 'Dybantsa', 'A', 'Washington Wizards', 13.8, 3170),
  ('Khalifa', 'Diop', 'C', 'Cleveland Cavaliers', null, 3101),
  ('Maxime', 'Raynaud', 'C', 'Sacramento Kings', 9.8, 2929),
  ('Tacko', 'Fall', 'C', 'Philadelphia 76ers', null, 603),
  ('Thomas', 'Sorber', 'C', 'Oklahoma City Thunder', 4.0, 2970)
on conflict do nothing;
