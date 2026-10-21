import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS as S,
  contractDurations,
  contractTermsErrors,
  cutShare,
  evaluateSigning,
  evaluateTrade,
  teamOptionAllowed,
  type PickInfo,
  type TradeParty,
  type TradeSide,
} from "./cap";

const side = (bonus: number, roster: TradeSide["roster"], cuts: TradeSide["cuts"] = []): TradeSide => ({ roster, cuts, bonus });
const starter = (id: number, salary: number, position: "G" | "A" | "C" = "G") => ({ id, position, slot: "starter" as const, salary });
const party = (name: string, s: TradeSide, picks: PickInfo[] = [], gives: { contracts?: number[]; picks?: number[] } = {}): TradeParty => ({
  name,
  side: s,
  picks,
  gives: { contracts: new Set(gives.contracts ?? []), picks: new Set(gives.picks ?? []) },
});

describe("cutShare (R-42)", () => {
  it.each([
    [5, 1.5],
    [10, 3.5],
    [3, 1],
    [30, 10],
    [1, 0.5],
  ])("taglio di %s → quota %s", (salary, share) => expect(cutShare(salary)).toBe(share));
});

describe("durate e team option (R-20, R-22)", () => {
  it("durate: ½ e gli interi fino al massimo di lega", () => {
    expect(contractDurations(S)).toEqual([0.5, 1, 2, 3]);
    expect(contractDurations({ ...S, contractMaxYears: 2 })).toEqual([0.5, 1, 2]);
  });

  it("team option solo su 1 o 2 stagioni", () => {
    expect(teamOptionAllowed(1, S)).toBe(true);
    expect(teamOptionAllowed(2, S)).toBe(true);
    expect(teamOptionAllowed(3, S)).toBe(false);
    expect(teamOptionAllowed(0.5, S)).toBe(false);
    expect(teamOptionAllowed(null, S)).toBe(false);
  });

  it("errori sui termini del contratto", () => {
    const ok = { slot: "starter" as const, years: 2, teamOption: true, salary: 12.5 };
    expect(contractTermsErrors(ok, S)).toEqual([]);
    expect(contractTermsErrors({ ...ok, years: null, teamOption: false }, S)).toEqual([]); // durata da fissare
    expect(contractTermsErrors({ ...ok, salary: 0 }, S)).toHaveLength(1);
    expect(contractTermsErrors({ ...ok, salary: 3.25 }, S)).toHaveLength(1);
    expect(contractTermsErrors({ ...ok, years: 4, teamOption: false }, S)).toHaveLength(1);
    expect(contractTermsErrors({ ...ok, years: 3 }, S)).toHaveLength(1); // 3 anni + option > 3
    expect(contractTermsErrors({ ...ok, slot: "talent" }, S)).toHaveLength(1);
  });
});

describe("evaluateSigning", () => {
  it("avvisa (senza bloccare) se la firma fa sforare il cap", () => {
    const r = evaluateSigning(side(0, [starter(1, 240)]), { position: "A", slot: "starter", years: 1, teamOption: false, salary: 15 }, S);
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toMatch(/supera il cap/);
    expect(r.impact.after.payroll).toBe(255);
  });

  it("una riserva pesa sul budget riserve, non sul cap", () => {
    const r = evaluateSigning(side(0, [starter(1, 240)]), { position: "A", slot: "reserve", years: 1, teamOption: false, salary: 20 }, S);
    expect(r.impact.after.payroll).toBe(240);
    expect(r.impact.after.reserveSpace).toBe(60);
  });
});

describe("evaluateTrade (R-57, R-33)", () => {
  it("scambio alla pari: nessun errore, nessuno sfora", () => {
    const a = party("A", side(0, [starter(1, 20)]), [], { contracts: [1] });
    const b = party("B", side(0, [starter(2, 20)]), [], { contracts: [2] });
    const r = evaluateTrade(a, b, S);
    expect(r.errors).toEqual([]);
    expect(r.capBreakers).toEqual([]);
    expect(r.impacts[0].after.payroll).toBe(20);
  });

  it("segnala la squadra che con lo scambio sfora il cap", () => {
    const a = party("A", side(0, [starter(1, 10)]), [], { contracts: [1] });
    const b = party("B", side(0, [starter(2, 60), starter(3, 190)]), [], { contracts: [2] });
    // A: 10 → 60 (resta sotto 250). B: 250 → 200 (scende). Nessuno sfora.
    expect(evaluateTrade(a, b, S).capBreakers).toEqual([]);

    const c = party("C", side(0, [starter(1, 200)]), [], { contracts: [] });
    const d = party("D", side(0, [starter(2, 80)]), [], { contracts: [2] });
    const r = evaluateTrade(c, d, S); // C passa da 200 a 280
    expect(r.capBreakers).toEqual(["C"]);
    expect(r.impacts[0].after.overCap).toBe(true);
  });

  it("una squadra già sforata può scambiare solo se non aumenta il monte ingaggi", () => {
    const over = side(0, [starter(1, 260)]);
    expect(evaluateTrade(party("A", over, [], { contracts: [1] }), party("B", side(30, [starter(2, 250)]), [], { contracts: [2] }), S).capBreakers).toEqual([]);
    expect(evaluateTrade(party("A", over, [], { contracts: [1] }), party("B", side(30, [starter(2, 270)]), [], { contracts: [2] }), S).capBreakers).toEqual(["A"]);
  });

  it("scambio vuoto = errore; giocatore non della squadra = errore", () => {
    expect(evaluateTrade(party("A", side(0, [])), party("B", side(0, [])), S).errors).toContain("Lo scambio è vuoto.");
    const r = evaluateTrade(party("A", side(0, [starter(1, 5)]), [], { contracts: [99] }), party("B", side(0, [])), S);
    expect(r.errors.some((e) => e.includes("non appartiene a A"))).toBe(true);
  });

  it("solo pick: non incidono sul cap, ma max 2 per giro avvisa (R-33)", () => {
    const pick = (id: number, round = 1): PickInfo => ({ id, year: 2027, round, toConfirm: false });
    const a = party("A", side(0, []), [pick(1), pick(2)], { picks: [] });
    const b = party("B", side(0, []), [pick(3)], { picks: [3] });
    const r = evaluateTrade(a, b, S);
    expect(r.errors).toEqual([]);
    expect(r.capBreakers).toEqual([]);
    expect(r.warnings.some((w) => w.includes("A: 3 pick del 1° giro 2027"))).toBe(true);
  });

  it("avvisa se una pick ceduta è da confermare", () => {
    const a = party("A", side(0, []), [{ id: 1, year: 2026, round: 1, toConfirm: true }], { picks: [1] });
    expect(evaluateTrade(a, party("B", side(0, [])), S).warnings.some((w) => w.includes("da confermare"))).toBe(true);
  });
});
