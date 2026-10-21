import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, tradeImpact, type TradeSide } from "./cap";
import { endSeason, expiringContracts, parseExpiringFilters } from "./expiring";
import { buildLeague, type RawLeague } from "./league";
import { listTeams, parseTeamListOptions } from "./teams-list";

const SETTING_ROWS = Object.entries({
  cap: 250, reserve_budget: 80, floor_divisor: 5, tax_credits_per_euro: 4, tax_max_over: 20,
  starters_g: 5, starters_a: 5, starters_c: 3, reserve_min: 3, reserve_max: 6, reserve_max_per_pos: 3,
  contract_max_years: 3, max_picks_per_round: 2,
}).map(([key, value]) => ({ key, value }));

const pl = (last: string) => ({ first_name: "", last_name: last, pos: "G" as const, nba_team: null });
const raw: RawLeague = {
  seasonYear: 2026,
  teams: [
    { id: "t1", name: "Alfa", owner_name: "A" },
    { id: "t2", name: "Beta", owner_name: "B" },
  ],
  settings: SETTING_ROWS,
  contracts: [
    { id: 1, team_id: "t1", slot: "starter", years_left: 0.5, team_option: false, salary: 20, restriction: null, is_rookie: false, players: pl("Mezzo") },
    { id: 2, team_id: "t1", slot: "starter", years_left: 2, team_option: true, salary: 30, restriction: null, is_rookie: false, players: pl("Due") },
    { id: 3, team_id: "t2", slot: "starter", years_left: 1, team_option: false, salary: 255, restriction: null, is_rookie: false, players: pl("Ricco") },
    { id: 4, team_id: "t2", slot: "reserve", years_left: 3, team_option: false, salary: 5, restriction: null, is_rookie: false, players: pl("Riserva") },
    { id: 5, team_id: "t2", slot: "starter", years_left: null, team_option: false, salary: 4, restriction: null, is_rookie: false, players: pl("SenzaDurata") },
  ],
  cuts: [], talents: [], picks: [], teamSeason: [], rookieDraft: [],
};
const league = buildLeague(raw);

describe("contratti in scadenza", () => {
  it("calcola la stagione di scadenza (0.5 e 1 → stagione corrente)", () => {
    expect(endSeason(2026, 0.5)).toBe(2026);
    expect(endSeason(2026, 1)).toBe(2026);
    expect(endSeason(2026, 3)).toBe(2028);
  });
  it("filtra per squadra e stagione, ordinando per scadenza", () => {
    const all = expiringContracts(league.teams, 2026, { teamId: "", season: null });
    expect(all.map((c) => c.player.name)).toEqual(["Mezzo", "Ricco", "Due", "Riserva"]);
    expect(all.find((c) => c.player.name === "Due")?.optionSeason).toBe(2028);
    expect(expiringContracts(league.teams, 2026, { teamId: "t1", season: 2026 }).map((c) => c.player.name)).toEqual(["Mezzo"]);
  });
  it("salta i contratti senza durata", () => {
    expect(expiringContracts(league.teams, 2026, { teamId: "t2", season: null }).map((c) => c.player.name)).toEqual(["Ricco", "Riserva"]);
  });
  it("legge i filtri dall'URL", () => {
    expect(parseExpiringFilters({ squadra: "t1", stagione: "2027" })).toEqual({ teamId: "t1", season: 2027 });
    expect(parseExpiringFilters({ stagione: "boh" })).toEqual({ teamId: "", season: null });
  });
});

describe("home: ordinamento e filtri", () => {
  it("ordina per monte ingaggi e spazio", () => {
    expect(listTeams(league.teams, { sort: "monte", filter: "tutte" }).map((t) => t.team.name)).toEqual(["Beta", "Alfa"]);
    expect(listTeams(league.teams, { sort: "spazio", filter: "tutte" }).map((t) => t.team.name)).toEqual(["Alfa", "Beta"]);
  });
  it("filtra sforate e sotto floor", () => {
    expect(listTeams(league.teams, { sort: "nome", filter: "sforate" }).map((t) => t.team.name)).toEqual(["Beta"]);
    expect(listTeams(league.teams, { sort: "nome", filter: "floor" }).map((t) => t.team.name)).toEqual(["Alfa"]);
  });
  it("ignora valori non validi", () => {
    expect(parseTeamListOptions({ ordina: "x", mostra: "y" })).toEqual({ sort: "nome", filter: "tutte" });
  });
});

describe("tradeImpact (R-57)", () => {
  const s = DEFAULT_SETTINGS;
  const side = (salaries: number[]): TradeSide => ({
    roster: salaries.map((salary, i) => ({ id: i + 1, position: "G" as const, slot: "starter" as const, salary })),
    cuts: [],
    bonus: 0,
  });
  it("ammette uno scambio che resta sotto il cap", () => {
    const r = tradeImpact(side([100, 50]), new Set([2]), [{ position: "G", slot: "starter", salary: 90 }], s);
    expect(r.after.payroll).toBe(190);
    expect(r.breaksCap).toBe(false);
  });
  it("blocca uno scambio che fa sforare", () => {
    const r = tradeImpact(side([200, 40]), new Set([2]), [{ position: "G", slot: "starter", salary: 60 }], s);
    expect(r.after.capSpace).toBe(-10);
    expect(r.breaksCap).toBe(true);
  });
  it("chi è già sopra il cap può solo alleggerire il monte ingaggi", () => {
    expect(tradeImpact(side([260]), new Set([1]), [{ position: "G", slot: "starter", salary: 255 }], s).breaksCap).toBe(false);
    expect(tradeImpact(side([260]), new Set([1]), [{ position: "G", slot: "starter", salary: 265 }], s).breaksCap).toBe(true);
  });
  it("il floor non conta e le riserve non toccano il cap", () => {
    const r = tradeImpact(side([10]), new Set([1]), [{ position: "G", slot: "reserve", salary: 5 }], s);
    expect(r.after.belowFloor).toBe(true);
    expect(r.breaksCap).toBe(false);
  });
});
