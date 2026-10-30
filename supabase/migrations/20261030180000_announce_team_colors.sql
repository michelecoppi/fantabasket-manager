-- Card dello scambio su Telegram: il bot disegna la card con i colori delle squadre, che sul sito dipendono dal posto della
-- squadra tra tutte quelle della lega (ordinate per id, `teamColors` in lib/team-colors.ts). Il cron non ha una sessione per
-- leggere `teams`, quindi `trade_announce_claim` aggiunge a ogni squadra `color_index`. Solo un campo in più: stessa firma, stessi
-- permessi (la funzione è quella della migrazione 20261030160000, con i talenti); il codice senza il campo ripiega su colori
-- calcolati tra le sole squadre dello scambio.

create or replace function trade_announce_claim(p_secret text, p_max_age_hours int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not dunkest_sync_allowed(p_secret) then raise exception 'FORBIDDEN: segreto del job non valido'; end if;
  if p_max_age_hours is null or p_max_age_hours < 1 then raise exception 'INVALID: età massima non valida'; end if;
  with c as (
    update trades set announce_claimed_at = now()
    where status = 'approved' and announced_at is null
      and created_at > now() - make_interval(hours => p_max_age_hours)
      and (announce_claimed_at is null or announce_claimed_at < now() - interval '5 minutes')
    returning *)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'created_at', c.created_at,
      'cap_override_reason', c.cap_override_reason,
      'teams', (
        select jsonb_agg(jsonb_build_object(
            'id', t.id,
            'name', t.name,
            -- posto della squadra tra tutte quelle della lega, per id: il sito ne ricava il colore (teamColors) e la card del bot
            -- ha lo stesso colore delle pagine
            'color_index', (select count(*) from teams x where x.id < t.id),
            'season_trades', (select count(*) from trades x
                              where x.season_id = c.season_id and x.status = 'approved' and x.id <= c.id
                                and x.payload -> 'teams' ? t.id::text))
          order by o.ord)
        from jsonb_array_elements_text(c.payload -> 'teams') with ordinality o(id, ord)
        join teams t on t.id = o.id::uuid),
      'moves', (
        select jsonb_agg(m.value || case m.value ->> 'kind'
            when 'contract' then coalesce((
              select jsonb_build_object(
                'name', case when p.first_name <> '' then p.first_name || ' ' || p.last_name else p.last_name end,
                'pos', p.pos,
                'salary', k.salary,
                'years_left', k.years_left,
                'rookie', k.is_rookie,
                'pdk', s.pdk,
                'gp', s.gp,
                'injury', i.injury)
              from contracts k
              join players p on p.id = k.player_id
              left join dunkest_stats s on s.player_id = k.player_id and s.season_id = c.season_id
              left join dunkest_injuries i on i.player_id = k.player_id
              where k.id = (m.value ->> 'id')::int), '{}'::jsonb)
            when 'talent' then coalesce((
              select jsonb_build_object(
                'name', case when p.first_name <> '' then p.first_name || ' ' || p.last_name else p.last_name end,
                'pos', p.pos,
                'nba_team', p.nba_team,
                'pdk', s.pdk,
                'gp', s.gp,
                'injury', i.injury)
              from players p
              left join dunkest_stats s on s.player_id = p.id and s.season_id = c.season_id
              left join dunkest_injuries i on i.player_id = p.id
              where p.id = (m.value ->> 'player_id')::int), '{}'::jsonb)
            else coalesce((
              select jsonb_build_object('year', d.year, 'round', d.round, 'original_team', ot.name)
              from draft_picks d join teams ot on ot.id = d.original_team_id
              where d.id = (m.value ->> 'id')::int), '{}'::jsonb)
          end
          order by m.ord)
        from jsonb_array_elements(c.payload -> 'moves') with ordinality m(value, ord))
    ) order by c.id), '[]'::jsonb)
  into v from c;
  return v;
end $$;
