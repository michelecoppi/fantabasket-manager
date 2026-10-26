import { describe, expect, it } from "vitest";
import { buildLeague, contractLabel, playerName, settingsFromRows, type RawLeague, type SettingRow } from "./league";

// Stesse chiavi e valori di supabase/seed.sql: ogni chiave è obbligatoria.
const SETTING_ROWS: SettingRow[] = Object.entries({
  cap: 250, reserve_budget: 80, floor_divisor: 5, tax_credits_per_euro: 4, tax_max_over: 20,
  starters_g: 5, starters_a: 5, starters_c: 3, reserve_min: 3, reserve_max: 6, reserve_max_per_pos: 3,
  contract_max_years: 3, rookie_max_years: 2, last_contract_min_fraction: 0.5, last_contract_valid_months: 12, max_picks_per_round: 2, pick_horizon_years: 3, draft_rounds: 5,
  rank_bonus_1: 5, rank_bonus_2: 4, rank_bonus_3: 3, rank_bonus_4: 2, rank_bonus_5: 0, rank_bonus_6: -1, rank_bonus_7: -2, rank_bonus_8: -3,
  lottery_teams: 4,
}).map(([key, value]) => ({ key, value }));

const raw: RawLeague = {
  seasonYear: 2026,
  teams: [
    { id: "t1", name: "Alfa", owner_name: "A" },
    { id: "t2", name: "Beta", owner_name: "B" },
  ],
  settings: SETTING_ROWS,
  contracts: [
    { id: 1, team_id: "t1", slot: "starter", years_left: 2, team_option: false, salary: 30, restriction: null, is_rookie: true, players: { first_name: "", last_name: "Flagg", pos: "A", nba_team: null } },
    { id: 2, team_id: "t1", slot: "starter", years_left: 1, team_option: true, salary: 10.5, restriction: "unrestricted", is_rookie: false, players: { first_name: "Nikola", last_name: "Jokic", pos: "C", nba_team: "DEN" } },
    { id: 3, team_id: "t1", slot: "reserve", years_left: 1, team_option: false, salary: 6, restriction: null, is_rookie: false, players: { first_name: "", last_name: "Camara", pos: "A", nba_team: null } },
    { id: 4, team_id: "t2", slot: "starter", years_left: 1, team_option: false, salary: 260, restriction: null, is_rookie: false, players: null },
  ],
  cuts: [{ id: 1, team_id: "t1", player_id: 9, status: "cut", paid_salary: 3.5, years_left: 1, original_salary: null, original_slot: null, original_is_rookie: false, team_option: false, players: { first_name: "", last_name: "J.Collins", pos: "A", nba_team: null } }],
  talents: [],
  picks: [],
  teamSeason: [{ team_id: "t1", bonus: -2, final_rank: null, entry_fee_paid: true, luxury_tax_paid: false }],
  rookieDraft: [],
};

describe("buildLeague", () => {
  const league = buildLeague(raw);
  const alfa = league.teams[0];
  const beta = league.teams[1];

  it("calcola monte ingaggi (titolari + tagliati), spazio e riserve come il foglio", () => {
    expect(alfa.finance.payroll).toBe(44); // 30 + 10.5 + 3.5
    expect(alfa.finance.capSpace).toBe(204); // 250 - 2 - 44
    expect(alfa.finance.reserveSpace).toBe(74); // 80 - 6
  });

  it("ordina i titolari per ruolo e poi per stipendio", () => {
    expect(alfa.starters.map((p) => p.name)).toEqual(["Flagg", "Nikola Jokic"]);
  });

  it("segnala lo sforamento del cap e legge i parametri da league_settings", () => {
    expect(beta.finance.overCap).toBe(true);
    expect(league.settings.reserveBudget).toBe(80);
  });

  it("gestisce giocatore mancante e bonus assente", () => {
    expect(beta.starters[0].name).toBe("?");
    expect(beta.bonus).toBe(0);
  });
});

describe("helper", () => {
  it("etichetta contratto", () => {
    expect(contractLabel(1, true)).toBe("1+1");
    expect(contractLabel(2, false)).toBe("2");
    expect(contractLabel(0.5, false)).toBe("½");
    expect(contractLabel(null, false)).toBe("?"); // durata ancora da decidere
  });

  it("nome giocatore: provvisori hanno solo il cognome", () => {
    expect(playerName({ first_name: "", last_name: "F.Wagner", pos: null, nba_team: null })).toBe("F.Wagner");
  });

  it("settings da righe", () => {
    const rows = SETTING_ROWS.map((r) => (r.key === "starters_c" ? { ...r, value: 4 } : r));
    expect(settingsFromRows(rows).starters.C).toBe(4);
  });

  it("settings: una chiave mancante è un errore, non un default", () => {
    expect(() => settingsFromRows([{ key: "cap", value: 250 }])).toThrow(/reserve_budget/);
  });
});
