-- Media PDK delle sole partite valide per Dunkest (issue #98). `dunkest_stats` viene dalla tabella statistiche in modalità
-- `nba`, che conta tutte le partite giocate; il sito Dunkest e i punti della lega contano solo quelle con
-- `gameValidForDunkest` (es. Wembanyama al 2026-10-30: 41,5 su 5 partite contro 44,9 su 4). `dunkest_week_stats` ha già i
-- totali per giornata in modalità Dunkest (somma dei round), quindi la media valida è somma PDK / somma partite.
-- Decisione dell'utente (2026-11-04): ovunque si mostra questa; la media di tutte le partite resta solo nella pagina del
-- giocatore, calcolata dal log partita per partita (`dunkest_games`).

-- Una riga per giocatore del listone e stagione, invece di una per giornata (a fine stagione ~10.000 righe).
create view dunkest_valid_stats with (security_invoker = true) as
  select season_id, player_id,
         sum(gp)::int as gp,
         round(sum(pdk) / sum(gp), 2) as pdk,
         round(sum(pts)::numeric / sum(gp), 1) as pts,
         round(sum(reb)::numeric / sum(gp), 1) as reb,
         round(sum(ast)::numeric / sum(gp), 1) as ast
  from dunkest_week_stats
  where player_id is not null
  group by season_id, player_id;

-- Card dello scambio su Telegram: stessa media delle pagine. La funzione è quella della migrazione 20261030180000, cambia solo
-- la fonte di `pdk` e `gp` (da `dunkest_stats` a `dunkest_valid_stats`).
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
              left join dunkest_valid_stats s on s.player_id = k.player_id and s.season_id = c.season_id
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
              left join dunkest_valid_stats s on s.player_id = p.id and s.season_id = c.season_id
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
