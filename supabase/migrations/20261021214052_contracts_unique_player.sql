-- Un giocatore ha al massimo un contratto per stagione (prima poteva stare in due squadre).
-- Controllo da fare prima di applicarla (deve restituire 0 righe):
--   select season_id, player_id, count(*) from contracts group by 1, 2 having count(*) > 1;
-- Nessun vincolo analogo su `cuts`: se un giocatore possa avere contratto e taglio nella stessa
-- stagione (rientro in rosa, R-42) è una domanda aperta, vedi docs/OPEN-QUESTIONS.md.
alter table contracts add constraint contracts_season_player_key unique (season_id, player_id);
