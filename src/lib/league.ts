// Costruisce la vista della lega (rose, finanze, pick) a partire dalle righe del database.
import {
  rosterWarnings,
  teamFinance,
  type LeagueSettings,
  type Position,
  type TeamFinance,
} from "./cap";

export interface TeamRow {
  id: string;
  name: string;
  owner_name: string;
}
export interface PlayerJoin {
  first_name: string;
  last_name: string;
  pos: Position | null;
  nba_team: string | null;
}
export interface ContractRow {
  id: number;
  team_id: string;
  slot: "starter" | "reserve" | "talent";
  years_left: number;
  team_option: boolean;
  salary: number;
  restriction: "restricted" | "unrestricted" | null;
  players: PlayerJoin | null;
}
export interface CutRow {
  id: number;
  team_id: string;
  paid_salary: number;
  years_left: number | null;
  players: PlayerJoin | null;
}
export interface TalentRow {
  id: number;
  team_id: string;
  display_name: string;
  draft_year: number | null;
  entry_credits: number | null;
  notes: string | null;
}
export interface PickRow {
  id: number;
  year: number;
  round: number;
  original_team_id: string;
  current_team_id: string | null;
  to_confirm: boolean;
  note: string | null;
}
export interface TeamSeasonRow {
  team_id: string;
  bonus: number;
  final_rank: number | null;
  entry_fee_paid: boolean;
  luxury_tax_paid: boolean;
}
export interface SettingRow {
  key: string;
  value: number;
}
export interface RookieDraftRow {
  pick_no: number;
  team_id: string;
  note: string | null;
}

export interface RawLeague {
  seasonYear: number;
  teams: TeamRow[];
  settings: SettingRow[];
  contracts: ContractRow[];
  cuts: CutRow[];
  talents: TalentRow[];
  picks: PickRow[];
  teamSeason: TeamSeasonRow[];
  rookieDraft: RookieDraftRow[];
}

export interface RosterPlayer {
  id: number;
  name: string;
  pos: Position | null;
  nbaTeam: string | null;
  /** "2", "1+1" come nel foglio */
  contractLabel: string;
  yearsLeft: number;
  teamOption: boolean;
  slot: "starter" | "reserve";
  salary: number;
  restriction: ContractRow["restriction"];
}
export interface TeamView {
  team: TeamRow;
  starters: RosterPlayer[];
  reserves: RosterPlayer[];
  talents: TalentRow[];
  cuts: { id: number; name: string; paid: number; yearsLeft: number | null }[];
  finance: TeamFinance;
  warnings: string[];
  bonus: number;
  entryFeePaid: boolean;
  luxuryTaxPaid: boolean;
  finalRank: number | null;
}
export interface LeagueView {
  seasonYear: number;
  settings: LeagueSettings;
  teams: TeamView[];
  picks: PickRow[];
  rookieDraft: RookieDraftRow[];
  teamNames: Map<string, string>;
}

const POS_ORDER: Record<string, number> = { G: 0, A: 1, C: 2 };

export function playerName(p: PlayerJoin | null): string {
  if (!p) return "?";
  return p.first_name ? `${p.first_name} ${p.last_name}` : p.last_name;
}

/** Tutte le chiavi sono obbligatorie: una chiave mancante è un errore, non un default silenzioso (regola d'oro del CLAUDE.md). */
export function settingsFromRows(rows: SettingRow[]): LeagueSettings {
  const m = new Map(rows.map((r) => [r.key, Number(r.value)]));
  const get = (k: string) => {
    const v = m.get(k);
    if (v === undefined) throw new Error(`league_settings: manca la chiave "${k}"`);
    return v;
  };
  return {
    cap: get("cap"),
    reserveBudget: get("reserve_budget"),
    floorDivisor: get("floor_divisor"),
    taxCreditsPerEuro: get("tax_credits_per_euro"),
    taxMaxOver: get("tax_max_over"),
    starters: { G: get("starters_g"), A: get("starters_a"), C: get("starters_c") },
    reserveMin: get("reserve_min"),
    reserveMax: get("reserve_max"),
    reserveMaxPerPosition: get("reserve_max_per_pos"),
  };
}

export function contractLabel(years: number, teamOption: boolean): string {
  const y = years === 0.5 ? "½" : String(years);
  return teamOption ? `${y}+1` : y;
}

const byPosThenSalary = (a: RosterPlayer, b: RosterPlayer) =>
  (POS_ORDER[a.pos ?? ""] ?? 9) - (POS_ORDER[b.pos ?? ""] ?? 9) || b.salary - a.salary;

export function buildLeague(raw: RawLeague): LeagueView {
  const settings = settingsFromRows(raw.settings);
  const season = new Map(raw.teamSeason.map((t) => [t.team_id, t]));

  const teams = raw.teams.map<TeamView>((team) => {
    const mine = raw.contracts.filter((c) => c.team_id === team.id);
    const toPlayer = (c: ContractRow): RosterPlayer => ({
      slot: c.slot === "reserve" ? "reserve" : "starter",
      yearsLeft: Number(c.years_left),
      teamOption: c.team_option,
      id: c.id,
      name: playerName(c.players),
      pos: c.players?.pos ?? null,
      nbaTeam: c.players?.nba_team ?? null,
      contractLabel: contractLabel(Number(c.years_left), c.team_option),
      salary: Number(c.salary),
      restriction: c.restriction,
    });
    const starters = mine.filter((c) => c.slot === "starter").map(toPlayer).sort(byPosThenSalary);
    const reserves = mine.filter((c) => c.slot === "reserve").map(toPlayer).sort(byPosThenSalary);
    const cuts = raw.cuts
      .filter((c) => c.team_id === team.id)
      .map((c) => ({ id: c.id, name: playerName(c.players), paid: Number(c.paid_salary), yearsLeft: c.years_left }));
    const ts = season.get(team.id);
    const roster = [...starters.map((p) => ({ p, slot: "starter" as const })), ...reserves.map((p) => ({ p, slot: "reserve" as const }))].map(
      ({ p, slot }) => ({ position: p.pos, slot, salary: p.salary }),
    );
    const finance = teamFinance(roster, cuts.map((c) => ({ salary: c.paid })), ts?.bonus ?? 0, settings);
    return {
      team,
      starters,
      reserves,
      talents: raw.talents.filter((t) => t.team_id === team.id),
      cuts,
      finance,
      warnings: rosterWarnings(roster, settings),
      bonus: ts?.bonus ?? 0,
      entryFeePaid: ts?.entry_fee_paid ?? false,
      luxuryTaxPaid: ts?.luxury_tax_paid ?? false,
      finalRank: ts?.final_rank ?? null,
    };
  });

  return {
    seasonYear: raw.seasonYear,
    settings,
    teams,
    picks: raw.picks,
    rookieDraft: [...raw.rookieDraft].sort((a, b) => a.pick_no - b.pick_no),
    teamNames: new Map(raw.teams.map((t) => [t.id, t.name])),
  };
}
