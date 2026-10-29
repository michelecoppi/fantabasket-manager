-- Durate da fissare (Admin → Rose): oltre a durata e team option (+1, R-22) si può marcare il contratto unrestricted
-- (`u` del foglio, R-23/R-24). La chiave `unrestricted` è facoltativa: se manca la restriction resta com'è.

create or replace function admin_set_durations(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_old contracts;
  v_new contracts;
  v_n int := 0;
begin
  perform admin_guard();
  for v_item in select jsonb_array_elements(p_items) loop
    if (v_item ->> 'version') is null then raise exception 'INVALID: versione mancante'; end if;
    select * into v_old from contracts where id = (v_item ->> 'id')::int for update;
    if not found then raise exception 'CONFLICT: un contratto non esiste più'; end if;
    if v_old.version is distinct from (v_item ->> 'version')::int then
      raise exception 'CONFLICT: un contratto è stato modificato da un altro admin';
    end if;
    update contracts
    set years_left = (v_item ->> 'years')::numeric,
        team_option = coalesce((v_item ->> 'team_option')::boolean, false),
        restriction = case
          when not (v_item ? 'unrestricted') then restriction
          when (v_item ->> 'unrestricted')::boolean then 'unrestricted'::restriction_kind
          else null
        end
    where id = v_old.id
    returning * into v_new;
    v_n := v_n + 1;

    perform audit_write('update', 'contracts', v_old.id::text,
      jsonb_build_object('years_left', v_old.years_left, 'team_option', v_old.team_option, 'restriction', v_old.restriction),
      jsonb_build_object('years_left', v_new.years_left, 'team_option', v_new.team_option, 'restriction', v_new.restriction));
  end loop;
  if v_n = 0 then raise exception 'INVALID: nessun contratto da aggiornare'; end if;
  perform audit_write('update', 'contracts', null, null, jsonb_build_object('summary', format('Durata fissata per %s contratti', v_n)));
  return v_n;
end $$;
