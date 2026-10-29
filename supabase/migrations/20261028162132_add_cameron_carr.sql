-- Cameron Carr (LAL, rookie 2026): infortunato su Dunkest ma senza statistiche, quindi il job non lo aggiunge al listone
-- (la pagina infortuni dà solo il nome abbreviato). Dati dalla pagina Dunkest /it/giocatore/3143/cameron-carr.
insert into players (first_name, last_name, pos, nba_team, dunkest_credits, dunkest_id) values
  ('Cameron', 'Carr', 'G', 'Los Angeles Lakers', 5.2, 3143)
on conflict do nothing;
