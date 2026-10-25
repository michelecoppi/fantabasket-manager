-- Dati di base. Mappa proprietari ↔ squadre confermata il 2026-10-21 (docs/OPEN-QUESTIONS.md).
insert into seasons (year, is_current) values (2026, true);

insert into league_settings (season_id, key, value)
select s.id, v.key, v.value from seasons s, (values
  ('cap', 250), ('reserve_budget', 80), ('floor_divisor', 5),
  ('tax_credits_per_euro', 4), ('tax_max_over', 20),
  ('starters_g', 5), ('starters_a', 5), ('starters_c', 3),
  ('reserve_min', 3), ('reserve_max', 6), ('reserve_max_per_pos', 3),
  ('contract_max_years', 3), ('max_picks_per_round', 2),
  ('pick_horizon_years', 3), ('draft_rounds', 5),
  ('rank_bonus_1', 5), ('rank_bonus_2', 4), ('rank_bonus_3', 3), ('rank_bonus_4', 2),
  ('rank_bonus_5', 0), ('rank_bonus_6', -1), ('rank_bonus_7', -2), ('rank_bonus_8', -3),
  ('lottery_teams', 4)
) as v(key, value) where s.year = 2026;

insert into teams (name, owner_name) values
  ('Assago Farmers', 'Amedeo'),
  ('CUS Cosenza', 'Lugiu'),
  ('Bol Bollerz', 'Gabby'),
  ('Dame Time', 'Damiano'),
  ('Atlanto Non Vinco', 'Scuti'),
  ('Spaccinos', 'Serde'),
  ('OKCC', 'CC'),
  ('San Antonio', 'Antonio');
