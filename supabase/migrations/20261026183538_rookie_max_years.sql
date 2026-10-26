-- R-26: un contratto rookie dura al massimo 2 stagioni (anno in corso incluso, team option compresa).
-- Il valore sta in league_settings; il controllo vive in `src/lib/cap.ts`. La chiusura stagione copia le impostazioni
-- alla stagione nuova, quindi il parametro la segue.
insert into league_settings (season_id, key, value)
select s.id, 'rookie_max_years', 2 from seasons s
on conflict (season_id, key) do nothing;
