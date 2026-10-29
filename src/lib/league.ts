// Costruisce la vista della lega (rose, finanze, pick) a partire dalle righe del database.
import {
  rosterWarnings,
  teamFinance,
  type LeagueSettings,
  type PickInfo,
  type Position,
  type TeamFinance,
  type TradeSide,
} from "./cap";

interface TeamRow {
  id: string;
  name: string;
  owner_name: string;
}
interface PlayerJoin {
  first_name: string;
  last_name: string;
  pos: Position | null;
  nba_team: string | null;
}
export interface ContractRow {
  id: number;
  team_id: string;
  player_id: number;
  slot: "starter" | "reserve" | "talent";
  years_left: number | null; // null = durata da fissare
  team_option: boolean;
  salary: number;
  restriction: "unrestricted" | null;
  is_rookie: boolean;
  players: PlayerJoin | null;
}
/** R-41/R-42: 'pending' = in attesa dell'asta dei tagliati, 'cut' = taglio definitivo. Rientrati e assegnati non si caricano più. */
type CutStatus = "pending" | "cut";
export interface CutRow {
  id: number;
  team_id: string;
  player_id: number;
  status: CutStatus;
  paid_salary: number;
  years_left: number | null;
  original_salary: number | null;
  original_slot: "starter" | "reserve" | "talent" | null;
  original_is_rookie: boolean;
  team_option: boolean;
  players: PlayerJoin | null;
}
interface TalentRow {
  id: number;
  team_id: string;
  display_name: string;
  draft_year: number | null;
  entry_credits: number | null;
  notes: string | null;
}
interface PickRow {
  id: number;
  year: number;
  round: number;
  original_team_id: string;
  current_team_id: string | null;
  to_confirm: boolean;
  note: string | null;
}
interface TeamSeasonRow {
  team_id: string;
  version: number;
  bonus: number;
  final_rank: number | null;
  entry_fee_paid: boolean;
  luxury_tax_paid: boolean;
}
export interface SettingRow {
  key: string;
  value: number;
}
interface RookieDraftRow {
  pick_no: number;
  team_id: string;
  /** null per i draft importati dal foglio: `team_id` è allora l'unica informazione */
  original_team_id: string | null;
  note: string | null;
}

/** Versioni delle righe modificabili dagli admin (migrazioni 0006-0007), per la concorrenza ottimistica delle RPC. */
export interface Versions {
  contracts: Record<number, number>;
  picks: Record<number, number>;
  cuts: Record<number, number>;
  /** per squadra (la riga delle quote può non esistere ancora) */
  teamSeason: Record<string, number>;
  /** per squadra: contatore delle modifiche alla rosa, riletto dalla RPC dopo il lock di squadra (migrazione 0012) */
  rosterRev: Record<string, number>;
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
  /** id del contratto */
  id: number;
  playerId: number;
  name: string;
  pos: Position | null;
  nbaTeam: string | null;
  /** "2", "1+1" come nel foglio */
  contractLabel: string;
  yearsLeft: number | null; // null = durata da fissare
  teamOption: boolean;
  slot: "starter" | "reserve";
  salary: number;
  restriction: ContractRow["restriction"];
  rookie: boolean;
}
interface TeamCut {
  id: number;
  playerId: number;
  name: string;
  pos: Position | null;
  status: CutStatus;
  paid: number;
  yearsLeft: number | null;
  /** termini del contratto prima del taglio, per farlo rientrare (null per i tagli importati dal foglio) */
  originalSalary: number | null;
  originalSlot: "starter" | "reserve" | null;
  originalIsRookie: boolean;
  teamOption: boolean;
}
export interface TeamView {
  team: TeamRow;
  starters: RosterPlayer[];
  reserves: RosterPlayer[];
  talents: TalentRow[];
  cuts: TeamCut[];
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
  // R-60: rank_bonus_1..N (uno per posizione in classifica), almeno il primo è obbligatorio.
  const rankBonus = () => {
    const out: number[] = [];
    for (let i = 1; m.has(`rank_bonus_${i}`); i++) out.push(get(`rank_bonus_${i}`));
    return out.length ? out : [get("rank_bonus_1")];
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
    contractMaxYears: get("contract_max_years"),
    rookieMaxYears: get("rookie_max_years"),
    lastContractMinFraction: get("last_contract_min_fraction"),
    lastContractValidMonths: get("last_contract_valid_months"),
    maxPicksPerRound: get("max_picks_per_round"),
    tradeMaxTeams: get("trade_max_teams"),
    tradeProposalHours: get("trade_proposal_hours"),
    pickHorizonYears: get("pick_horizon_years"),
    draftRounds: get("draft_rounds"),
    rankBonus: rankBonus(),
    lotteryTeams: get("lottery_teams"),
  };
}

export function contractLabel(years: number | null, teamOption: boolean): string {
  if (years === null) return "?";
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
      yearsLeft: c.years_left === null ? null : Number(c.years_left),
      teamOption: c.team_option,
      id: c.id,
      playerId: c.player_id,
      name: playerName(c.players),
      pos: c.players?.pos ?? null,
      nbaTeam: c.players?.nba_team ?? null,
      contractLabel: contractLabel(c.years_left === null ? null : Number(c.years_left), c.team_option),
      salary: Number(c.salary),
      restriction: c.restriction,
      rookie: c.is_rookie,
    });
    const starters = mine.filter((c) => c.slot === "starter").map(toPlayer).sort(byPosThenSalary);
    const reserves = mine.filter((c) => c.slot === "reserve").map(toPlayer).sort(byPosThenSalary);
    const cuts = raw.cuts
      .filter((c) => c.team_id === team.id)
      .map<TeamCut>((c) => ({
        id: c.id,
        playerId: c.player_id,
        name: playerName(c.players),
        pos: c.players?.pos ?? null,
        status: c.status,
        paid: Number(c.paid_salary),
        yearsLeft: c.years_left === null ? null : Number(c.years_left),
        originalSalary: c.original_salary === null ? null : Number(c.original_salary),
        originalSlot: c.original_slot === "starter" || c.original_slot === "reserve" ? c.original_slot : null,
        originalIsRookie: c.original_is_rookie,
        teamOption: c.team_option,
      }));
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

/** La squadra come la vedono i calcoli di scambio/firma (`id` = id del contratto). */
export function teamSide(t: TeamView): TradeSide {
  return {
    roster: [...t.starters, ...t.reserves].map((p) => ({ id: p.id, position: p.pos, slot: p.slot, salary: p.salary })),
    cuts: t.cuts.map((c) => ({ salary: c.paid })),
    bonus: t.bonus,
  };
}

/** Pick attualmente possedute dalla squadra. */
export function teamPicks(league: LeagueView, teamId: string): PickInfo[] {
  return league.picks
    .filter((p) => p.current_team_id === teamId)
    .map((p) => ({ id: p.id, year: p.year, round: p.round, toConfirm: p.to_confirm }));
}
