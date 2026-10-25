import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS as S,
  luxuryTaxEur,
  rosterWarnings,
  salaryFloor,
  teamFinance,
  type RosterEntry,
} from "./cap";

// Totali letti da Dunkest.xlsx / Foglio1 (stagione 2026): titolari, quota tagliati, riserve,
// e i valori calcolati dal foglio stesso (monte ingaggi, spazio salariale, spazio riserve, bonus).
const SHEET = [
  { team: "Assago Farmers", starters: 236.5, cuts: 3.5, reserves: 32.5, bonus: -2, monte: 240, spazio: 8, spazioRis: 47.5 },
  { team: "CUS Cosenza", starters: 231.5, cuts: 9, reserves: 6.5, bonus: -3, monte: 240.5, spazio: 6.5, spazioRis: 73.5 },
  { team: "Bol Bollerz", starters: 241, cuts: 0, reserves: 50, bonus: 5, monte: 241, spazio: 14, spazioRis: 30 },
  { team: "Dame Time", starters: 232, cuts: 3.5, reserves: 53.5, bonus: -1, monte: 235.5, spazio: 13.5, spazioRis: 26.5 },
  { team: "Atlanto Non Vinco", starters: 232, cuts: 0, reserves: 47, bonus: 3, monte: 232, spazio: 21, spazioRis: 33 },
  { team: "Spaccinos", starters: 185.5, cuts: 0, reserves: 26, bonus: 2, monte: 185.5, spazio: 66.5, spazioRis: 54 },
  { team: "OKCC", starters: 247, cuts: 0, reserves: 59.5, bonus: 4, monte: 247, spazio: 7, spazioRis: 20.5 },
  { team: "San Antonio", starters: 248, cuts: 1.5, reserves: 51.5, bonus: 0, monte: 249.5, spazio: 0.5, spazioRis: 28.5 },
];

const entry = (
  slot: RosterEntry["slot"],
  salary: number,
  position: RosterEntry["position"] = "G",
): RosterEntry => ({ slot, salary, position });

describe("teamFinance riproduce il foglio Excel", () => {
  it.each(SHEET)("$team", (t) => {
    const f = teamFinance(
      [entry("starter", t.starters), entry("reserve", t.reserves)],
      [{ salary: t.cuts }],
      t.bonus,
      S,
    );
    expect(f.payroll).toBe(t.monte);
    expect(f.capSpace).toBe(t.spazio);
    expect(f.reserveSpace).toBe(t.spazioRis);
    expect(f.overCap).toBe(false); // "BUDGET SFORATO" = NO per tutti
  });
});

// Foglio1 del 21/10/2026, dopo l'asta (docs/DATA-MODEL.md, "Numeri di riferimento"). Dame Time è l'unico sforato.
const SHEET_POST_AUCTION = [
  { team: "Assago Farmers", starters: 210.5, cuts: 3.5, reserves: 80, bonus: -2, monte: 214, spazio: 34, spazioRis: 0, tax: 0 },
  { team: "CUS Cosenza", starters: 234, cuts: 10.5, reserves: 55.5, bonus: -3, monte: 244.5, spazio: 2.5, spazioRis: 24.5, tax: 0 },
  { team: "Bol Bollerz", starters: 242, cuts: 0, reserves: 68.5, bonus: 5, monte: 242, spazio: 13, spazioRis: 11.5, tax: 0 },
  { team: "Dame Time", starters: 256.5, cuts: 3.5, reserves: 52, bonus: -1, monte: 260, spazio: -11, spazioRis: 28, tax: 2.75 },
  { team: "Atlanto Non Vinco", starters: 248, cuts: 1.5, reserves: 51.5, bonus: 3, monte: 249.5, spazio: 3.5, spazioRis: 28.5, tax: 0 },
  { team: "Spaccinos", starters: 240.5, cuts: 0, reserves: 64.5, bonus: 2, monte: 240.5, spazio: 11.5, spazioRis: 15.5, tax: 0 },
  { team: "OKCC", starters: 246, cuts: 0, reserves: 67.5, bonus: 4, monte: 246, spazio: 8, spazioRis: 12.5, tax: 0 },
  { team: "San Antonio", starters: 248, cuts: 1.5, reserves: 65, bonus: 0, monte: 249.5, spazio: 0.5, spazioRis: 15, tax: 0 },
];

describe("teamFinance sul foglio dopo l'asta", () => {
  it.each(SHEET_POST_AUCTION)("$team", (t) => {
    const f = teamFinance(
      [entry("starter", t.starters), entry("reserve", t.reserves)],
      [{ salary: t.cuts }],
      t.bonus,
      S,
    );
    expect(f.payroll).toBe(t.monte);
    expect(f.capSpace).toBe(t.spazio);
    expect(f.reserveSpace).toBe(t.spazioRis);
    expect(f.overCap).toBe(t.team === "Dame Time"); // "BUDGET SFORATO" = SI solo per Dame Time
    expect(f.belowFloor).toBe(false);
    expect(f.luxuryTaxEur).toBe(t.tax); // R-12 con soglia = cap effettivo: (260 - 249) / 4 = 2.75
  });
});

describe("regole", () => {
  it("floor = 200 con cap 250 (R-13)", () => expect(salaryFloor(S)).toBe(200));

  it("Spaccinos (185.5) è sotto il floor", () => {
    expect(teamFinance([entry("starter", 185.5)], [], 2, S).belowFloor).toBe(true);
  });

  it("luxury tax: 1 € ogni 4 crediti sopra il cap, max 20 crediti (R-12)", () => {
    expect(luxuryTaxEur(250, 250, S)).toBe(0);
    expect(luxuryTaxEur(258, 250, S)).toBe(2);
    expect(luxuryTaxEur(300, 250, S)).toBe(5);
  });

  it("sforamento segnalato", () => {
    expect(teamFinance([entry("starter", 255)], [], 0, S).overCap).toBe(true);
  });
});

describe("rosterWarnings", () => {
  it("rosa completa: nessun avviso", () => {
    const roster = [
      ...Array.from({ length: 5 }, () => entry("starter", 1, "G")),
      ...Array.from({ length: 5 }, () => entry("starter", 1, "A")),
      ...Array.from({ length: 3 }, () => entry("starter", 1, "C")),
      entry("reserve", 1, "G"),
      entry("reserve", 1, "A"),
      entry("reserve", 1, "C"),
    ];
    expect(rosterWarnings(roster, S)).toEqual([]);
  });

  it("segnala ruoli sbagliati e poche riserve", () => {
    const w = rosterWarnings([entry("starter", 1, "G"), entry("reserve", 1, "G")], S);
    expect(w).toContain("Titolari G: 1/5");
    expect(w).toContain("Riserve: 1 (min 3)");
  });

  it("ruolo sconosciuto non conta come guardia, ma conta nel totale titolari", () => {
    const complete = [
      ...Array.from({ length: 5 }, () => entry("starter", 1, "G")),
      ...Array.from({ length: 5 }, () => entry("starter", 1, "A")),
      ...Array.from({ length: 3 }, () => entry("starter", 1, "C")),
    ];
    const w = rosterWarnings([...complete, entry("starter", 1, null), entry("reserve", 1, null)], S);
    expect(w).toContain("Titolari: 14/13");
    expect(w).not.toContain("Titolari G: 5/5");
    expect(w).not.toContain("Riserve G: 1 (max 3)");
  });

  it("max 3 riserve per ruolo (R-03)", () => {
    const roster = Array.from({ length: 4 }, () => entry("reserve", 1, "A"));
    expect(rosterWarnings(roster, S)).toContain("Riserve A: 4 (max 3)");
  });
});
