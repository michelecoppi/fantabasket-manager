-- Nomi delle squadre come sono davvero (correzione dell'utente, 2026-10-29): «Spaccinos» si chiama ancora «Chicago Spaccinos» e
-- «San Antonio» è «San Antonio Spurs», come su Dunkest. Le righe si collegano per id: cambia solo il nome mostrato.
-- `league_history` tiene il nome di ogni stagione così com'era su Dunkest. Nel database vuoto della CI (migrazioni prima del
-- seed) non c'è niente da rinominare: il seed scrive già i nomi nuovi.

update teams set name = 'Chicago Spaccinos' where name = 'Spaccinos';
update teams set name = 'San Antonio Spurs' where name = 'San Antonio';
