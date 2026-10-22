-- Schema iniziale. BOZZA: rifinire insieme all'import del foglio (vedi docs/DATA-MODEL.md).
-- Permessi: lettura per ogni utente autenticato, scrittura solo admin (RLS).

create type app_role as enum ('admin', 'viewer');
create type roster_slot as enum ('starter', 'reserve', 'talent');
create type player_pos as enum ('G', 'A', 'C');
create type restriction_kind as enum ('restricted', 'unrestricted'); -- R-23 / R-24

create table seasons (
  id serial primary key,
  year int unique not null,
  is_current boolean not null default false
);
-- una sola stagione corrente
create unique index seasons_one_current on seasons (is_current) where is_current;

create table league_settings (
  season_id int not null references seasons on delete cascade,
  key text not null,
  value numeric not null,
  primary key (season_id, key)
); -- cap, reserve_budget, floor_divisor, tax_credits_per_euro, tax_max_over, ... (elenco completo: seed.sql e settingsFromRows in src/lib/league.ts)

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  owner_name text not null
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  role app_role not null default 'viewer',
  team_id uuid references teams
);

create table players (
  id serial primary key,
  first_name text not null,
  last_name text not null,
  pos player_pos,
  nba_team text,
  dunkest_credits numeric(5,1),
  unique (first_name, last_name, nba_team)
);

create table contracts (
  id serial primary key,
  season_id int not null references seasons,
  team_id uuid not null references teams,
  player_id int not null references players,
  slot roster_slot not null,
  years_left numeric(2,1) not null check (years_left > 0), -- 0.5 = mezza stagione (R-20)
  team_option boolean not null default false,               -- "1+1" (R-22)
  salary numeric(5,1) not null check (salary >= 0),
  restriction restriction_kind,                             -- 'r' / 'u' nel foglio
  notes text
);
create index contracts_team_season on contracts (team_id, season_id);

create table cuts ( -- R-40..R-42
  id serial primary key,
  season_id int not null references seasons,
  team_id uuid not null references teams,
  player_id int not null references players,
  paid_salary numeric(5,1) not null, -- quota pagata (1/3), come nel foglio
  years_left numeric(2,1),
  status text not null default 'pending' check (status in ('pending', 'cut', 'reinstated'))
);

create table talents ( -- squadra talenti (R-35)
  id serial primary key,
  team_id uuid not null references teams,
  player_id int references players,
  display_name text not null,
  draft_year int,
  entry_credits numeric(5,1),
  notes text
);

create table draft_picks ( -- R-31..R-34
  id serial primary key,
  year int not null,
  round int not null check (round between 1 and 5),
  original_team_id uuid not null references teams,
  current_team_id uuid not null references teams,
  note text,
  unique (year, round, original_team_id)
);

create table rookie_draft ( -- ordine/risultato del draft
  season_id int not null references seasons,
  pick_no int not null,
  team_id uuid not null references teams,
  player_id int references players,
  note text,
  primary key (season_id, pick_no)
);

create table last_contracts ( -- R-25: prezzo minimo = metà ultimo stipendio, per 1 anno
  id serial primary key,
  player_id int not null references players,
  team_id uuid references teams,
  salary numeric(5,1) not null,
  last_contract_on date not null
);

create table team_season (
  season_id int not null references seasons,
  team_id uuid not null references teams,
  bonus int not null default 0,                -- R-60, calcolato dalla classifica precedente
  final_rank int check (final_rank between 1 and 8),
  entry_fee_paid boolean not null default false,
  luxury_tax_paid boolean not null default false,
  primary key (season_id, team_id)
);

create table trades (
  id serial primary key,
  season_id int not null references seasons,
  created_at timestamptz not null default now(),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected')),
  payload jsonb not null,  -- giocatori e pick per ciascuna squadra
  approved_by text,        -- il moderatore può non essere admin dell'app
  cap_override_reason text -- R-57
);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid,
  action text not null,
  table_name text not null,
  row_id text,
  before jsonb,
  after jsonb
);

-- ---------- Row Level Security ----------
create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'seasons','league_settings','teams','players','contracts','cuts','talents',
    'draft_picks','rookie_draft','last_contracts','team_season','trades'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read" on %I for select to authenticated using (true)', t);
    execute format('create policy "admin write" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

alter table profiles enable row level security;
create policy "read" on profiles for select to authenticated using (true);
create policy "admin write" on profiles for all to authenticated using (is_admin()) with check (is_admin());

alter table audit_log enable row level security;
create policy "admin read" on audit_log for select to authenticated using (is_admin());
create policy "admin insert" on audit_log for insert to authenticated with check (is_admin());
