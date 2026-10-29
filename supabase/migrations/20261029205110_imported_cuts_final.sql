-- Tagli importati dal foglio rimasti "in attesa dell'asta dei tagliati" (`pending`).
-- L'import del 2026-10-23 girava ancora con lo script che inseriva i tagli senza stato, quindi col default `pending`; le RPC
-- d'import di oggi (`import_replace_season`) scrivono già `cut`, perché il foglio è post-asta e i suoi tagli sono definitivi
-- (R-42). Da `pending` un taglio importato sembrava ancora all'asta: firmarlo per un'altra squadra (`admin_award_cut`)
-- avrebbe cancellato la quota dell'ex proprietario, e la chiusura di stagione restava bloccata.
-- Si riconoscono perché non ricordano lo stipendio di partenza: `admin_cut_player` scrive sempre `original_salary`.

with fixed as (
  update cuts set status = 'cut'
  where status = 'pending' and original_salary is null
  returning id, team_id, paid_salary)
insert into audit_log (action, table_name, row_id, before, after)
select 'update', 'cuts', id::text, jsonb_build_object('status', 'pending'),
  jsonb_build_object('status', 'cut', 'summary', format('Taglio importato dal foglio reso definitivo · quota %s crediti', paid_salary))
from fixed;
