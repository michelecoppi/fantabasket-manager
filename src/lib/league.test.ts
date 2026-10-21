import { describe, expect, it } from "vitest";
import { buildLeague, contractLabel, playerName, settingsFromRows, type RawLeague } from "./league";

const raw: RawLeague = {
  seasonYear: 2026,
  teams: [
    { id: "t1", name: "Alfa", owner_name: "A" },
    { id: "t2", name: "Beta", owner_name: "B" },
  ],
  settings: [{ key: "cap", value: 250 }],
  contracts: [
    { id: 1, team_id: "t1", slot: "starter", years_left: 2, team_option: false, salary: 30, restriction: "restricted", players: { first_name: "", last_name: "Flagg", pos: "A", nba_team: null } },
    { id: 2, team_id: "t1", slot: "starter", years_left: 1, team_option: true, salary: 10.5, restriction: "unrestricted", players: { first_name: "Nikola", last_name: "Jokic", pos: "C", nba_team: "DEN" } },
    { id: 3, team_id: "t1", slot: "reserve", years_left: 1, team_option: false, salary: 6, restriction: null, players: { first_name: "", last_name: "Camara", pos: "A", nba_team: null } },
    { id: 4, team_id: "t2", slot: "starter", years_left: 1, team_option: false, salary: 260, restriction: null, players: null },
  ],
  cuts: [{ id: 1, team_id: "t1", paid_salary: 3.5, years_left: 1, players: { first_name: "", last_name: "J.Collins", pos: "A", nba_team: null } }],
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

  it("segnala lo sforamento del cap e usa i default per i parametri mancanti", () => {
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
  });

  it("nome giocatore: provvisori hanno solo il cognome", () => {
    expect(playerName({ first_name: "", last_name: "F.Wagner", pos: null, nba_team: null })).toBe("F.Wagner");
  });

  it("settings da righe", () => {
    expect(settingsFromRows([{ key: "starters_c", value: 4 }]).starters.C).toBe(4);
  });
});
