-- R-25: prezzo minimo all'asta di un ex-contratto = metà dell'ultimo stipendio, valida per 1 anno.
-- Frazione e durata stanno in league_settings; il controllo vive in `src/lib/cap.ts` (auctionFloor). La chiusura stagione
-- copia le impostazioni alla stagione nuova, quindi i parametri la seguono.
insert into league_settings (season_id, key, value)
select s.id, v.key, v.value from seasons s, (values ('last_contract_min_fraction', 0.5), ('last_contract_valid_months', 12)) as v(key, value)
on conflict (season_id, key) do nothing;
